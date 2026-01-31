import GLib from "gi://GLib"
import { execAsync } from "ags/process"

export type ProxyStatus = "active" | "starting" | "stopping" | "off"

class ProxyForgeService {
  private static _instance: ProxyForgeService | null = null

  status: ProxyStatus = "off"
  private _listeners: Set<() => void> = new Set()
  private _statusTimer: number | null = null

  static get_default(): ProxyForgeService {
    if (!this._instance) {
      this._instance = new ProxyForgeService()
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

  async refresh(): Promise<void> {
    try {
      // Check if mitmdump is running in local mode (eBPF transparent)
      await execAsync(["pgrep", "-f", "mitmdump.*local:"])
      this.status = "active"
    } catch {
      // Check if flag file exists (starting/stopping state)
      const flagFile = GLib.get_home_dir() + "/.cache/proxyforge-enabled"
      if (GLib.file_test(flagFile, GLib.FileTest.EXISTS)) {
        this.status = "starting"
      } else {
        this.status = "off"
      }
    }
    this._notify()
  }

  async toggle(): Promise<void> {
    const flagFile = GLib.get_home_dir() + "/.cache/proxyforge-enabled"
    const proxyForgePath = GLib.get_home_dir() + "/dev/proxyforge/proxyforge.py"
    // Default targets: claude (CLI), claude- (Desktop), codex, node (for various tools)
    const localTargets = GLib.getenv("PROXYFORGE_TARGETS") || "claude,codex,node"

    if (this.status === "active" || this.status === "starting") {
      // Stop proxy - kill the mitmproxy process
      this.status = "stopping"
      this._notify()

      try {
        // Kill mitmproxy local mode process
        await execAsync(["pkill", "-f", "mitmdump.*local:"])
        // Remove flag file
        await execAsync(["rm", "-f", flagFile])
        await this._sendNotification("ProxyForge", "eBPF interception stopped")
      } catch (e) {
        console.error("Failed to stop proxy:", e)
      }
    } else {
      // Start proxy in eBPF local mode (transparent interception)
      this.status = "starting"
      this._notify()

      try {
        // Create flag file
        await execAsync(["touch", flagFile])
        // Start proxyforge in eBPF local mode (requires pkexec for sudo)
        await execAsync([
          "pkexec",
          "python3",
          proxyForgePath,
          "--mode", `local:${localTargets}`
        ])
        await this._sendNotification("ProxyForge", `eBPF intercepting: ${localTargets}`)
      } catch (e) {
        console.error("Failed to start proxy:", e)
      }
    }

    // Refresh status after a delay
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this.refresh()
      return GLib.SOURCE_REMOVE
    })
  }

  async openViewer(): Promise<void> {
    try {
      // Start the viewer if not running and open browser
      await execAsync(["xdg-open", "http://localhost:3001"])
    } catch (e) {
      console.error("Failed to open viewer:", e)
    }
  }

  private async _sendNotification(title: string, body: string): Promise<void> {
    try {
      await execAsync(["notify-send", title, body])
    } catch (e) {
      console.warn("Failed to send notification:", e)
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

export default ProxyForgeService
