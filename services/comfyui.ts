import GLib from "gi://GLib"
import { execAsync } from "ags/process"
import ConfigService, { expandPath } from "./config"

export type ComfyUIStatus = "running" | "starting" | "stopping" | "stopped"

class ComfyUIService {
  private static _instance: ComfyUIService | null = null

  status: ComfyUIStatus = "stopped"
  cpuPercent = 0
  gpuPercent = 0
  private _listeners: Set<() => void> = new Set()
  private _statusTimer: number | null = null

  static get_default(): ComfyUIService {
    if (!this._instance) {
      this._instance = new ComfyUIService()
    }
    return this._instance
  }

  private constructor() {
    this._startStatusLoop()
  }

  subscribe(callback: () => void): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  private _notify(): void {
    this._listeners.forEach((cb) => cb())
  }

  private _getConfig() {
    return ConfigService.get_default().config.comfyui
  }

  private _comfyDir(): string {
    return expandPath(this._getConfig().dir)
  }

  private _comfyPort(): string {
    return String(this._getConfig().port)
  }

  private _comfyUrl(): string {
    const cfg = this._getConfig()
    return cfg.url || `http://127.0.0.1:${cfg.port}`
  }

  private _pidPath(): string {
    return `${this._comfyDir()}/server.pid`
  }

  private _logPath(): string {
    return `${this._comfyDir()}/server.log`
  }

  private _extraModelPaths(): string {
    const cfg = this._getConfig()
    if (cfg.model_paths) return expandPath(cfg.model_paths)
    return `${this._comfyDir()}/extra_model_paths.yml`
  }

  private _pythonPath(): string {
    const cfg = this._getConfig()
    if (cfg.python) {
      const configPath = expandPath(cfg.python)
      if (GLib.file_test(configPath, GLib.FileTest.EXISTS)) return configPath
    }

    const venv312 = `${this._comfyDir()}/venv312/bin/python`
    if (GLib.file_test(venv312, GLib.FileTest.EXISTS)) return venv312

    const venv = `${this._comfyDir()}/venv/bin/python`
    if (GLib.file_test(venv, GLib.FileTest.EXISTS)) return venv

    return "python"
  }

  private _shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
  }

  private async _readPid(): Promise<number | null> {
    const pidPath = this._shellEscape(this._pidPath())
    try {
      const out = (await execAsync(["bash", "-lc", `cat ${pidPath}`])).trim()
      const pid = Number.parseInt(out, 10)
      return Number.isNaN(pid) ? null : pid
    } catch {
      return null
    }
  }

  private async _isPidRunning(pid: number): Promise<boolean> {
    try {
      await execAsync(["bash", "-lc", `kill -0 ${pid} 2>/dev/null`])
      return true
    } catch {
      return false
    }
  }

  private async _getCpuPercent(pid: number): Promise<number> {
    try {
      const out = (await execAsync(["ps", "-p", `${pid}`, "-o", "%cpu="])).trim()
      const value = Number.parseFloat(out)
      if (Number.isNaN(value)) return 0
      return Math.round(value)
    } catch {
      return 0
    }
  }

  private async _getGpuPercent(pid: number): Promise<number> {
    // Try per-process SM utilization from nvidia-smi pmon
    try {
      const out = await execAsync(["nvidia-smi", "pmon", "-c", "1"])
      const lines = out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))

      let total = 0
      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length < 5) continue
        const linePid = Number.parseInt(parts[1], 10)
        if (Number.isNaN(linePid) || linePid !== pid) continue
        const sm = parts[3]
        if (sm && sm !== "-") {
          const value = Number.parseInt(sm, 10)
          if (!Number.isNaN(value)) total += value
        }
      }

      if (total > 0) return Math.min(total, 100)
    } catch {
      // Fall through to GPU-wide utilization
    }

    try {
      const out = (await execAsync([
        "nvidia-smi",
        "--query-gpu=utilization.gpu",
        "--format=csv,noheader,nounits",
      ])).trim()
      const value = Number.parseInt(out, 10)
      if (Number.isNaN(value)) return 0
      return Math.min(Math.max(value, 0), 100)
    } catch {
      return 0
    }
  }

  private _defaultStartCommand(): string {
    const python = this._shellEscape(this._pythonPath())
    const comfyDir = this._shellEscape(this._comfyDir())
    const extraPaths = this._shellEscape(this._extraModelPaths())
    const logPath = this._shellEscape(this._logPath())
    const pidPath = this._shellEscape(this._pidPath())
    const port = this._shellEscape(this._comfyPort())
    const mainPy = `${comfyDir}/main.py`

    return [
      "nohup",
      python,
      mainPy,
      "--listen",
      "127.0.0.1",
      "--port",
      port,
      "--cuda-malloc",
      "--extra-model-paths-config",
      extraPaths,
      "--log-stdout",
      ">",
      logPath,
      "2>&1",
      "&",
      "echo",
      "$!",
      ">",
      pidPath,
    ].join(" ")
  }

  private _startCommand(): string {
    const cfg = this._getConfig()
    return cfg.start_cmd || this._defaultStartCommand()
  }

  private async _checkRunning(): Promise<{ running: boolean; pid: number | null }> {
    const pid = await this._readPid()
    if (!pid) return { running: false, pid: null }
    const running = await this._isPidRunning(pid)
    return { running, pid }
  }

  async refresh(): Promise<void> {
    const { running, pid } = await this._checkRunning()
    this.status = running ? "running" : "stopped"
    if (running && pid) {
      const [cpu, gpu] = await Promise.all([
        this._getCpuPercent(pid),
        this._getGpuPercent(pid),
      ])
      this.cpuPercent = cpu
      this.gpuPercent = gpu
    } else {
      this.cpuPercent = 0
      this.gpuPercent = 0
    }
    this._notify()
  }

  async toggle(): Promise<void> {
    if (this.status === "running" || this.status === "starting") {
      this.status = "stopping"
      this._notify()
      await this._stop()
    } else {
      this.status = "starting"
      this._notify()
      await this._start()
    }

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this.refresh()
      return GLib.SOURCE_REMOVE
    })
  }

  private async _start(): Promise<void> {
    try {
      await execAsync(["bash", "-lc", this._startCommand()])
    } catch (e) {
      console.error("Failed to start ComfyUI:", e)
    }
  }

  private async _stop(): Promise<void> {
    const pidPath = this._shellEscape(this._pidPath())
    const cmd = `if [ -f ${pidPath} ]; then kill \"$(cat ${pidPath})\" 2>/dev/null || true; rm -f ${pidPath}; fi`
    try {
      await execAsync(["bash", "-lc", cmd])
    } catch (e) {
      console.error("Failed to stop ComfyUI:", e)
    }
  }

  async openUI(): Promise<void> {
    try {
      await execAsync(["xdg-open", this._comfyUrl()])
    } catch (e) {
      console.error("Failed to open ComfyUI:", e)
    }
  }

  private _startStatusLoop(): void {
    this.refresh()
    this._statusTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
      this.refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  destroy(): void {
    if (this._statusTimer) {
      GLib.source_remove(this._statusTimer)
    }
  }
}

export default ComfyUIService
