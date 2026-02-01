import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import { execAsync } from "ags/process"
import FeedService from "../services/feed"

export default function Feed() {
  const feed = FeedService.get_default()

  const [displayText, setDisplayText] = createState(getDisplayText())
  const [statusClass, setStatusClass] = createState(getStatusClass())

  function getDisplayText(): string {
    if (feed.status === "loading") return "Loading feed..."
    if (feed.status === "error") {
      // Shorter message for display, full path shown on click
      if (feed.error.includes("No feed URL")) {
        return "Click to configure feed URL"
      }
      return `Feed error: ${feed.error}`
    }
    if (!feed.current) return "No articles"
    return `${feed.current.source} | ${feed.current.title}`
  }

  function getStatusClass(): string {
    if (feed.status === "loading") return "loading"
    if (feed.status === "error") return "error"
    return "ready"
  }

  function handleClick(): void {
    // If no feed URL configured, open the config file
    if (feed.status === "error" && feed.error.includes("No feed URL")) {
      const configPath = `${GLib.get_home_dir()}/.config/bartender/config.toml`
      execAsync(["xdg-open", configPath]).catch(console.error)
      return
    }
    // Otherwise open the current article
    feed.openCurrent()
  }

  const unsubscribe = feed.subscribe(() => {
    setDisplayText(getDisplayText())
    setStatusClass(getStatusClass())
  })

  onCleanup(() => {
    unsubscribe()
  })

  // Hover controller for pause/resume
  const hoverController = new Gtk.EventControllerMotion()
  hoverController.connect("enter", () => feed.pause())
  hoverController.connect("leave", () => feed.resume())

  return (
    <button
      cssClasses={statusClass((c) => ["feed-ticker", c])}
      onClicked={handleClick}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
      $={(self) => self.add_controller(hoverController)}
    >
      <label
        label={displayText}
        ellipsize={3}
        maxWidthChars={150}
      />
    </button>
  )
}
