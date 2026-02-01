import { createBinding, For, This } from "ags"
import app from "ags/gtk4/app"
import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=4.0"
import style from "./styles/style.scss"
import Bar from "./Bar"
import NotificationPanel from "./widgets/NotificationPanel"

// Set program name for logs (shows "bartender" instead of "gjs")
GLib.set_prgname("bartender")

// Force Adwaita icons - Yaru themes cause GTK4 infinite recursion crash
const settings = Gtk.Settings.get_default()
if (settings) {
  settings.gtk_icon_theme_name = "Adwaita"
  Object.defineProperty(settings, "gtk_icon_theme_name", {
    value: "Adwaita",
    writable: false,
    configurable: false,
  })
}

app.start({
  instanceName: "bartender",
  css: style,
  requestHandler(request, respond) {
    if (request === "quit") {
      app.quit()
      respond("bye")
    }
  },
  main() {
    const monitors = createBinding(app, "monitors")

    return (
      <For each={monitors}>
        {(monitor) => (
          <This this={app}>
            <Bar gdkmonitor={monitor} />
            <NotificationPanel gdkmonitor={monitor} />
          </This>
        )}
      </For>
    )
  },
})
