import GLib from "gi://GLib"
import { execAsync } from "ags/process"
import ConfigService from "./config"

export interface WeatherData {
  temp: number
  condition: string
  high: number
  low: number
  precip: number
}

interface WeatherGovPoint {
  properties: {
    forecast: string
    forecastHourly: string
    observationStations: string
  }
}

interface WeatherGovStation {
  properties: {
    temperature: { value: number }
    textDescription: string
    precipitationLastHour: { value: number | null }
  }
}

interface WeatherGovForecast {
  properties: {
    periods: Array<{
      temperature: number
      shortForecast: string
      name: string
      isDaytime: boolean
    }>
  }
}

class WeatherService {
  private static _instance: WeatherService | null = null

  data: WeatherData | null = null
  error: string | null = null
  loading: boolean = false

  private _listeners: Set<() => void> = new Set()
  private _refreshTimer: number | null = null

  static get_default(): WeatherService {
    if (!this._instance) {
      this._instance = new WeatherService()
    }
    return this._instance
  }

  private constructor() {
    console.log("[Weather] Service starting...")
    this._startRefreshLoop()
    console.log("[Weather] Service initialized")
  }

  subscribe(callback: () => void): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  private _notify(): void {
    this._listeners.forEach((cb) => cb())
  }

  private async _getLocation(): Promise<{ lat: number; lon: number }> {
    const config = ConfigService.get_default().config.weather
    const location = config.location?.trim() || "auto"

    // Check if it's in "lat,lon" format
    if (location !== "auto") {
      const parts = location.split(",").map(s => s.trim())
      if (parts.length === 2) {
        const lat = parseFloat(parts[0])
        const lon = parseFloat(parts[1])
        if (!isNaN(lat) && !isNaN(lon)) {
          console.log(`[Weather] Using configured location: ${lat}, ${lon}`)
          return { lat, lon }
        }
      }
    }

    // Auto-detect location via IP
    console.log("[Weather] Auto-detecting location via IP...")
    try {
      const result = await execAsync(["curl", "-s", "--max-time", "5", "http://ip-api.com/json/?fields=lat,lon"])
      const data = JSON.parse(result)
      if (data.lat && data.lon) {
        console.log(`[Weather] Auto-detected location: ${data.lat}, ${data.lon}`)
        return { lat: data.lat, lon: data.lon }
      }
    } catch (e) {
      console.warn(`[Weather] Failed to auto-detect location: ${e}`)
    }

    // Fallback to US center
    console.log("[Weather] Using fallback location (US center)")
    return { lat: 39.8283, lon: -98.5795 }
  }

  async refresh(): Promise<void> {
    console.log("[Weather] refresh() called")
    this.loading = true
    this._notify()

    try {
      const { lat, lon } = await this._getLocation()

      // Get grid point data
      const pointUrl = `https://api.weather.gov/points/${lat},${lon}`
      console.log(`[Weather] Fetching: ${pointUrl}`)
      const pointData = await this._fetchJson<WeatherGovPoint>(pointUrl)
      console.log("[Weather] Got point data")

      // Get observation station
      const stationsUrl = pointData.properties.observationStations
      const stationsData = await this._fetchJson<{ features: Array<{ id: string }> }>(stationsUrl)
      const stationId = stationsData.features[0].id
      console.log(`[Weather] Station: ${stationId}`)

      // Get current conditions
      const obsUrl = `${stationId}/observations/latest`
      const obsData = await this._fetchJson<WeatherGovStation>(obsUrl)
      console.log("[Weather] Got observations")

      // Get forecast for high/low
      const forecastUrl = pointData.properties.forecast
      const forecastData = await this._fetchJson<WeatherGovForecast>(forecastUrl)
      console.log("[Weather] Got forecast")

      // Find first daytime (high) and nighttime (low) periods
      const periods = forecastData.properties.periods
      const dayPeriod = periods.find(p => p.isDaytime)
      const nightPeriod = periods.find(p => !p.isDaytime)

      // Convert Celsius to Fahrenheit
      const tempC = obsData.properties.temperature.value
      const tempF = tempC != null ? Math.round((tempC * 9/5) + 32) : 0

      this.data = {
        temp: tempF,
        condition: obsData.properties.textDescription || periods[0]?.shortForecast || "Unknown",
        high: dayPeriod?.temperature ?? 0,
        low: nightPeriod?.temperature ?? 0,
        precip: obsData.properties.precipitationLastHour?.value || 0,
      }

      this.error = null
      this.loading = false
      this._notify()
      console.log(`[Weather] Success: ${this.data.temp}°F ${this.data.condition}`)
    } catch (e: any) {
      const errorMsg = e.message || String(e) || "Unknown error"
      console.error(`[Weather] ERROR: ${errorMsg}`)
      this.error = errorMsg
      this.loading = false
      this._notify()
    }
  }

  private async _fetchJson<T>(url: string): Promise<T> {
    const result = await execAsync([
      "curl", "-sL", "--max-time", "10",
      "-H", "User-Agent: bartender/1.0",
      url
    ])

    if (!result || result.trim().length === 0) {
      throw new Error(`Empty response from ${url}`)
    }

    return JSON.parse(result)
  }

  manualRefresh(): void {
    this.refresh()
  }

  private _startRefreshLoop(): void {
    this.refresh()
    this._refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15 * 60 * 1000, () => {
      this.refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  destroy(): void {
    if (this._refreshTimer) {
      GLib.source_remove(this._refreshTimer)
    }
  }
}

export default WeatherService
