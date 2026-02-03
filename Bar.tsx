import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import AstalHyprland from "gi://AstalHyprland"
import AstalWp from "gi://AstalWp"
import AstalTray from "gi://AstalTray"
import { For, createBinding, createState, onCleanup } from "ags"
import { createPoll } from "ags/time"

// Services
import ConfigService from "./services/config"

// Custom widgets
import Feed from "./widgets/Feed"
import Vpn from "./widgets/Vpn"
import ProxyForge from "./widgets/ProxyForge"
import Audio from "./widgets/Audio"
import SystemMonitor from "./widgets/SystemMonitor"
import Weather from "./widgets/Weather"
import Wifi from "./widgets/Wifi"
import Bluetooth from "./widgets/Bluetooth"
import AudioMixer from "./widgets/AudioMixer"
import ComfyUI from "./widgets/ComfyUI"

function WorkspaceButton({ id, hyprland }: { id: number; hyprland: AstalHyprland.Hyprland }) {
  const [classes, setClasses] = createState<string[]>(getClasses())

  function getClasses(): string[] {
    const isFocused = hyprland.focusedWorkspace?.id === id
    const isOccupied = hyprland.workspaces.some((ws) => ws.id === id)
    const cls = ["ws"]
    if (isFocused) cls.push("focused")
    else if (isOccupied) cls.push("occupied")
    else cls.push("empty")
    return cls
  }

  // Subscribe to both workspace and focus changes
  const update = () => setClasses(getClasses())
  const focusId = hyprland.connect("notify::focused-workspace", update)
  const workspacesId = hyprland.connect("notify::workspaces", update)

  // Disconnect signal handlers on cleanup
  onCleanup(() => {
    hyprland.disconnect(focusId)
    hyprland.disconnect(workspacesId)
  })

  return (
    <button
      cssClasses={classes}
      onClicked={() => hyprland.dispatch("workspace", id.toString())}
    >
      <label label={id.toString()} />
    </button>
  )
}

export function Workspaces() {
  const hyprland = AstalHyprland.get_default()

  return (
    <box cssClasses={["workspaces"]}>
      <WorkspaceButton id={1} hyprland={hyprland} />
      <WorkspaceButton id={2} hyprland={hyprland} />
      <WorkspaceButton id={3} hyprland={hyprland} />
      <WorkspaceButton id={4} hyprland={hyprland} />
      <WorkspaceButton id={5} hyprland={hyprland} />
    </box>
  )
}

// Icon overrides for tray apps with poor dark theme icons
const TRAY_ICON_OVERRIDES: Record<string, string> = {
  kgpg: "security-high-symbolic",
}

// Hide these tray items (we have custom widgets for them)
const TRAY_HIDDEN = new Set([
  "mullvad-vpn",
  "Mullvad VPN",
])

export function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items")

  const init = (btn: Gtk.MenuButton, item: AstalTray.TrayItem) => {
    btn.menuModel = item.menuModel
    btn.insert_action_group("dbusmenu", item.actionGroup)
    const actionGroupId = item.connect("notify::action-group", () => {
      btn.insert_action_group("dbusmenu", item.actionGroup)
    })

    // Disconnect on button destroy
    btn.connect("destroy", () => {
      item.disconnect(actionGroupId)
    })
  }

  const getIconForItem = (item: AstalTray.TrayItem) => {
    // Check for icon override by ID
    const overrideIcon = TRAY_ICON_OVERRIDES[item.id]
    if (overrideIcon) {
      return <image iconName={overrideIcon} />
    }
    // Use the item's own icon
    if (item.gicon) {
      return <image gicon={createBinding(item, "gicon")} />
    }
    return <image iconName={createBinding(item, "iconName")} />
  }

  return (
    <box cssClasses={["tray"]}>
      <For each={items}>
        {(item) => {
          // Skip hidden items (we have custom widgets for them)
          if (TRAY_HIDDEN.has(item.id) || TRAY_HIDDEN.has(item.title)) return <box />

          // Skip items with no usable icon
          const hasIcon = item.gicon !== null || (item.iconName && item.iconName.length > 0) || TRAY_ICON_OVERRIDES[item.id]
          if (!hasIcon) return <box />

          return (
            <menubutton $={(self) => init(self, item)} tooltipText={item.title || item.id}>
              {getIconForItem(item)}
            </menubutton>
          )
        }}
      </For>
    </box>
  )
}

export function Volume() {
  const wp = AstalWp.get_default()
  const speaker = wp?.defaultSpeaker

  if (!speaker) return <box />

  return (
    <menubutton cssClasses={["volume"]}>
      <image iconName={createBinding(speaker, "volumeIcon")} />
      <popover>
        <box>
          <slider
            widthRequest={200}
            onChangeValue={({ value }) => speaker.set_volume(value)}
            value={createBinding(speaker, "volume")}
          />
        </box>
      </popover>
    </menubutton>
  )
}

export function Clock() {
  const config = ConfigService.get_default()
  const format = config.config.clock.format || "%a %b %d %l:%M %p"

  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format(format)!
  })

  // Import notification panel toggle dynamically to avoid circular deps
  const toggleNotificationPanel = async () => {
    const { togglePanel } = await import("./widgets/NotificationPanel")
    togglePanel()
  }

  return (
    <button cssClasses={["clock"]} onClicked={toggleNotificationPanel}>
      <label label={time} />
    </button>
  )
}

// Widget registry - maps widget names to their components
type WidgetComponent = () => JSX.Element
const WIDGET_MAP: Record<string, WidgetComponent> = {
  workspaces: Workspaces,
  tray: Tray,
  volume: Volume,
  clock: Clock,
  feed: Feed,
  vpn: Vpn,
  proxyforge: ProxyForge,
  audio: Audio,
  sysmon: SystemMonitor,
  weather: Weather,
  wifi: Wifi,
  bluetooth: Bluetooth,
  audiomixer: AudioMixer,
  comfyui: ComfyUI,
}

// Renders a widget by name if it's enabled in config
function Widget({ name }: { name: string }) {
  const config = ConfigService.get_default()

  if (!config.isEnabled(name)) {
    return <box />
  }

  const Component = WIDGET_MAP[name]
  if (!Component) {
    console.warn(`Unknown widget: ${name}`)
    return <box />
  }

  try {
    return <Component />
  } catch (error) {
    console.error(`[Bar] Widget ${name} crashed:`, error)
    return (
      <box className="widget-error" spacing={4}>
        <icon icon="dialog-error-symbolic" />
        <label label={`${name} error`} />
      </box>
    )
  }
}

// Renders a section of widgets (left, center, or right)
function WidgetSection({ widgets }: { widgets: string[] }) {
  return (
    <box>
      {widgets.map((name) => (
        <Widget name={name} />
      ))}
    </box>
  )
}

export default function Bar({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  let win: Astal.Window
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
  const config = ConfigService.get_default()
  const { layout } = config.config

  onCleanup(() => {
    win.destroy()
  })

  return (
    <window
      $={(self) => {
        win = self
        // Force transparent background
        self.set_decorated(false)
      }}
      visible
      cssClasses={["bartender"]}
      namespace="bartender"
      name={`bar-${gdkmonitor.connector}`}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      marginBottom={12}
      application={app}
    >
      <centerbox>
        <box $type="start" spacing={8}>
          <WidgetSection widgets={layout.left} />
        </box>
        <box $type="center">
          <WidgetSection widgets={layout.center} />
        </box>
        <box $type="end">
          <WidgetSection widgets={layout.right} />
        </box>
      </centerbox>
    </window>
  )
}
