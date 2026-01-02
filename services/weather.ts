import GLib from "gi://GLib"
import { execAsync } from "ags/process"
import ConfigService from "./config"

export interface WeatherData {
  temp: string
  tempF: number
  tempC: number
  condition: string
  weatherCode: number
  icon: string
  isRaining: boolean
  isSnowing: boolean
  humidity: number
  windSpeed: string
  feelsLike: string
}

// Weather code ranges
const RAIN_CODES = [
  176, 179, 182, 185, // Light rain/drizzle
  200, 201, 202, 230, 231, 232, // Thunderstorm
  263, 266, 281, 284, // Drizzle
  293, 296, 299, 302, 305, 308, 311, 314, // Rain
  353, 356, 359, // Rain showers
]

const SNOW_CODES = [
  227, 230, // Blowing snow
  320, 323, 326, 329, 332, 335, 338, // Snow
  350, // Ice pellets
  368, 371, 374, 377, // Snow showers
  392, 395, // Snow with thunder
]

const getWeatherIcon = (code: number): string => {
  if (code === 113) return "weather-clear-symbolic"
  if ([116, 119, 122].includes(code)) return "weather-few-clouds-symbolic"
  if ([143, 248, 260].includes(code)) return "weather-fog-symbolic"
  if (RAIN_CODES.includes(code)) return "weather-showers-symbolic"
  if (SNOW_CODES.includes(code)) return "weather-snow-symbolic"
  if ([200, 386, 389].includes(code)) return "weather-storm-symbolic"
  return "weather-overcast-symbolic"
}

class WeatherService {
  private static _instance: WeatherService | null = null

  data: WeatherData | null = null
  error: string | null = null
  loading: boolean = false

  private _listeners: Set<() => void> = new Set()
  private _refreshTimer: number | null = null
  private _retryCount: number = 0
  private _maxRetries: number = 3

  static get_default(): WeatherService {
    if (!this._instance) {
      this._instance = new WeatherService()
    }
    return this._instance
  }

  private constructor() {
    this._startRefreshLoop()
  }

  subscribe(callback: () => void): () => void {
    this._listeners.add(callback)
    return () => this._listeners.delete(callback)
  }

  private _notify(): void {
    this._listeners.forEach((cb) => cb())
  }

  async refresh(): Promise<void> {
    this.loading = true
    this._notify()

    try {
      // Get location from config, env var, or use auto
      const config = ConfigService.get_default()
      const configLocation = config.config.widgets?.weather?.location
      const location = GLib.getenv("WEATHER_LOCATION") || configLocation || ""
      const url = `https://wttr.in/${location}?format=j1`

      const result = await execAsync([
        "curl",
        "-s",
        "-f",
        "--max-time",
        "10",
        url,
      ])

      const json = JSON.parse(result)
      const current = json.current_condition?.[0]

      if (!current) {
        throw new Error("Invalid weather data")
      }

      const weatherCode = parseInt(current.weatherCode, 10)

      this.data = {
        temp: `${current.temp_F}°F`,
        tempF: parseInt(current.temp_F, 10),
        tempC: parseInt(current.temp_C, 10),
        condition: current.weatherDesc?.[0]?.value || "Unknown",
        weatherCode,
        icon: getWeatherIcon(weatherCode),
        isRaining: RAIN_CODES.includes(weatherCode),
        isSnowing: SNOW_CODES.includes(weatherCode),
        humidity: parseInt(current.humidity, 10),
        windSpeed: `${current.windspeedMiles} mph`,
        feelsLike: `${current.FeelsLikeF}°F`,
      }

      this.error = null
      this._retryCount = 0
      this.loading = false
      this._notify()
    } catch (e: any) {
      this.error = e.message || "Failed to fetch weather"
      this.loading = false
      this._retryCount++

      console.error("WeatherService error:", e.message || e)

      // Exponential backoff: 10min, 20min, 40min
      if (this._retryCount <= this._maxRetries) {
        const retryDelay = 10 * 60 * 1000 * Math.pow(2, this._retryCount - 1)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, retryDelay, () => {
          this.refresh()
          return GLib.SOURCE_REMOVE
        })
      }

      this._notify()
    }
  }

  manualRefresh(): void {
    this._retryCount = 0
    this.refresh()
  }

  private _startRefreshLoop(): void {
    // Initial fetch
    this.refresh()

    // Refresh every 10 minutes
    this._refreshTimer = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      10 * 60 * 1000,
      () => {
        this.refresh()
        return GLib.SOURCE_CONTINUE
      }
    )
  }

  destroy(): void {
    if (this._refreshTimer) {
      GLib.source_remove(this._refreshTimer)
    }
  }
}

export default WeatherService
