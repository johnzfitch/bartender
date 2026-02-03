import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { parse as parseToml } from "smol-toml"

// Flattened config interfaces - no nested widgets.feed.url anymore
export interface LayoutConfig {
  left: string[]
  center: string[]
  right: string[]
}

export interface FeedConfig {
  url: string
  auth_token?: string
  debug_log?: boolean
  display_min?: number
  display_max?: number
  epsilon?: number
  diversity_half_life?: number
  refresh_interval?: number
  actualize_base_url?: string
  actualize_feed_ids?: string
  cache_size?: number
  initial_load_days?: number
  incremental_hours?: number
  enable_incremental?: boolean
}

export interface AudioConfig {
  card: number
}

export interface ComfyUIConfig {
  dir: string
  port: number
  url?: string
  python?: string
  model_paths?: string
  start_cmd?: string
}

export interface ProxyForgeConfig {
  targets: string
}

export interface NotificationsConfig {
  monitor: "primary" | "focused" | number
  groupByApp: boolean
}

export interface ClockConfig {
  format: string
}

export interface WeatherConfig {
  location: string
  units: "imperial" | "metric"
}

// Widget enable/disable flags
export interface WidgetsConfig {
  workspaces?: boolean
  feed?: boolean
  tray?: boolean
  audio?: boolean
  volume?: boolean
  comfyui?: boolean
  proxyforge?: boolean
  vpn?: boolean
  clock?: boolean
  weather?: boolean
  wifi?: boolean
  bluetooth?: boolean
  sysmon?: boolean
  audiomixer?: boolean
}

export interface Config {
  layout: LayoutConfig
  feed: FeedConfig
  audio: AudioConfig
  comfyui: ComfyUIConfig
  proxyforge: ProxyForgeConfig
  notifications: NotificationsConfig
  clock: ClockConfig
  weather: WeatherConfig
  widgets: WidgetsConfig
}

const DEFAULT_CONFIG: Config = {
  layout: {
    left: ["workspaces"],
    center: ["feed"],
    right: ["tray", "audio", "volume", "sysmon", "comfyui", "proxyforge", "vpn", "clock"],
  },
  feed: {
    url: "",
    auth_token: "",
    debug_log: false,
    display_min: 6,
    display_max: 15,
    epsilon: 0.15,
    diversity_half_life: 1200,
    refresh_interval: 21600,
    actualize_base_url: "",
    actualize_feed_ids: "",
    cache_size: 1000,
    initial_load_days: 30,
    incremental_hours: 6,
    enable_incremental: true,
  },
  audio: {
    card: 3,
  },
  comfyui: {
    dir: "~/ComfyUI",
    port: 8188,
  },
  proxyforge: {
    targets: "claude,codex,node",
  },
  notifications: {
    monitor: "primary",
    groupByApp: true,
  },
  clock: {
    format: "%a %b %d %l:%M %p",
  },
  weather: {
    location: "auto",
    units: "imperial",
  },
  widgets: {
    workspaces: true,
    feed: true,
    tray: true,
    audio: true,
    volume: true,
    comfyui: true,
    proxyforge: true,
    vpn: true,
    clock: true,
    weather: true,
    wifi: true,
    bluetooth: true,
    sysmon: true,
    audiomixer: true,
  },
}

const CONFIG_DIR = `${GLib.get_home_dir()}/.config/bartender`
export const CONFIG_TOML_PATH = `${CONFIG_DIR}/config.toml`
const CONFIG_JSON_PATH = `${CONFIG_DIR}/config.json` // Old path for migration
const CONFIG_ENV_PATH = `${CONFIG_DIR}/.env` // Old env file for migration

/**
 * Expand tilde (~) to home directory in paths
 * Required because TOML is not sourced by bash, so tilde won't expand automatically
 */
export function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return `${GLib.get_home_dir()}${path.slice(1)}`
  }
  return path
}

class ConfigService {
  private static _instance: ConfigService | null = null

  config: Config = DEFAULT_CONFIG
  private _listeners: Set<() => void> = new Set()
  private _monitor: Gio.FileMonitor | null = null
  private _reloadTimer: number | null = null

  static get_default(): ConfigService {
    if (!this._instance) {
      this._instance = new ConfigService()
    }
    return this._instance
  }

