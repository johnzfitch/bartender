import type { JSX } from "ags"

// Widget factory type - returns a JSX element or null
export type WidgetFactory = () => JSX.Element | null

// Registry of all available widgets
// Each widget is lazily imported to avoid circular dependencies
const widgetRegistry: Record<string, () => Promise<WidgetFactory>> = {
  // Core widgets (always available)
  workspaces: async () => {
    const { Workspaces } = await import("../Bar")
    return () => <Workspaces />
  },

  tray: async () => {
    const { Tray } = await import("../Bar")
    return () => <Tray />
  },

  volume: async () => {
    const { Volume } = await import("../Bar")
    return () => <Volume />
  },

  clock: async () => {
    const { Clock } = await import("../Bar")
    return () => <Clock />
  },

  // Custom widgets
  feed: async () => {
    const Feed = (await import("../widgets/Feed")).default
    return () => <Feed />
  },

  vpn: async () => {
    const Vpn = (await import("../widgets/Vpn")).default
    return () => <Vpn />
  },

  proxyforge: async () => {
    const ProxyForge = (await import("../widgets/ProxyForge")).default
    return () => <ProxyForge />
  },

  audio: async () => {
    const Audio = (await import("../widgets/Audio")).default
    return () => <Audio />
  },

  // Future widgets (placeholders)
  wifi: async () => {
    const Wifi = (await import("../widgets/Wifi")).default
    return () => <Wifi />
  },

  bluetooth: async () => {
    const Bluetooth = (await import("../widgets/Bluetooth")).default
    return () => <Bluetooth />
  },

  weather: async () => {
    const Weather = (await import("../widgets/Weather")).default
    return () => <Weather />
  },
}

// Cache for loaded widget factories
const loadedWidgets: Map<string, WidgetFactory> = new Map()

// Get a widget factory by name
export async function getWidget(name: string): Promise<WidgetFactory | null> {
  // Check cache first
  if (loadedWidgets.has(name)) {
    return loadedWidgets.get(name)!
  }

  const loader = widgetRegistry[name]
  if (!loader) {
    console.warn(`Unknown widget: ${name}`)
    return null
  }

  try {
    const factory = await loader()
    loadedWidgets.set(name, factory)
    return factory
  } catch (e) {
    console.error(`Failed to load widget ${name}:`, e)
    return null
  }
}

// Check if a widget exists in the registry
export function hasWidget(name: string): boolean {
  return name in widgetRegistry
}

// Get all registered widget names
export function getWidgetNames(): string[] {
  return Object.keys(widgetRegistry)
}
