import GLib from "gi://GLib"
import { execAsync } from "ags/process"
import ConfigService from "./config"

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

  // Default RSS feed URL
  private readonly DEFAULT_FEED_URL = "https://feed.internetuniverse.org/i/?a=rss&user=zack&token=abc123111&hours=168"

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
      // Get feed URL from config, env var, or use default
      const config = ConfigService.get_default()
      const configUrl = config.config.widgets?.feed?.url
      const feedUrl = GLib.getenv("RSS_FEED_URL") || configUrl || this.DEFAULT_FEED_URL

      // Fetch RSS feed
      const result = await execAsync([
        "curl",
        "-s",
        "-f",
        "--max-time",
        "15",
        feedUrl,
      ])

      this.articles = this._parseRss(result)
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

  private _parseRss(xml: string): Article[] {
    const now = Date.now() / 1000
    const articles: Article[] = []

    // Simple XML parsing for RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1]

      const title = this._extractTag(itemXml, "title")
      const link = this._extractTag(itemXml, "link")
      const guid = this._extractTag(itemXml, "guid")
      const pubDate = this._extractTag(itemXml, "pubDate")
      const category = this._extractTag(itemXml, "category")
      const creator = this._extractTag(itemXml, "dc:creator")

      if (!title || !link) continue

      // Parse date
      let published = now
      if (pubDate) {
        try {
          published = new Date(pubDate).getTime() / 1000
        } catch {
          published = now
        }
      }

      // Calculate weight based on age (newer = higher weight)
      const ageSeconds = now - published
      const weight = Math.exp((-0.693147 * ageSeconds) / this.HALF_LIFE)

      // Use category or creator as source
      const source = category || creator || "Feed"

      articles.push({
        id: guid || link,
        title: this._decodeHtml(title),
        source: this._decodeHtml(source),
        url: this._validateUrl(link),
        published,
        weight,
      })
    }

    return articles
  }

  private _extractTag(xml: string, tag: string): string {
    // Handle CDATA sections
    const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i")
    const cdataMatch = xml.match(cdataRegex)
    if (cdataMatch) return cdataMatch[1].trim()

    // Handle regular tags
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
    const match = xml.match(regex)
    return match ? match[1].trim() : ""
  }

  private _decodeHtml(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
  }

  private _validateUrl(url: string): string {
    if (!url) return ""

    const trimmedUrl = url.trim()
    // Only allow http:// and https:// URLs
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
      return trimmedUrl
    }
    return ""
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

  openCurrent(): void {
    if (this.current?.url) {
      execAsync(["xdg-open", this.current.url]).catch((e) =>
        console.error("Failed to open URL:", e)
      )
    }
  }

  private _startRefreshLoop(): void {
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