  private constructor() {
    this._ensureConfigDir()
    this._migrateIfNeeded()
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

  /**
   * Strip // comments from JSON while respecting strings
   * (naive line.indexOf("//") would break URLs like https://...)
   */
  private _stripJsonComments(json: string): string {
    let result = ""
    let inString = false
    let i = 0

    while (i < json.length) {
      const char = json[i]

      // Handle string boundaries
      if (char === '"' && (i === 0 || json[i - 1] !== "\\")) {
        inString = !inString
        result += char
        i++
        continue
      }

      // Check for // comments only outside strings
      if (!inString && char === "/" && json[i + 1] === "/") {
        // Skip to end of line
        while (i < json.length && json[i] !== "\n") {
          i++
        }
        continue
      }

      result += char
      i++
    }

    return result
  }

  /**
   * Parse .env file format (KEY=VALUE lines)
   */
  private _parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {}
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
    return env
  }

  /**
   * Migrate old config.json and .env to config.toml on first run
   */
  private _migrateIfNeeded(): void {
    const tomlFile = Gio.File.new_for_path(CONFIG_TOML_PATH)
    const jsonFile = Gio.File.new_for_path(CONFIG_JSON_PATH)
    const envFile = Gio.File.new_for_path(CONFIG_ENV_PATH)

    // Only migrate if TOML doesn't exist
    if (tomlFile.query_exists(null)) {
      return
    }

    // Check what we need to migrate
    const hasJson = jsonFile.query_exists(null)
    const hasEnv = envFile.query_exists(null)

    if (!hasJson && !hasEnv) {
      return // Nothing to migrate
    }

    console.log("[Config] Migrating legacy config to config.toml...")

    try {
      // Start with default config
      let newConfig: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG))

      // Migrate config.json if it exists
      if (hasJson) {
        try {
          const [success, contents] = jsonFile.load_contents(null)
          if (success) {
            const decoder = new TextDecoder()
            const raw = decoder.decode(contents)
            const stripped = this._stripJsonComments(raw)
            const oldConfig = JSON.parse(stripped)
            newConfig = this._migrateOldConfig(oldConfig)
          }
        } catch (e) {
          console.warn(`[Config] Failed to parse config.json: ${e}`)
        }
      }

      // Migrate .env values (override config.json values)
      if (hasEnv) {
        try {
          const [success, contents] = envFile.load_contents(null)
          if (success) {
            const decoder = new TextDecoder()
            const env = this._parseEnvFile(decoder.decode(contents))

            // Map env vars to config
            if (env.FRESHRSS_API_URL) newConfig.feed.url = env.FRESHRSS_API_URL
            if (env.FRESHRSS_AUTH_TOKEN) {
              newConfig.feed.auth_token = `GoogleLogin auth=${env.FRESHRSS_AUTH_TOKEN}`
            }
            if (env.AUDIO_CARD) {
              const card = parseInt(env.AUDIO_CARD, 10)
              if (!isNaN(card)) newConfig.audio.card = card
            }
            if (env.COMFYUI_DIR) newConfig.comfyui.dir = env.COMFYUI_DIR
            if (env.COMFYUI_PORT) {
              const port = parseInt(env.COMFYUI_PORT, 10)
              if (!isNaN(port)) newConfig.comfyui.port = port
            }
            if (env.COMFYUI_URL) newConfig.comfyui.url = env.COMFYUI_URL
            if (env.COMFYUI_PYTHON) newConfig.comfyui.python = env.COMFYUI_PYTHON
            if (env.COMFYUI_MODEL_PATHS) newConfig.comfyui.model_paths = env.COMFYUI_MODEL_PATHS
            if (env.COMFYUI_START_CMD) newConfig.comfyui.start_cmd = env.COMFYUI_START_CMD
            if (env.PROXYFORGE_TARGETS) newConfig.proxyforge.targets = env.PROXYFORGE_TARGETS

            console.log("[Config] Migrated .env values")
          }
        } catch (e) {
          console.warn(`[Config] Failed to parse .env: ${e}`)
        }
      }

      // Write new TOML config
      this._writeTomlConfig(newConfig)

      // Backup old files
      if (hasJson) {
        try {
          jsonFile.move(
            Gio.File.new_for_path(`${CONFIG_JSON_PATH}.bak`),
            Gio.FileCopyFlags.OVERWRITE,
            null,
            null
          )
        } catch {}
      }
      if (hasEnv) {
        try {
          envFile.move(
            Gio.File.new_for_path(`${CONFIG_ENV_PATH}.bak`),
            Gio.FileCopyFlags.OVERWRITE,
            null,
            null
          )
        } catch {}
      }

