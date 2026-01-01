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
      // Check if mitmdump is running on port 8888
      await execAsync(["pgrep", "-f", "mitmdump.*8888"])
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

    if (this.status === "active" || this.status === "starting") {
      // Stop proxy
      this.status = "stopping"
      this._notify()

      try {
        await execAsync(["pkill", "-f", "mitmdump.*8888"])
        // Remove flag file
        await execAsync(["rm", "-f", flagFile])
        await this._sendNotification("ProxyForge", "Proxy stopped")
      } catch (e) {
        console.error("Failed to stop proxy:", e)
      }
    } else {
      // Start proxy
      this.status = "starting"
      this._notify()

      try {
        // Create flag file
        await execAsync(["touch", flagFile])
        // Start proxyforge
        await execAsync([GLib.get_home_dir() + "/.local/bin/proxyforge"])
        await this._sendNotification("ProxyForge", "Proxy started")
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
    } catch {
      // Ignore notification errors
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
