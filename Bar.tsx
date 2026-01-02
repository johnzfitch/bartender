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

// Custom widgets
import Feed from "./widgets/Feed"
import Vpn from "./widgets/Vpn"
import ProxyForge from "./widgets/ProxyForge"
import Audio from "./widgets/Audio"

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
  hyprland.connect("notify::focused-workspace", update)
  hyprland.connect("notify::workspaces", update)

  return (
    <button
      cssClasses={classes}
      onClicked={() => hyprland.dispatch("workspace", id.toString())}
    >
      <label label={id.toString()} />
    </button>
  )
}

function Workspaces() {
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

function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items")

  const init = (btn: Gtk.MenuButton, item: AstalTray.TrayItem) => {
    btn.menuModel = item.menuModel
    btn.insert_action_group("dbusmenu", item.actionGroup)
    item.connect("notify::action-group", () => {
      btn.insert_action_group("dbusmenu", item.actionGroup)
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

function Volume() {
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

function Clock({ format = "%H:%M" }) {
  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format(format)!
  })

  return (
    <menubutton cssClasses={["clock"]}>
      <label label={time} />
      <popover>
        <Gtk.Calendar />
      </popover>
    </menubutton>
  )
}

export default function Bar({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  let win: Astal.Window
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

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
          <Workspaces />
        </box>
        <box $type="center">
          <Feed />
        </box>
        <box $type="end">
          <Tray />
          <Audio />
          <Volume />
          <ProxyForge />
          <Vpn />
          <Clock format="%a %b %d %l:%M %p" />
        </box>
      </centerbox>
    </window>
  )
}