      console.log("[Config] Migration complete")
    } catch (e) {
      console.warn(`[Config] Migration failed: ${e}`)
    }
  }

  /**
   * Convert old nested config structure to new flat structure
   */
  private _migrateOldConfig(old: any): Config {
    // Deep clone to avoid mutating DEFAULT_CONFIG
    const result: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG))

    // Migrate layout
    if (old.layout) {
      if (Array.isArray(old.layout.left)) result.layout.left = old.layout.left
      if (Array.isArray(old.layout.center)) result.layout.center = old.layout.center
      if (Array.isArray(old.layout.right)) result.layout.right = old.layout.right
    }

    // Migrate nested widgets config to flat sections
    if (old.widgets) {
      // Extract feed config
      if (old.widgets.feed) {
        if (old.widgets.feed.url) result.feed.url = old.widgets.feed.url
        result.widgets.feed = old.widgets.feed.enabled !== false
      }

      // Extract audio config
      if (old.widgets.audio) {
        if (typeof old.widgets.audio.card === "number") {
          result.audio.card = old.widgets.audio.card
        }
        result.widgets.audio = old.widgets.audio.enabled !== false
      }

      // Extract clock config
      if (old.widgets.clock) {
        if (old.widgets.clock.format) result.clock.format = old.widgets.clock.format
        result.widgets.clock = old.widgets.clock.enabled !== false
      }

      // Extract weather config
      if (old.widgets.weather) {
        if (old.widgets.weather.location) result.weather.location = old.widgets.weather.location
        if (old.widgets.weather.units) result.weather.units = old.widgets.weather.units
        result.widgets.weather = old.widgets.weather.enabled !== false
      }

      // Migrate simple enabled flags
      const simpleWidgets = ["workspaces", "tray", "volume", "comfyui", "proxyforge", "vpn", "wifi", "bluetooth", "sysmon", "audiomixer"]
      for (const name of simpleWidgets) {
        if (old.widgets[name]) {
          result.widgets[name as keyof WidgetsConfig] = old.widgets[name].enabled !== false
        }
      }
    }

    // Migrate notifications
    if (old.notifications) {
      if (old.notifications.monitor !== undefined) {
        result.notifications.monitor = old.notifications.monitor
      }
      if (typeof old.notifications.groupByApp === "boolean") {
        result.notifications.groupByApp = old.notifications.groupByApp
      }
    }

    return result
  }

  private _load(): void {
    const file = Gio.File.new_for_path(CONFIG_TOML_PATH)

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
      const parsed = parseToml(raw)
      this.config = this._validateConfig(parsed)
    } catch (e) {
      console.warn(`Config load failed: ${e}, using defaults`)
      this.config = DEFAULT_CONFIG
    }
  }

  private _validateConfig(parsed: any): Config {
    const result: Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) // Deep clone

    // Validate layout
    if (parsed.layout && typeof parsed.layout === "object") {
      if (Array.isArray(parsed.layout.left)) {
        result.layout.left = parsed.layout.left.filter((w: any) => typeof w === "string")
      }
      if (Array.isArray(parsed.layout.center)) {
        result.layout.center = parsed.layout.center.filter((w: any) => typeof w === "string")
      }
      if (Array.isArray(parsed.layout.right)) {
        result.layout.right = parsed.layout.right.filter((w: any) => typeof w === "string")
      }
    }

    // Validate feed
    if (parsed.feed && typeof parsed.feed === "object") {
      if (typeof parsed.feed.url === "string") result.feed.url = parsed.feed.url
      if (typeof parsed.feed.auth_token === "string") result.feed.auth_token = parsed.feed.auth_token
      if (typeof parsed.feed.debug_log === "boolean") result.feed.debug_log = parsed.feed.debug_log
      if (typeof parsed.feed.display_min === "number" && parsed.feed.display_min > 0) {
        result.feed.display_min = parsed.feed.display_min
      }
      if (typeof parsed.feed.display_max === "number" && parsed.feed.display_max > 0) {
        result.feed.display_max = parsed.feed.display_max
      }
      if (typeof parsed.feed.epsilon === "number" && parsed.feed.epsilon >= 0 && parsed.feed.epsilon <= 1) {
        result.feed.epsilon = parsed.feed.epsilon
      }
      if (typeof parsed.feed.diversity_half_life === "number" && parsed.feed.diversity_half_life > 0) {
        result.feed.diversity_half_life = parsed.feed.diversity_half_life
      }
      if (typeof parsed.feed.refresh_interval === "number" && parsed.feed.refresh_interval >= 30) {
        result.feed.refresh_interval = parsed.feed.refresh_interval
      }
      if (typeof parsed.feed.actualize_base_url === "string") {
        result.feed.actualize_base_url = parsed.feed.actualize_base_url
      }
      if (typeof parsed.feed.actualize_feed_ids === "string") {
        result.feed.actualize_feed_ids = parsed.feed.actualize_feed_ids
      }
      if (typeof parsed.feed.cache_size === "number" && parsed.feed.cache_size > 0) {
        result.feed.cache_size = parsed.feed.cache_size
      }
      if (typeof parsed.feed.initial_load_days === "number" && parsed.feed.initial_load_days > 0) {
        result.feed.initial_load_days = parsed.feed.initial_load_days
      }
      if (typeof parsed.feed.incremental_hours === "number" && parsed.feed.incremental_hours > 0) {
        result.feed.incremental_hours = parsed.feed.incremental_hours
      }
      if (typeof parsed.feed.enable_incremental === "boolean") {
        result.feed.enable_incremental = parsed.feed.enable_incremental
      }
    }

    // Validate audio
    if (parsed.audio && typeof parsed.audio === "object") {
      if (typeof parsed.audio.card === "number") result.audio.card = parsed.audio.card
    }

    // Validate comfyui
    if (parsed.comfyui && typeof parsed.comfyui === "object") {
      if (typeof parsed.comfyui.dir === "string") result.comfyui.dir = parsed.comfyui.dir
      if (typeof parsed.comfyui.port === "number") result.comfyui.port = parsed.comfyui.port
      if (typeof parsed.comfyui.url === "string") result.comfyui.url = parsed.comfyui.url
      if (typeof parsed.comfyui.python === "string") result.comfyui.python = parsed.comfyui.python
      if (typeof parsed.comfyui.model_paths === "string") result.comfyui.model_paths = parsed.comfyui.model_paths
      if (typeof parsed.comfyui.start_cmd === "string") result.comfyui.start_cmd = parsed.comfyui.start_cmd
    }

    // Validate proxyforge
    if (parsed.proxyforge && typeof parsed.proxyforge === "object") {
      if (typeof parsed.proxyforge.targets === "string") result.proxyforge.targets = parsed.proxyforge.targets
    }

    // Validate notifications
    if (parsed.notifications && typeof parsed.notifications === "object") {
      const n = parsed.notifications
      if (n.monitor === "primary" || n.monitor === "focused" || typeof n.monitor === "number") {
        result.notifications.monitor = n.monitor
      }
      if (typeof n.groupByApp === "boolean") {
        result.notifications.groupByApp = n.groupByApp
      }
    }

    // Validate clock
    if (parsed.clock && typeof parsed.clock === "object") {
      if (typeof parsed.clock.format === "string") result.clock.format = parsed.clock.format
    }

    // Validate weather
    if (parsed.weather && typeof parsed.weather === "object") {
      if (typeof parsed.weather.location === "string") result.weather.location = parsed.weather.location
      if (parsed.weather.units === "imperial" || parsed.weather.units === "metric") {
        result.weather.units = parsed.weather.units
      }
    }

    // Validate widgets (enable/disable flags)
    if (parsed.widgets && typeof parsed.widgets === "object") {
      const widgetNames = Object.keys(DEFAULT_CONFIG.widgets) as (keyof WidgetsConfig)[]
      for (const name of widgetNames) {
        if (typeof parsed.widgets[name] === "boolean") {
          result.widgets[name] = parsed.widgets[name]
        }
      }
    }

    return result
  }

  private _writeDefaultConfig(): void {
    this._writeTomlConfig(DEFAULT_CONFIG)
  }

  /**
   * Escape string for TOML (handle quotes and backslashes)
   */
  private _tomlEscape(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  }

  /**
   * Format array as TOML with proper spacing and escaping
   */
  private _tomlArray(arr: string[]): string {
    return `[${arr.map(s => `"${this._tomlEscape(s)}"`).join(", ")}]`
  }

  private _writeTomlConfig(config: Config): void {
    // Build TOML following best practices:
    // - Comments on their own line above the key
    // - Proper spacing in arrays
    // - Blank lines between sections
    const e = (s: string) => this._tomlEscape(s)
    const tomlContent = `# Bartender Configuration

[layout]
left = ${this._tomlArray(config.layout.left)}
center = ${this._tomlArray(config.layout.center)}
right = ${this._tomlArray(config.layout.right)}

[feed]
# RSS feed URL - works with any standard RSS/Atom feed
url = "${e(config.feed.url)}"

# Optional auth header for authenticated feeds
# Example for FreshRSS: "GoogleLogin auth=YOUR_TOKEN"
auth_token = "${e(config.feed.auth_token || "")}"

# Enable debug logging to ~/.local/state/bartender/feed-debug-*.log
debug_log = ${config.feed.debug_log}

# Display duration bounds (seconds) - calculated from title word count
display_min = ${config.feed.display_min}
display_max = ${config.feed.display_max}

# Exploration rate for epsilon-greedy selection (0.0-1.0)
epsilon = ${config.feed.epsilon}

# Diversity penalty half-life (seconds) - time for repeat probability to halve
diversity_half_life = ${config.feed.diversity_half_life}

# Refresh interval (seconds) - how often to check for new articles (min: 30)
# Carousel rotates through cached articles continuously. This only controls background fetching.
refresh_interval = ${config.feed.refresh_interval}

# Actualize (refresh) the feed before fetching - triggers feed server to pull new content
# On each refresh cycle, bartender tells your feed server to update, then fetches fresh articles
# Base URL for actualize requests (leave empty to disable)
actualize_base_url = "${e(config.feed.actualize_base_url || "")}"

# Comma-separated feed IDs to actualize (e.g., "482,436,9,570,517")
actualize_feed_ids = "${e(config.feed.actualize_feed_ids || "")}"

# Maximum articles to keep in cache (stable size via sliding window)
cache_size = ${config.feed.cache_size}

# Days of history to pull on initial load (cold start)
initial_load_days = ${config.feed.initial_load_days}

# Hours of new content to pull on incremental refresh
incremental_hours = ${config.feed.incremental_hours}

# Enable incremental updates (false = always pull full feed)
enable_incremental = ${config.feed.enable_incremental}

[audio]
# ALSA card number for speaker/headphone toggle (find with: aplay -l)
card = ${config.audio.card}

[comfyui]
# ComfyUI installation directory (supports ~/)
dir = "${e(config.comfyui.dir)}"
port = ${config.comfyui.port}
# url = "http://127.0.0.1:8188"
# python = "~/ComfyUI/venv312/bin/python"
# model_paths = "~/ComfyUI/extra_model_paths.yml"
# start_cmd = ""

[proxyforge]
# Comma-separated process names for eBPF interception
targets = "${e(config.proxyforge.targets)}"

[notifications]
# Where to show: "primary", "focused", or monitor number
monitor = ${typeof config.notifications.monitor === "string" ? `"${e(config.notifications.monitor)}"` : config.notifications.monitor}
groupByApp = ${config.notifications.groupByApp}

[clock]
format = "${e(config.clock.format)}"

[weather]
location = "${e(config.weather.location)}"
units = "${e(config.weather.units)}"

[widgets]
# Set to false to hide a widget
workspaces = ${config.widgets.workspaces}
feed = ${config.widgets.feed}
tray = ${config.widgets.tray}
audio = ${config.widgets.audio}
volume = ${config.widgets.volume}
sysmon = ${config.widgets.sysmon}
comfyui = ${config.widgets.comfyui}
proxyforge = ${config.widgets.proxyforge}
vpn = ${config.widgets.vpn}
clock = ${config.widgets.clock}
weather = ${config.widgets.weather}
wifi = ${config.widgets.wifi}
bluetooth = ${config.widgets.bluetooth}
audiomixer = ${config.widgets.audiomixer}
`

    try {
      GLib.file_set_contents(CONFIG_TOML_PATH, tomlContent)
    } catch (e) {
      console.warn(`Failed to write config: ${e}`)
    }
  }

  private _watchConfig(): void {
    const file = Gio.File.new_for_path(CONFIG_TOML_PATH)
    try {
      this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null)
      this._monitor.connect("changed", (_monitor, _file, _otherFile, eventType) => {
        if (
          eventType === Gio.FileMonitorEvent.CHANGED ||
          eventType === Gio.FileMonitorEvent.CREATED ||
          eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT
        ) {
          // Cancel any pending reload to debounce rapid changes
          if (this._reloadTimer !== null) {
            GLib.source_remove(this._reloadTimer)
          }
          this._reloadTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            console.log("Config file changed, reloading...")
            this._load()
            this._notify()
            this._reloadTimer = null
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
    const enabled = this.config.widgets[name as keyof WidgetsConfig]
    return enabled !== false
  }

  destroy(): void {
    if (this._monitor) {
      this._monitor.cancel()
      this._monitor = null
    }
  }
}

export default ConfigService
