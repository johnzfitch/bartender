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

  // Right-click handler for rotation toggle
  const clickController = new Gtk.GestureClick()
  clickController.set_button(0) // Listen to all buttons
  clickController.connect("pressed", (_self, _n, _x, _y) => {
    const button = clickController.get_current_button()
    if (button === Gdk.BUTTON_PRIMARY) {
      vpn.openApp()
    } else if (button === Gdk.BUTTON_SECONDARY) {
      vpn.toggleRotation()
    }
  })

  return (
    <button
      cssClasses={cssClass((c) => ["vpn", c])}
      tooltipText={tooltip}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
      $={(self) => self.add_controller(clickController)}
    >
      <image iconName={icon} />
    </button>
  )
}
