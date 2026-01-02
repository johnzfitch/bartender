import AstalNetwork from "gi://AstalNetwork"
import { createBinding, createState, For } from "ags"
import { execAsync } from "ags/process"

export default function Wifi() {
  const network = AstalNetwork.get_default()
  const wifi = network.wifi

  if (!wifi) {
    return <box cssClasses={["wifi", "unavailable"]} />
  }

  const ssid = createBinding(wifi, "ssid")
  const strength = createBinding(wifi, "strength")
  const iconName = createBinding(wifi, "iconName")
  const accessPoints = createBinding(wifi, "accessPoints")

  const connect = async (ap: AstalNetwork.AccessPoint) => {
    try {
      // Use nmcli to connect to network
      await execAsync(["nmcli", "device", "wifi", "connect", ap.bssid])
    } catch (e) {
      console.error(`Failed to connect to ${ap.ssid}:`, e)
    }
  }

  const getSignalIcon = (strength: number): string => {
    if (strength >= 80) return "network-wireless-signal-excellent-symbolic"
    if (strength >= 60) return "network-wireless-signal-good-symbolic"
    if (strength >= 40) return "network-wireless-signal-ok-symbolic"
    if (strength >= 20) return "network-wireless-signal-weak-symbolic"
    return "network-wireless-signal-none-symbolic"
  }

  return (
    <menubutton cssClasses={["wifi"]}>
      <image iconName={iconName} />
      <popover>
        <box orientation={1} cssClasses={["wifi-popover"]}>
          <box cssClasses={["wifi-header"]}>
            <label label="WiFi Networks" />
          </box>
          <box cssClasses={["wifi-list"]} orientation={1}>
            <For each={accessPoints}>
              {(ap) => {
                const isActive = ap.ssid === wifi.ssid
                return (
                  <button
                    cssClasses={isActive ? ["wifi-ap", "active"] : ["wifi-ap"]}
                    onClicked={() => !isActive && connect(ap)}
                  >
                    <box>
                      <image iconName={getSignalIcon(ap.strength)} />
                      <label label={ap.ssid || "Hidden Network"} hexpand halign={1} />
                      {isActive && <image iconName="emblem-ok-symbolic" />}
                    </box>
                  </button>
                )
              }}
            </For>
          </box>
        </box>
      </popover>
    </menubutton>
  )
}
