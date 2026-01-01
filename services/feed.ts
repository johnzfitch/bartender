import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { execAsync } from "ags/process"

export interface Article {
  id: string
  title: string
  source: string
  url: string
  published: number
  weight: number
}

// FeedService - singleton that manages RSS feed state
class FeedService {
  private static _instance: FeedService | null = null

  articles: Article[] = []
  current: Article | null = null
  status: "loading" | "ready" | "error" = "loading"
  error: string = ""

  private _paused: boolean = false
  private _refreshTimer: number | null = null
  private _cycleTimer: number | null = null
  private _listeners: Set<() => void> = new Set()

  // Half-life for exponential decay (3 hours in seconds)
  private readonly HALF_LIFE = 3 * 3600

  static get_default(): FeedService {
    if (!this._instance) {
      this._instance = new FeedService()
    }
    return this._instance
  }

  private constructor() {
    this._startRefreshLoop()
    this._startCycleLoop()
  }

  subscribe(callback: () => void): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  private _notify(): void {
    this._listeners.forEach((cb) => cb())
  }

  async refresh(): Promise<void> {
    this.status = "loading"
    this._notify()

    try {
      const token = GLib.getenv("FRESHRSS_AUTH_TOKEN")
      if (!token) {
        throw new Error("FRESHRSS_AUTH_TOKEN not set")
      }

      const apiUrl = GLib.getenv("FRESHRSS_API_URL")
      if (!apiUrl) {
        throw new Error("FRESHRSS_API_URL not set")
      }

      const since = Math.floor(Date.now() / 1000) - 36 * 3600
      const url = `${apiUrl}?n=100&ot=${since}&output=json`

      // Use curl for HTTP request (AGS doesn't have native fetch in all versions)
      const result = await execAsync([
        "curl",
        "-s",
        "-f",
        url,
        "-H",
        `Authorization: GoogleLogin auth=${token}`,
      ])

      const data = JSON.parse(result)
      this.articles = this._parseArticles(data.items || [])
      this.status = "ready"
      this.error = ""

      if (!this.current && this.articles.length > 0) {
        this._selectNext()
      }
    } catch (e: any) {
      this.status = "error"
      this.error = e.message || "Failed to fetch feed"
      console.error("FeedService error:", e)
    }

    this._notify()
  }

  private _parseArticles(items: any[]): Article[] {
    const now = Date.now() / 1000

    return items
      .filter((item) => item.title)
      .map((item) => {
        const ageSeconds = now - item.published
        const weight = Math.exp((-0.693147 * ageSeconds) / this.HALF_LIFE)

        return {
          id: item.id,
          title: item.title,
          source: item.origin?.title || "Feed",
          url: this._extractUrl(item),
          published: item.published,
          weight,
        }
      })
  }

  private _extractUrl(item: any): string {
    // Special handling for Hacker News - prefer comment page
    if (item.origin?.title?.includes("Hacker News")) {
      const match = item.summary?.content?.match(
        /https:\/\/news\.ycombinator\.com\/item\?id=\d+/
      )
      if (match) return this._validateUrl(match[0])
    }
    const url = item.alternate?.[0]?.href || item.canonical?.[0]?.href || ""
    return this._validateUrl(url)
  }

  private _validateUrl(url: string): string {
    // Only allow http:// and https:// URLs for security
    if (!url) return ""
    
    try {
      const trimmedUrl = url.trim()
      // Use GLib's URI parsing to validate URL format
      const uri = Gio.Uri.parse(trimmedUrl, Gio.UriFlags.NONE)
      const scheme = uri.get_scheme()
      if (scheme === "http" || scheme === "https") {
        return trimmedUrl
      }
      console.warn("Invalid URL scheme rejected:", trimmedUrl)
      return ""
    } catch (e) {
      console.error("URL validation error:", e)
      return ""
    }
  }

  private _selectNext(): void {
    if (this.articles.length === 0) return

    const totalWeight = this.articles.reduce((sum, a) => sum + a.weight, 0)
    if (totalWeight === 0) {
      this.current = this.articles[0]
      this._notify()
      return
    }

    let pick = Math.random() * totalWeight

    for (const article of this.articles) {
      pick -= article.weight
      if (pick <= 0) {
        this.current = article
        this._notify()
        return
      }
    }

    // Fallback
    this.current = this.articles[0]
    this._notify()
  }

  pause(): void {
    this._paused = true
  }

  resume(): void {
    this._paused = false
  }

  // Critical: Opens the CURRENT article - no race condition
  openCurrent(): void {
    if (this.current?.url) {
      execAsync(["xdg-open", this.current.url]).catch((e) =>
        console.error("Failed to open URL:", e)
      )
    }
  }

  private _startRefreshLoop(): void {
    // Initial fetch
    this.refresh()

    // Refresh every 5 minutes
    this._refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5 * 60 * 1000, () => {
      this.refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  private _startCycleLoop(): void {
    // Cycle every 8 seconds (if not paused)
    this._cycleTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8000, () => {
      if (!this._paused && this.articles.length > 0) {
        this._selectNext()
      }
      return GLib.SOURCE_CONTINUE
    })
  }

  destroy(): void {
    if (this._refreshTimer) {
      GLib.source_remove(this._refreshTimer)
    }
    if (this._cycleTimer) {
      GLib.source_remove(this._cycleTimer)
    }
  }
}

export default FeedService
