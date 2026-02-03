import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import ComfyUIService from "../services/comfyui"

export default function ComfyUI() {
  const comfy = ComfyUIService.get_default()

  const [icon, setIcon] = createState(getIcon())
  const [tooltip, setTooltip] = createState(getTooltip())
  const [cssClass, setCssClass] = createState(getCssClass())
  const [metrics, setMetrics] = createState(getMetrics())

  function getIcon(): string {
    if (comfy.status === "running") return "media-playback-stop-symbolic"
    if (comfy.status === "starting" || comfy.status === "stopping") return "emblem-synchronizing-symbolic"
    return "media-playback-start-symbolic"
  }

  function getCssClass(): string {
    return `comfyui-${comfy.status}`
  }

  function getMetrics(): string {
    if (comfy.status !== "running") return "CPU 0% GPU 0%"
    return `CPU ${comfy.cpuPercent}% GPU ${comfy.gpuPercent}%`
  }

  function getTooltip(): string {
    const statusText = {
      running: "RUNNING",
      starting: "STARTING...",
      stopping: "STOPPING...",
      stopped: "STOPPED",
    }[comfy.status]

    return `ComfyUI: ${statusText}\n${getMetrics()}\nLeft: Toggle\nRight: Open UI`
  }

  const unsubscribe = comfy.subscribe(() => {
    setIcon(getIcon())
    setTooltip(getTooltip())
    setCssClass(getCssClass())
    setMetrics(getMetrics())
  })

  onCleanup(() => {
    unsubscribe()
  })

  const clickController = new Gtk.GestureClick()
  clickController.set_button(0)
  clickController.connect("pressed", () => {
    const button = clickController.get_current_button()
    if (button === Gdk.BUTTON_PRIMARY) {
      comfy.toggle()
    } else if (button === Gdk.BUTTON_SECONDARY) {
      comfy.openUI()
    }
  })

  return (
    <button
      cssClasses={cssClass((c) => ["comfyui", c])}
      tooltipText={tooltip()}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
      $={(self) => self.add_controller(clickController)}
    >
      <box spacing={6}>
        <image iconName={icon()} />
        <label label={metrics()} />
      </box>
    </button>
  )
}
