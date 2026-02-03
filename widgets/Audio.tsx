import GLib from "gi://GLib"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import { execAsync } from "ags/process"
import ConfigService from "../services/config"
import AudioControlService from "../services/audioctl"

type AudioMode = "speakers" | "headphones" | "both" | "muted"

export default function Audio() {
  const [mode, setMode] = createState<AudioMode>("speakers")
  const [icon, setIcon] = createState("audio-speakers-symbolic")

  // Get audio card from config and control service
  const config = ConfigService.get_default()
  const audioCard = String(config.config.audio.card)
  const audioCtl = AudioControlService.get_default()

  async function refresh(): Promise<void> {
    try {
      const speakerCtl = audioCtl.speakerControl
      const headphoneCtl = audioCtl.headphoneControl

      const speakerOn = await audioCtl.getControlState(speakerCtl, audioCard)
      const headphoneOn = await audioCtl.getControlState(headphoneCtl, audioCard)

      let newMode: AudioMode
      if (speakerOn && headphoneOn) {
        newMode = "both"
      } else if (speakerOn) {
        newMode = "speakers"
      } else if (headphoneOn) {
        newMode = "headphones"
      } else {
        newMode = "muted"
      }

      setMode(newMode)
      setIcon(getIcon(newMode))
    } catch (e) {
      console.error("Audio status error:", e)
    }
  }

  function getIcon(m: AudioMode): string {
    switch (m) {
      case "speakers":
        return "audio-speakers-symbolic"
      case "headphones":
        return "audio-headphones-symbolic"
      case "both":
        return "audio-card-symbolic"
      case "muted":
        return "audio-volume-muted-symbolic"
    }
  }

  function getTooltip(m: AudioMode): string {
    const labels = {
      speakers: "Speakers only",
      headphones: "Headphones only",
      both: "Speakers + Headphones",
      muted: "Audio muted",
    }
    return labels[m]
  }

  async function toggle(): Promise<void> {
    const current = mode()
    const speakerCtl = audioCtl.speakerControl
    const headphoneCtl = audioCtl.headphoneControl

    // Cycle: speakers -> headphones -> both -> speakers (muted -> speakers)
    let newMode: AudioMode
    switch (current) {
      case "speakers":
        newMode = "headphones"
        break
      case "headphones":
        newMode = "both"
        break
      case "both":
        newMode = "speakers"
        break
      case "muted":
        newMode = "speakers"
        break
    }

    try {
      switch (newMode) {
        case "speakers":
          await audioCtl.setControlState(speakerCtl, audioCard, "on")
          await audioCtl.setControlState(headphoneCtl, audioCard, "off")
          break
        case "headphones":
          await audioCtl.setControlState(speakerCtl, audioCard, "off")
          await audioCtl.setControlState(headphoneCtl, audioCard, "on")
          break
        case "both":
          await audioCtl.setControlState(speakerCtl, audioCard, "on")
          await audioCtl.setControlState(headphoneCtl, audioCard, "on")
          break
      }

      setMode(newMode)
      setIcon(getIcon(newMode))
    } catch (e) {
      console.error("Audio toggle error:", e)
    }
  }

  // Initial refresh and polling
  refresh()
  const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    refresh()
    return GLib.SOURCE_CONTINUE
  })

  onCleanup(() => {
    GLib.source_remove(timer)
  })

  return (
    <button
      cssClasses={mode((m) => ["audio", m])}
      tooltipText={mode((m) => getTooltip(m))}
      onClicked={() => toggle()}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
    >
      <image iconName={icon} />
    </button>
  )
}
