import { onCleanup } from "ags"
import WeatherService from "../services/weather"

export default function Weather() {
  const weather = WeatherService.get_default()

  // Subscribe for tooltip updates
  const unsub = weather.subscribe(() => {})
  onCleanup(() => unsub())

  return (
    <menubutton
      cssClasses={["weather"]}
      tooltipText={weather.data?.condition ?? "Loading..."}
      $={(self) => {
        weather.subscribe(() => {
          const d = weather.data
          const e = weather.error

          // Update CSS classes
          const classes = ["weather"]
          if (e) classes.push("error")
          else if (!d) classes.push("loading")
          else classes.push("clear")
          self.cssClasses = classes

          // Update tooltip
          self.tooltipText = e ? `Error: ${e}` : d?.condition ?? "Loading..."
        })
      }}
    >
      <box cssClasses={["weather-info"]}>
        <image
          iconName="weather-overcast-symbolic"
          $={(self) => {
            self.iconName = weather.data?.icon ?? "weather-overcast-symbolic"
            weather.subscribe(() => {
              self.iconName = weather.error
                ? "network-offline-symbolic"
                : weather.data?.icon ?? "weather-overcast-symbolic"
            })
          }}
        />
        <label
          label="..."
          $={(self) => {
            self.label = weather.data?.temp ?? "..."
            weather.subscribe(() => {
              self.label = weather.error ? "—" : weather.data?.temp ?? "..."
            })
          }}
        />
      </box>
      <popover>
        <box orientation={1} cssClasses={["weather-popover"]}>
          <label
            label="Loading"
            cssClasses={["weather-condition"]}
            $={(self) => {
              weather.subscribe(() => {
                self.label = weather.data?.condition ?? "Loading"
              })
            }}
          />
          <box cssClasses={["weather-details"]}>
            <label
              label="—"
              $={(self) => {
                weather.subscribe(() => {
                  self.label = weather.data?.feelsLike ? `Feels ${weather.data.feelsLike}` : "—"
                })
              }}
            />
            <label label="·" cssClasses={["weather-sep"]} />
            <label
              label="—"
              $={(self) => {
                weather.subscribe(() => {
                  self.label = weather.data ? `${weather.data.humidity}%` : "—"
                })
              }}
            />
            <label label="·" cssClasses={["weather-sep"]} />
            <label
              label="—"
              $={(self) => {
                weather.subscribe(() => {
                  self.label = weather.data?.windSpeed ?? "—"
                })
              }}
            />
          </box>
        </box>
      </popover>
    </menubutton>
  )
}
