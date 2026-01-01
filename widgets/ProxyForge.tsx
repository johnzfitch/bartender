import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import ProxyForgeService from "../services/proxyforge"

export default function ProxyForge() {
  const proxy = ProxyForgeService.get_default()

  const [icon, setIcon] = createState(getIcon())
  const [tooltip, setTooltip] = createState(getTooltip())
  const [cssClass, setCssClass] = createState(getCssClass())

  function getIcon(): string {
    switch (proxy.status) {
      case "active":
        return "network-transmit-receive-symbolic"
      case "starting":
      case "stopping":
        return "emblem-synchronizing-symbolic"
      default:
        return "network-offline-symbolic"
    }
  }

  function getCssClass(): string {
    return `proxyforge-${proxy.status}`
  }

  function getTooltip(): string {
    const statusText = {
      active: "ACTIVE",
      starting: "STARTING...",
      stopping: "STOPPING...",
      off: "OFF",
    }[proxy.status]

    return `ProxyForge: ${statusText}\nLeft: Toggle\nRight: Open Viewer`
  }

  const unsubscribe = proxy.subscribe(() => {
    setIcon(getIcon())
    setTooltip(getTooltip())
    setCssClass(getCssClass())
  })

  onCleanup(() => {
    unsubscribe()
  })

  // Click handler
  const clickController = new Gtk.GestureClick()
  clickController.set_button(0)
  clickController.connect("pressed", (_self, _n, _x, _y) => {
    const button = clickController.get_current_button()
    if (button === Gdk.BUTTON_PRIMARY) {
      proxy.toggle()
    } else if (button === Gdk.BUTTON_SECONDARY) {
      proxy.openViewer()
    }
  })

  return (
    <button
      cssClasses={cssClass((c) => ["proxyforge", c])}
      tooltipText={tooltip}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
      $={(self) => self.add_controller(clickController)}
    >
      <image iconName={icon} />
    </button>
  )
}
