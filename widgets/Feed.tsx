import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import { createState, onCleanup } from "ags"
import FeedService from "../services/feed"

export default function Feed() {
  const feed = FeedService.get_default()

  // Local state that re-renders on feed changes
  const [displayText, setDisplayText] = createState(getDisplayText())
  const [statusClass, setStatusClass] = createState(getStatusClass())

  function getDisplayText(): string {
    if (feed.status === "loading") return "Loading feed..."
    if (feed.status === "error") return `Feed error: ${feed.error}`
    if (!feed.current) return "No articles"
    return `${feed.current.source} | ${feed.current.title}`
  }

  function getStatusClass(): string {
    if (feed.status === "loading") return "loading"
    if (feed.status === "error") return "error"
    return "ready"
  }

  // Subscribe to feed changes
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
      className={statusClass((c) => `feed-ticker ${c}`)}
      onClicked={() => feed.openCurrent()}
      cursor={Gdk.Cursor.new_from_name("pointer", null)}
      $={(self) => self.add_controller(hoverController)}
    >
      <label
        label={displayText}
        ellipsize={3} // PANGO_ELLIPSIZE_END
        maxWidthChars={100}
      />
    </button>
  )
}
