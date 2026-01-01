import { createBinding, For, This } from "ags"
import app from "ags/gtk4/app"
import style from "./styles/style.scss"
import Bar from "./Bar"

app.start({
  instanceName: "bartender",
  css: style,
  requestHandler(request, respond) {
    if (request === "quit") {
      app.quit()
      respond("bye")
    }
  },
  main() {
    const monitors = createBinding(app, "monitors")

    return (
      <For each={monitors}>
        {(monitor) => (
          <This this={app}>
            <Bar gdkmonitor={monitor} />
          </This>
        )}
      </For>
    )
  },
})
