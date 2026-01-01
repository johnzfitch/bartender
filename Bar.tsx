import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import AstalHyprland from "gi://AstalHyprland"
import AstalWp from "gi://AstalWp"
import AstalTray from "gi://AstalTray"
import { For, createBinding, onCleanup } from "ags"
import { createPoll } from "ags/time"

// Custom widgets
import Feed from "./widgets/Feed"
import Vpn from "./widgets/Vpn"
import ProxyForge from "./widgets/ProxyForge"
import Audio from "./widgets/Audio"

function Workspaces() {
  const hyprland = AstalHyprland.get_default()
  const workspaces = createBinding(hyprland, "workspaces")
  const focused = createBinding(hyprland, "focusedWorkspace")

  return (
    <box cssClasses={["workspaces"]}>
      <For each={workspaces}>
        {(ws) => (
          <button
            cssClasses={focused((f) => f?.id === ws.id ? ["focused"] : [])}
            onClicked={() => ws.focus()}
          >
            <label label={ws.id.toString()} />
          </button>
        )}
      </For>
    </box>
  )
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

  return (
    <box cssClasses={["tray"]}>
      <For each={items}>
        {(item) => (
          <menubutton $={(self) => init(self, item)}>
            <image gicon={createBinding(item, "gicon")} />
          </menubutton>
        )}
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
      $={(self) => (win = self)}
      visible
      namespace="bartender"
      name={`bar-${gdkmonitor.connector}`}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox>
        <box $type="start" spacing={8}>
          <Workspaces />
          <Feed />
        </box>
        <box $type="center">
          <Clock format="%a %b %d  %H:%M" />
        </box>
        <box $type="end" spacing={8}>
          <Tray />
          <Audio />
          <Volume />
          <ProxyForge />
          <Vpn />
        </box>
      </centerbox>
    </window>
  )
}
