import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import VpnService from "../services/vpn"

export default function Vpn() {
  const vpn = VpnService.get_default()

  const [icon, setIcon] = createState(getIcon())
  const [tooltip, setTooltip] = createState(getTooltip())
  const [cssClass, setCssClass] = createState(getCssClass())

  function getIcon(): string {
    if (vpn.status.connected) return "network-vpn-symbolic"
    if (vpn.status.connecting) return "network-vpn-acquiring-symbolic"
    return "network-vpn-disconnected-symbolic"
  }

  function getCssClass(): string {
    if (vpn.status.connected) return "connected"
    if (vpn.status.connecting) return "connecting"
    return "disconnected"
  }

  function getTooltip(): string {
    const rotateStatus = vpn.rotating ? "ON" : "OFF"
    if (vpn.status.connected) {
      return `VPN: ${vpn.status.location}\nIP: ${vpn.status.ip}\n\nRotation: ${rotateStatus}\nLeft: Open Mullvad\nRight: Toggle Rotation`
    }
    if (vpn.status.connecting) {
      return "VPN: Connecting..."
    }
    return `VPN: Disconnected\n\nRotation: ${rotateStatus}\nLeft: Open Mullvad\nRight: Toggle Rotation`
  }

  const unsubscribe = vpn.subscribe(() => {
    setIcon(getIcon())
    setTooltip(getTooltip())
    setCssClass(getCssClass())
  })

  onCleanup(() => {
    unsubscribe()
  })

  // Click handlers
  const leftClickController = new Gtk.GestureClick()
  leftClickController.set_button(Gdk.BUTTON_PRIMARY)
  leftClickController.connect("pressed", () => {
    vpn.openApp()
  })

  const rightClickController = new Gtk.GestureClick()
  rightClickController.set_button(Gdk.BUTTON_SECONDARY)
  rightClickController.connect("pressed", () => {
    vpn.toggleRotation()
  })

  return (
    <box
      cssClasses={cssClass((c) => ["vpn", c])}
      tooltipText={tooltip}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
      $={(self) => {
        self.add_controller(leftClickController)
        self.add_controller(rightClickController)
      }}
    >
      <image iconName={icon} />
    </box>
  )
}
