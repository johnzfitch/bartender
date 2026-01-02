import GLib from "gi://GLib"
import Gio from "gi://Gio"

export interface WidgetConfig {
  enabled?: boolean
  [key: string]: any
}

export interface LayoutConfig {
  left: string[]
  center: string[]
  right: string[]
}

export interface NotificationsConfig {
  monitor: "primary" | "focused" | number
  groupByApp: boolean
}

export interface Config {
  layout: LayoutConfig
  widgets: Record<string, WidgetConfig>
  notifications: NotificationsConfig
}

const DEFAULT_CONFIG: Config = {
  layout: {
    left: ["workspaces"],
    center: ["feed"],
    right: ["tray", "audio", "volume", "proxyforge", "vpn", "clock"],
  },
  widgets: {
    workspaces: { enabled: true },
    feed: { enabled: true },
    tray: { enabled: true },
    audio: { enabled: true, card: 3 },
    volume: { enabled: true },
    proxyforge: { enabled: true },
    vpn: { enabled: true },
    clock: { enabled: true, format: "%a %b %d %l:%M %p" },
    weather: { enabled: false, location: "auto", units: "imperial" },
    wifi: { enabled: false },
    bluetooth: { enabled: false },
  },
  notifications: {
    monitor: "primary",
    groupByApp: true,
  },
}

const CONFIG_DIR = `${GLib.get_home_dir()}/.config/bartender`
const CONFIG_PATH = `${CONFIG_DIR}/config.json`

class ConfigService {
  private static _instance: ConfigService | null = null

  config: Config = DEFAULT_CONFIG
  private _listeners: Set<() => void> = new Set()
  private _monitor: Gio.FileMonitor | null = null

  static get_default(): ConfigService {
    if (!this._instance) {
      this._instance = new ConfigService()
    }
    return this._instance
  }

  private constructor() {
    this._ensureConfigDir()
    this._load()
    this._watchConfig()
  }

  subscribe(callback: () => void): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  private _notify(): void {
    this._listeners.forEach((cb) => cb())
  }

  private _ensureConfigDir(): void {
    const dir = Gio.File.new_for_path(CONFIG_DIR)
    if (!dir.query_exists(null)) {
      try {
        dir.make_directory_with_parents(null)
      } catch (e) {
        console.warn(`Failed to create config directory: ${e}`)
      }
    }
  }

  private _load(): void {
    const file = Gio.File.new_for_path(CONFIG_PATH)

    if (!file.query_exists(null)) {
      this._writeDefaultConfig()
      this.config = DEFAULT_CONFIG
      return
    }

    try {
      const [success, contents] = file.load_contents(null)
      if (!success) {
        console.warn("Failed to read config file, using defaults")
        this.config = DEFAULT_CONFIG
        return
      }

      const decoder = new TextDecoder()
      const raw = decoder.decode(contents)
      // Strip comments for JSONC support (single-line only)
      const stripped = raw
        .split("\n")
        .map((line) => {
          const commentIdx = line.indexOf("//")
          return commentIdx >= 0 ? line.slice(0, commentIdx) : line
        })
        .join("\n")

      const parsed = JSON.parse(stripped)
      this.config = this._validateConfig(parsed)
    } catch (e) {
      console.warn(`Config load failed: ${e}, using defaults`)
      this.config = DEFAULT_CONFIG
    }
  }

  private _validateConfig(parsed: any): Config {
    const result: Config = { ...DEFAULT_CONFIG }

    // Validate layout
    if (parsed.layout && typeof parsed.layout === "object") {
      if (Array.isArray(parsed.layout.left)) {
        result.layout.left = parsed.layout.left.filter(
          (w: any) => typeof w === "string"
        )
      }
      if (Array.isArray(parsed.layout.center)) {
        result.layout.center = parsed.layout.center.filter(
          (w: any) => typeof w === "string"
        )
      }
      if (Array.isArray(parsed.layout.right)) {
        result.layout.right = parsed.layout.right.filter(
          (w: any) => typeof w === "string"
        )
      }
    }

    // Validate widgets - merge with defaults
    if (parsed.widgets && typeof parsed.widgets === "object") {
      for (const [name, cfg] of Object.entries(parsed.widgets)) {
        if (typeof cfg === "object" && cfg !== null) {
          result.widgets[name] = {
            ...DEFAULT_CONFIG.widgets[name],
            ...(cfg as WidgetConfig),
          }
        }
      }
    }

    // Validate notifications
    if (parsed.notifications && typeof parsed.notifications === "object") {
      const n = parsed.notifications
      if (
        n.monitor === "primary" ||
        n.monitor === "focused" ||
        typeof n.monitor === "number"
      ) {
        result.notifications.monitor = n.monitor
      }
      if (typeof n.groupByApp === "boolean") {
        result.notifications.groupByApp = n.groupByApp
      }
    }

    return result
  }

  private _writeDefaultConfig(): void {
    const configStr = JSON.stringify(DEFAULT_CONFIG, null, 2)

    try {
      // Use GLib.file_set_contents for simpler file writing
      GLib.file_set_contents(CONFIG_PATH, configStr)
    } catch (e) {
      console.warn(`Failed to write default config: ${e}`)
    }
  }

  private _watchConfig(): void {
    const file = Gio.File.new_for_path(CONFIG_PATH)
    try {
      this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null)
      this._monitor.connect("changed", (_monitor, _file, _otherFile, eventType) => {
        if (
          eventType === Gio.FileMonitorEvent.CHANGED ||
          eventType === Gio.FileMonitorEvent.CREATED
        ) {
          // Debounce rapid changes
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            console.log("Config file changed, reloading...")
            this._load()
            this._notify()
            return GLib.SOURCE_REMOVE
          })
        }
      })
    } catch (e) {
      console.warn(`Failed to watch config file: ${e}`)
    }
  }

  // Helper to check if a widget is enabled
  isEnabled(name: string): boolean {
    const cfg = this.config.widgets[name]
    return cfg?.enabled !== false
  }

  // Get widget-specific config
  getWidgetConfig<T extends WidgetConfig>(name: string): T | undefined {
    return this.config.widgets[name] as T | undefined
  }

  destroy(): void {
    if (this._monitor) {
      this._monitor.cancel()
      this._monitor = null
    }
  }
}

export default ConfigService
