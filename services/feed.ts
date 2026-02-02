import GLib from "gi://GLib"
import Gio from "gi://Gio"
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

interface CachedArticle extends Article {
  firstSeen: number
}

interface ArticleCache {
  version: number
  articles: CachedArticle[]
  lastPruned: number
}

interface Channel {
  name: string
  minAge: number
  maxAge: number
  prob: number
}

const CHANNELS: Channel[] = [
  { name: "breaking",     minAge: 0,       maxAge: 10800,   prob: 0.60 },
  { name: "recent",       minAge: 10800,   maxAge: 86400,   prob: 0.25 },
  { name: "archive",      minAge: 86400,   maxAge: 604800,  prob: 0.10 },
  { name: "deep_archive", minAge: 604800,  maxAge: 2592000, prob: 0.05 }
]

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
  private _recentlyShown: Map<string, number> = new Map()

  private readonly HALF_LIFE = 3 * 3600
  private readonly STATE_DIR = `${GLib.get_home_dir()}/.local/state/bartender`
  private readonly CACHE_PATH = `${GLib.get_home_dir()}/.local/state/bartender/article-cache.json`

  static get_default(): FeedService {
    if (!this._instance) {
      this._instance = new FeedService()
    }
    return this._instance
  }

  private constructor() {
    console.log("[Feed] Service starting...")
    this._ensureStateDir()
    this._startRefreshLoop()
    this._scheduleNextCycle()
    console.log("[Feed] Service initialized")
  }

  subscribe(callback: () => void): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  private _notify(): void {
    this._listeners.forEach((cb) => cb())
  }

  private _ensureStateDir(): void {
    const dir = Gio.File.new_for_path(this.STATE_DIR)
    if (!dir.query_exists(null)) {
      try {
        dir.make_directory_with_parents(null)
      } catch (e) {
        console.warn(`[Feed] Failed to create state directory: ${e}`)
      }
    }
  }

  private _debugLog(event: string, ...data: any[]): void {
    const config = ConfigService.get_default().config.feed
    if (!config.debug_log) return

    this._ensureStateDir()

    const date = new Date()
    const dateStr = date.toISOString().split('T')[0]
    const logPath = `${this.STATE_DIR}/feed-debug-${dateStr}.log`
    const timestamp = Math.floor(date.getTime() / 1000)
    const line = `${timestamp}|${event}|${data.join('|')}\n`

    try {
      const file = Gio.File.new_for_path(logPath)
      let existing = ""
      if (file.query_exists(null)) {
        const [success, contents] = file.load_contents(null)
        if (success) {
          const decoder = new TextDecoder()
          existing = decoder.decode(contents)
        }
      }
      GLib.file_set_contents(logPath, existing + line)
    } catch (e) {
      console.warn(`[Feed] Failed to write debug log: ${e}`)
    }
  }

  private _loadCache(): ArticleCache {
    const file = Gio.File.new_for_path(this.CACHE_PATH)
    if (!file.query_exists(null)) {
      return { version: 1, articles: [], lastPruned: Date.now() / 1000 }
    }

    try {
      const [success, contents] = file.load_contents(null)
      if (!success) return { version: 1, articles: [], lastPruned: Date.now() / 1000 }

      const decoder = new TextDecoder()
      const data = JSON.parse(decoder.decode(contents))
      return data
    } catch (e) {
      console.warn(`[Feed] Failed to load cache: ${e}`)
      return { version: 1, articles: [], lastPruned: Date.now() / 1000 }
    }
  }

  private _saveCache(cache: ArticleCache): void {
    this._ensureStateDir()
    try {
      const json = JSON.stringify(cache, null, 2)
      GLib.file_set_contents(this.CACHE_PATH, json)
    } catch (e) {
      console.warn(`[Feed] Failed to save cache: ${e}`)
    }
  }

  private _mergeWithCache(fresh: Article[], cache: ArticleCache): CachedArticle[] {
    const now = Date.now() / 1000
    const seen = new Map<string, CachedArticle>()

    // Add existing cached articles
    for (const cached of cache.articles) {
      seen.set(cached.id, cached)
    }

    // Add or update with fresh articles
    for (const article of fresh) {
      if (seen.has(article.id)) {
        // Update existing article but preserve firstSeen
        const cached = seen.get(article.id)!
        seen.set(article.id, { ...article, firstSeen: cached.firstSeen })
      } else {
        // New article
        seen.set(article.id, { ...article, firstSeen: now })
      }
    }

    return Array.from(seen.values())
  }

  private _slidingWindowPrune(cache: ArticleCache, targetSize: number): ArticleCache {
    if (cache.articles.length <= targetSize) {
      return cache  // No pruning needed
    }

    // Sort by published date (newest first)
    const sorted = [...cache.articles].sort((a, b) => b.published - a.published)

    // Keep only target size (FIFO - oldest drop off)
    const pruned = sorted.slice(0, targetSize)

    const now = Date.now() / 1000
    const droppedCount = cache.articles.length - pruned.length
    const oldestKept = pruned[pruned.length - 1]?.published || now
    const ageOfOldest = (now - oldestKept) / 86400  // days

    console.log(`[Feed] Sliding window: kept ${pruned.length}, dropped ${droppedCount} oldest (oldest kept: ${ageOfOldest.toFixed(1)}d ago)`)

    return {
      version: 1,
      articles: pruned,
      lastPruned: now
    }
  }

  private _selectChannel(): Channel {
    const rand = Math.random()
    let cumulative = 0

    for (const channel of CHANNELS) {
      cumulative += channel.prob
      if (rand < cumulative) {
        return channel
      }
    }

    return CHANNELS[0]
  }

  private _filterByChannel(articles: CachedArticle[], channel: Channel): CachedArticle[] {
    const now = Date.now() / 1000
    return articles.filter(a => {
      const age = now - a.published
      return age >= channel.minAge && age < channel.maxAge
    })
  }

  private _shouldDoInitialLoad(cache: ArticleCache): boolean {
    const config = ConfigService.get_default().config.feed
    const targetSize = config.cache_size ?? 1000

    // If cache is significantly below target, do initial load
    const cacheSize = cache.articles.length
    const threshold = targetSize * 0.5  // 50% of target

    if (cacheSize < threshold) {
      console.log(`[Feed] Cache below threshold (${cacheSize}/${targetSize}), doing initial load`)
      return true
    }

    return false
  }

  private _buildFeedUrl(baseUrl: string, isInitialLoad: boolean): string {
    const config = ConfigService.get_default().config.feed

    if (!config.enable_incremental) {
      // Legacy mode: always pull default feed
      return baseUrl
    }

    if (isInitialLoad) {
      const days = config.initial_load_days ?? 30
      const hours = days * 24
      const nb = config.cache_size ?? 1000
      // Add query params: ?hours=720&nb=1000
      const separator = baseUrl.includes('?') ? '&' : '?'
      return `${baseUrl}${separator}hours=${hours}&nb=${nb}`
    } else {
      const hours = config.incremental_hours ?? 6
      const nb = 100  // Pull ~100 new articles per refresh
      const separator = baseUrl.includes('?') ? '&' : '?'
      return `${baseUrl}${separator}hours=${hours}&nb=${nb}`
    }
  }

  private _logCacheMetrics(): void {
    const config = ConfigService.get_default().config.feed
    if (!config.debug_log) return

    const now = Date.now() / 1000
    const cached = this.articles as CachedArticle[]

    if (cached.length === 0) return

    // Age distribution
    const ages = cached.map(a => now - a.published)
    const oldestAge = Math.max(...ages) / 86400  // days
    const newestAge = Math.min(...ages) / 86400
    const avgAge = (ages.reduce((sum, a) => sum + a, 0) / ages.length) / 86400

    // Weight distribution
    const weights = cached.map(a => a.weight)
    const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length
    const maxWeight = Math.max(...weights)
    const minWeight = Math.min(...weights)

    // Channel distribution
    const channelDist = CHANNELS.map(ch => ({
      name: ch.name,
      count: this._filterByChannel(cached, ch).length,
      pct: (this._filterByChannel(cached, ch).length / cached.length * 100).toFixed(1)
    }))

    console.log(`[Feed] Cache Metrics:`)
    console.log(`  Size: ${cached.length} articles`)
    console.log(`  Age: ${newestAge.toFixed(1)}d - ${oldestAge.toFixed(1)}d (avg: ${avgAge.toFixed(1)}d)`)
    console.log(`  Weight: ${minWeight.toFixed(4)} - ${maxWeight.toFixed(4)} (avg: ${avgWeight.toFixed(4)})`)
    console.log(`  Channels: ${channelDist.map(c => `${c.name}=${c.pct}%`).join(', ')}`)
  }

  private _weightedSelectWithChannelBias(articles: CachedArticle[], channel: Channel): Article {
    const now = Date.now() / 1000
    const config = ConfigService.get_default().config.feed
    const diversityHalfLife = config.diversity_half_life ?? 1200

    // Calculate weights with diversity penalty AND channel bias
    const weights = articles.map(a => {
      let weight = a.weight

      // Apply diversity penalty if recently shown
      const lastShown = this._recentlyShown.get(a.id)
      if (lastShown !== undefined) {
        const timeSinceShown = now - lastShown
        const penalty = 0.99 * Math.exp(-0.693147 * timeSinceShown / diversityHalfLife)
        const diversityWeight = 1.0 - penalty
        weight *= diversityWeight
      }

      // Apply channel bias: articles in selected channel get 3x weight boost
      const age = now - a.published
      const inChannel = age >= channel.minAge && age < channel.maxAge
      if (inChannel) {
        weight *= 3.0
      }

      return weight
    })

    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    if (totalWeight === 0) {
      return articles[0]
    }

    let pick = Math.random() * totalWeight
    for (let i = 0; i < articles.length; i++) {
      pick -= weights[i]
      if (pick <= 0) {
        return articles[i]
      }
    }

    return articles[0]
  }

  private _weightedSelectWithDiversity(articles: CachedArticle[]): Article {
    const now = Date.now() / 1000
    const config = ConfigService.get_default().config.feed
    const diversityHalfLife = config.diversity_half_life ?? 1200

    // Calculate weights with diversity penalty
    const weights = articles.map(a => {
      let weight = a.weight
      let appliedPenalty = false

      // Apply diversity penalty if recently shown
      const lastShown = this._recentlyShown.get(a.id)
      if (lastShown !== undefined) {
        const timeSinceShown = now - lastShown
        const penalty = 0.99 * Math.exp(-0.693147 * timeSinceShown / diversityHalfLife)
        const diversityWeight = 1.0 - penalty
        weight *= diversityWeight
        appliedPenalty = true

        // Debug: log if article was seen very recently
        if (config.debug_log && timeSinceShown < 60) {
          console.log(`[Feed] Diversity penalty: ${a.title.slice(0,30)} last shown ${timeSinceShown.toFixed(0)}s ago, weight ${a.weight.toFixed(4)} -> ${weight.toFixed(6)}`)
        }
      }

      return weight
    })

    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    if (totalWeight === 0) {
      return articles[0]
    }

    let pick = Math.random() * totalWeight
    for (let i = 0; i < articles.length; i++) {
      pick -= weights[i]
      if (pick <= 0) {
        return articles[i]
      }
    }

    return articles[0]
  }

  private _calculateDisplayDuration(title: string): number {
    const wordCount = title.split(/\s+/).length
    const base = (wordCount * 2) / 4.17  // ~250 WPM reading speed
    const config = ConfigService.get_default().config.feed
    const displayMin = config.display_min ?? 6
    const displayMax = config.display_max ?? 15
    return Math.max(displayMin, Math.min(displayMax, base))
  }

  private _scheduleNextCycle(): void {
    if (this._cycleTimer) GLib.source_remove(this._cycleTimer)

    const duration = this.current
      ? this._calculateDisplayDuration(this.current.title)
      : 8

    this._cycleTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration * 1000, () => {
      if (!this._paused && this.articles.length > 0) {
        this._selectNext()
      }
      this._scheduleNextCycle()
      return GLib.SOURCE_REMOVE
    })
  }

  private async _actualizeFeed(): Promise<void> {
    const config = ConfigService.get_default().config.feed
    const baseUrl = config.actualize_base_url?.trim()
    const feedIds = config.actualize_feed_ids?.trim()

    if (!baseUrl || !feedIds) return

    const ids = feedIds.split(',').map(id => id.trim()).filter(id => id)
    if (ids.length === 0) return

    console.log(`[Feed] Actualizing ${ids.length} feeds...`)

    // Trigger actualize for each feed ID sequentially (some feeds may require previous ones to complete)
    for (const id of ids) {
      try {
        const url = `${baseUrl}?c=feed&a=actualize&id=${id}&ajax=1`
        const result = await execAsync(["curl", "-s", "-X", "POST", "--max-time", "10", url]).catch(err => {
          console.warn(`[Feed] curl error for feed ${id}: ${String(err)}`)
          return ""
        })
        const response = result.trim()
        if (response.includes("OK") || response === "") {
          console.log(`[Feed] ✓ Actualized feed ${id}`)
        } else if (response.length < 100) {
          console.log(`[Feed] Actualized feed ${id}: ${response}`)
        } else {
          console.warn(`[Feed] Unexpected response for feed ${id} (${response.length} bytes)`)
        }
      } catch (e: any) {
        console.warn(`[Feed] Failed to actualize feed ${id}: ${String(e)}`)
      }
    }

    console.log("[Feed] Actualization complete")

    // Wait a moment for the feeds to update
    await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
      resolve(undefined)
      return GLib.SOURCE_REMOVE
    }))
  }

  async refresh(showLoading: boolean = false): Promise<void> {
    console.log("[Feed] refresh() called")

    if (showLoading) {
      this.status = "loading"
      this._notify()
    }

    try {
      await this._actualizeFeed()

      const config = ConfigService.get_default()
      const baseFeedUrl = config.config.feed.url?.trim() || ""
      const authToken = config.config.feed.auth_token?.trim() || ""

      if (!baseFeedUrl || (!baseFeedUrl.startsWith("http://") && !baseFeedUrl.startsWith("https://"))) {
        this.status = "error"
        this.error = "No feed URL configured. Set [feed] url in ~/.config/bartender/config.toml"
        this._notify()
        return
      }

      // Load cache to determine initial vs incremental
      let cache = this._loadCache()
      const isInitialLoad = this._shouldDoInitialLoad(cache)

      // Build feed URL with appropriate parameters
      const feedUrl = this._buildFeedUrl(baseFeedUrl, isInitialLoad)

      console.log(`[Feed] ${isInitialLoad ? 'Initial' : 'Incremental'} fetch: ${feedUrl}`)

      // Fetch feed
      const curlArgs = ["curl", "-s", "-f", "--max-time", "30"]  // Longer timeout for large feeds
      if (authToken) {
        if (/[\r\n]/.test(authToken)) {
          console.warn("[Feed] auth_token contains invalid characters, ignoring")
        } else {
          curlArgs.push("-H", `Authorization: ${authToken}`)
        }
      }
      curlArgs.push(feedUrl)

      const result = await execAsync(curlArgs)
      console.log(`[Feed] Got ${result.length} bytes`)

      const freshArticles = this._parseRss(result)
      console.log(`[Feed] Parsed ${freshArticles.length} articles`)

      // Merge with cache
      const merged = this._mergeWithCache(freshArticles, cache)

      // Apply sliding window to maintain target size
      const targetSize = config.config.feed.cache_size ?? 1000
      const prunedCache = this._slidingWindowPrune({ version: 1, articles: merged, lastPruned: cache.lastPruned }, targetSize)

      this._saveCache(prunedCache)
      this.articles = prunedCache.articles

      console.log(`[Feed] Total articles after merge: ${this.articles.length}`)

      // Enhanced debug logging
      const now = Date.now() / 1000
      const channelCounts = CHANNELS.map(ch => this._filterByChannel(prunedCache.articles, ch).length)
      const oldestArticle = Math.min(...prunedCache.articles.map(a => a.published))
      const newestArticle = Math.max(...prunedCache.articles.map(a => a.published))
      const cacheAgeDays = (now - oldestArticle) / 86400

      this._debugLog("R", ...channelCounts, `age:${cacheAgeDays.toFixed(1)}d`, `size:${prunedCache.articles.length}`)

      // Log detailed cache metrics if debug enabled
      this._logCacheMetrics()

      this.status = "ready"
      this.error = ""

      if (!this.current && this.articles.length > 0) {
        this._selectNext()
        console.log(`[Feed] Selected: ${this.current?.title?.substring(0, 50)}...`)
      }
    } catch (e: any) {
      this.status = "error"
      this.error = e.message || "Failed to fetch feed"
      console.error("[Feed] ERROR:", this.error)
    }

    this._notify()
    console.log(`[Feed] Done - status: ${this.status}`)
  }

  private _parseRss(xml: string): Article[] {
    const now = Date.now() / 1000
    const articles: Article[] = []
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

      let published = now
      if (pubDate) {
        try {
          published = new Date(pubDate).getTime() / 1000
        } catch {
          published = now
        }
      }

      const ageSeconds = now - published
      const weight = Math.exp((-0.693147 * ageSeconds) / this.HALF_LIFE)
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
    const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i")
    const cdataMatch = xml.match(cdataRegex)
    if (cdataMatch) return cdataMatch[1].trim()

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
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
      return trimmedUrl
    }
    return ""
  }

  private _selectNext(): void {
    const config = ConfigService.get_default().config.feed
    const epsilon = config.epsilon ?? 0.15

    // Adaptive diversity filtering with sliding threshold
    const now = Date.now() / 1000
    const diversityHalfLife = config.diversity_half_life ?? 1200
    const totalArticles = this.articles.length

    // Base threshold: 1.5x full cycle time (realistic for 20 articles at 8s avg = 240s)
    const avgDisplayTime = ((config.display_min ?? 6) + (config.display_max ?? 15)) / 2
    const fullCycleTime = totalArticles * avgDisplayTime
    const baseThreshold = fullCycleTime * 1.5  // Don't repeat until 1.5 full cycles

    // Try progressively relaxed thresholds until we have enough candidates
    let candidates: CachedArticle[] = []
    let usedThreshold = baseThreshold
    const thresholdSteps = [1.0, 0.67, 0.33, 0]  // 100%, 67%, 33%, 0% of base

    for (const factor of thresholdSteps) {
      usedThreshold = baseThreshold * factor
      candidates = (this.articles as CachedArticle[]).filter(a => {
        const lastShown = this._recentlyShown.get(a.id)
        if (lastShown === undefined) return true
        const timeSince = now - lastShown
        return timeSince >= usedThreshold
      })

      // Need at least 5 candidates to maintain variety
      if (candidates.length >= 5) break
    }

    if (config.debug_log) {
      console.log(`[Feed] ${candidates.length}/${this.articles.length} candidates (${usedThreshold.toFixed(0)}s threshold)`)
    }

    let selected: Article
    let mode: string

    // Select channel for biasing (not hard filtering)
    const channel = this._selectChannel()

    if (Math.random() < epsilon) {
      // EXPLORE: uniform random from fresh articles
      selected = candidates[Math.floor(Math.random() * candidates.length)]
      mode = "exr"
    } else {
      // EXPLOIT: weighted selection with channel bias
      selected = this._weightedSelectWithChannelBias(candidates, channel)
      mode = "exp"
    }

    this._recentlyShown.set(selected.id, now)
    this.current = selected

    // Debug log
    const age = now - selected.published
    const ageWeight = Math.exp((-0.693147 * age) / this.HALF_LIFE)
    this._debugLog("S", channel.name.slice(0,3), mode, selected.id, selected.title.slice(0,30), ageWeight.toFixed(2), selected.weight.toFixed(2))

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
      execAsync(["xdg-open", this.current.url]).catch(console.error)
    }
  }

  private _startRefreshLoop(): void {
    // Initial load - show loading state
    this.refresh(true)
    const config = ConfigService.get_default().config.feed
    const intervalSeconds = config.refresh_interval ?? 90
    this._refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalSeconds * 1000, () => {
      // Background refresh - don't show loading state
      this.refresh(false)
      return GLib.SOURCE_CONTINUE
    })
  }

  destroy(): void {
    if (this._refreshTimer) GLib.source_remove(this._refreshTimer)
    if (this._cycleTimer) GLib.source_remove(this._cycleTimer)
  }
}

export default FeedService
