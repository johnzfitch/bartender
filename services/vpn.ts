import GLib from "gi://GLib"
import { execAsync } from "ags/process"

export interface VpnStatus {
  connected: boolean
  connecting: boolean
  location: string
  ip: string
}

class VpnService {
  private static _instance: VpnService | null = null

  status: VpnStatus = {
    connected: false,
    connecting: false,
    location: "",
    ip: "",
  }
  rotating: boolean = false

  private _listeners: Set<() => void> = new Set()
  private _statusTimer: number | null = null
  private _rotationTimer: number | null = null

  // Rotation locations
  private readonly LOCATIONS = ["us", "ca"]
  private _currentLocationIndex = 0

  static get_default(): VpnService {
    if (!this._instance) {
      this._instance = new VpnService()
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
      const result = await execAsync(["mullvad", "status"])

      // Parse mullvad status output
      const connected = result.includes("Connected")
      const connecting = result.includes("Connecting")

      let location = ""
      let ip = ""

      // Extract location (e.g., "Visible location: United States, New York")
      const locationMatch = result.match(/Visible location:\s*(.+)/i)
      if (locationMatch) {
        location = locationMatch[1].trim()
      }

      // Extract IP
      const ipMatch = result.match(/IPv4:\s*(\d+\.\d+\.\d+\.\d+)/i)
      if (ipMatch) {
        ip = ipMatch[1]
      }

      this.status = { connected, connecting, location, ip }
    } catch (e) {
      console.error("VPN status error:", e)
      this.status = {
        connected: false,
        connecting: false,
        location: "",
        ip: "",
      }
    }

    this._notify()
  }

  async openApp(): Promise<void> {
    try {
      await execAsync(["/opt/Mullvad VPN/mullvad-vpn"])
    } catch (e) {
      console.error("Failed to open Mullvad:", e)
    }
  }

  toggleRotation(): void {
    if (this.rotating) {
      this._stopRotation()
    } else {
      this._startRotation()
    }
    this._notify()
  }

  private _startRotation(): void {
    this.rotating = true

    // Rotate immediately
    this._rotate()

    // Then every 20 seconds
    this._rotationTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20000, () => {
      if (this.rotating) {
        this._rotate()
        return GLib.SOURCE_CONTINUE
      }
      return GLib.SOURCE_REMOVE
    })
  }

  private _stopRotation(): void {
    this.rotating = false
    if (this._rotationTimer) {
      GLib.source_remove(this._rotationTimer)
      this._rotationTimer = null
    }
  }

  private async _rotate(): Promise<void> {
    // Pick random location
    const location = this.LOCATIONS[Math.floor(Math.random() * this.LOCATIONS.length)]

    try {
      await execAsync(["mullvad", "relay", "set", "location", location])
      await execAsync(["mullvad", "reconnect"])
    } catch (e) {
      console.error("VPN rotation error:", e)
    }
  }

  private _startStatusLoop(): void {
    // Initial fetch
    this.refresh()

    // Refresh every 5 seconds
    this._statusTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
      this.refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  destroy(): void {
    if (this._statusTimer) {
      GLib.source_remove(this._statusTimer)
    }
    this._stopRotation()
  }
}

export default VpnService
