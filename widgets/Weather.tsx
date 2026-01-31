import { onCleanup } from "ags"
import { execAsync } from "ags/process"
import WeatherService from "../services/weather"
import ConfigService from "../services/config"

export default function Weather() {
  const weather = WeatherService.get_default()
  const config = ConfigService.get_default()

  const getTooltip = (): string => {
    if (weather.error) return `Error: ${weather.error}\nClick to retry`
    if (!weather.data) return "Loading..."
    const d = weather.data
    return `${d.condition}\nHigh: ${d.high}°F / Low: ${d.low}°F\nPrecip: ${d.precip}in\nClick for forecast`
  }

  const openForecast = () => {
    const loc = config.config.widgets?.weather?.location || ""
    execAsync(["xdg-open", `https://wttr.in/${loc}`]).catch(console.error)
  }

  const unsub = weather.subscribe(() => {})
  onCleanup(() => unsub())

  return (
    <button
      cssClasses={["weather"]}
      tooltipText={getTooltip()}
      onClicked={() => weather.error ? weather.manualRefresh() : openForecast()}
      $={(self) => {
        const update = () => {
          self.tooltipText = getTooltip()
          self.cssClasses = weather.error ? ["weather", "error"] : ["weather"]
        }
        update()
        weather.subscribe(update)
      }}
    >
      <box spacing={6}>
        <label
          cssClasses={["weather-condition"]}
          label="..."
          $={(self) => {
            const update = () => {
              if (weather.error) self.label = "Weather unavailable"
              else if (!weather.data) self.label = "..."
              else self.label = weather.data.condition
            }
            update()
            weather.subscribe(update)
          }}
        />
        <label
          cssClasses={["weather-temp"]}
          label=""
          $={(self) => {
            const update = () => {
              if (!weather.data) self.label = ""
              else self.label = `${weather.data.temp}°F`
            }
            update()
            weather.subscribe(update)
          }}
        />
        <box cssClasses={["weather-hilo"]} spacing={4}>
          <image iconName="pan-up-symbolic" />
          <label
            label=""
            $={(self) => {
              const update = () => {
                if (!weather.data) self.label = ""
                else self.label = `${weather.data.high}°`
              }
              update()
              weather.subscribe(update)
            }}
          />
          <image iconName="pan-down-symbolic" />
          <label
            label=""
            $={(self) => {
              const update = () => {
                if (!weather.data) self.label = ""
                else self.label = `${weather.data.low}°`
              }
              update()
              weather.subscribe(update)
            }}
          />
        </box>
        <box
          cssClasses={["weather-precip"]}
          spacing={2}
          $={(self) => {
            const update = () => {
              self.visible = weather.data?.precip ? weather.data.precip > 0 : false
            }
            update()
            weather.subscribe(update)
          }}
        >
          <image iconName="weather-showers-symbolic" />
          <label
            label=""
            $={(self) => {
              const update = () => {
                if (!weather.data) self.label = ""
                else self.label = `${weather.data.precip}in`
              }
              update()
              weather.subscribe(update)
            }}
          />
        </box>
      </box>
    </button>
  )
}
