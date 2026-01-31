import GLib from "gi://GLib"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import { execAsync } from "ags/process"

type AudioMode = "speakers" | "headphones" | "both" | "muted"

export default function Audio() {
  const [mode, setMode] = createState<AudioMode>("speakers")
  const [icon, setIcon] = createState("audio-speakers-symbolic")

  // Get audio card from environment variable with fallback to 3
  const audioCard = GLib.getenv("AUDIO_CARD") || "3"

  async function refresh(): Promise<void> {
    try {
      let lineOut: string
      let headphone: string

      try {
        lineOut = await execAsync(["amixer", "-c", audioCard, "sget", "Line Out"])
      } catch (e) {
        // Line Out control doesn't exist, assume off
        lineOut = ""
      }

      try {
        headphone = await execAsync(["amixer", "-c", audioCard, "sget", "Headphone"])
      } catch (e) {
        // Headphone control doesn't exist, assume off
        headphone = ""
      }

      const lineOutOn = lineOut.includes("[on]")
      const headphoneOn = headphone.includes("[on]")

      let newMode: AudioMode
      if (lineOutOn && headphoneOn) {
        newMode = "both"
      } else if (lineOutOn) {
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

    // Cycle: speakers -> headphones -> both -> speakers
    let newMode: AudioMode
    switch (current) {
      case "speakers":
        newMode = "headphones"
        break
      case "headphones":
        newMode = "both"
        break
      default:
        newMode = "speakers"
        break
    }

    try {
      switch (newMode) {
        case "speakers":
          try {
            await execAsync(["amixer", "-c", audioCard, "sset", "Line Out", "on"])
          } catch (e) {
            // Ignore if control doesn't exist
          }
          try {
            await execAsync(["amixer", "-c", audioCard, "sset", "Headphone", "off"])
          } catch (e) {
            // Ignore if control doesn't exist
          }
          break
        case "headphones":
          try {
            await execAsync(["amixer", "-c", audioCard, "sset", "Line Out", "off"])
          } catch (e) {
            // Ignore if control doesn't exist
          }
          try {
            await execAsync(["amixer", "-c", audioCard, "sset", "Headphone", "on"])
          } catch (e) {
            // Ignore if control doesn't exist
          }
          break
        case "both":
          try {
            await execAsync(["amixer", "-c", audioCard, "sset", "Line Out", "on"])
          } catch (e) {
            // Ignore if control doesn't exist
          }
          try {
            await execAsync(["amixer", "-c", audioCard, "sset", "Headphone", "on"])
          } catch (e) {
            // Ignore if control doesn't exist
          }
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
