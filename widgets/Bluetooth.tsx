import AstalBluetooth from "gi://AstalBluetooth"
import { createBinding, For } from "ags"

export default function Bluetooth() {
  const bluetooth = AstalBluetooth.get_default()

  if (!bluetooth) {
    return <box cssClasses={["bluetooth", "unavailable"]} />
  }

  const isPowered = createBinding(bluetooth, "isPowered")
  const isConnected = createBinding(bluetooth, "isConnected")
  const devices = createBinding(bluetooth, "devices")

  const getIcon = () => {
    return isPowered.as((powered) => {
      if (!powered) return "bluetooth-disabled-symbolic"
      return isConnected.as((connected) =>
        connected ? "bluetooth-active-symbolic" : "bluetooth-symbolic"
      )
    })
  }

  const toggleDevice = async (device: AstalBluetooth.Device) => {
    try {
      if (device.connected) {
        await device.disconnect_device()
      } else {
        await device.connect_device()
      }
    } catch (e) {
      console.error(`Bluetooth device error:`, e)
    }
  }

  const getDeviceIcon = (device: AstalBluetooth.Device): string => {
    // Use device icon if available, fallback to generic
    if (device.icon) return device.icon
    return "bluetooth-symbolic"
  }

  // Compute icon based on powered and connected state
  const icon = createBinding(bluetooth, "isPowered").as((powered) => {
    if (!powered) return "bluetooth-disabled-symbolic"
    // For connected state, we need to check synchronously
    return bluetooth.isConnected ? "bluetooth-active-symbolic" : "bluetooth-symbolic"
  })

  return (
    <menubutton
      cssClasses={createBinding(bluetooth, "isConnected").as((c) =>
        c ? ["bluetooth", "connected"] : ["bluetooth"]
      )}
    >
      <image iconName={icon} />
      <popover>
        <box orientation={1} cssClasses={["bluetooth-popover"]}>
          <box cssClasses={["bluetooth-header"]}>
            <label label="Bluetooth Devices" />
            <switch
              active={isPowered}
              onActivate={({ active }) => (bluetooth.adapter.powered = active)}
            />
          </box>
          <box cssClasses={["bluetooth-list"]} orientation={1}>
            <For each={devices}>
              {(device) => {
                const connected = createBinding(device, "connected")
                return (
                  <button
                    cssClasses={connected.as((c) =>
                      c ? ["bt-device", "connected"] : ["bt-device"]
                    )}
                    onClicked={() => toggleDevice(device)}
                    sensitive={isPowered}
                  >
                    <box>
                      <image iconName={getDeviceIcon(device)} />
                      <label label={device.name || device.address} hexpand halign={1} />
                      {connected.as((c) =>
                        c ? <image iconName="emblem-ok-symbolic" /> : <box />
                      )}
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
