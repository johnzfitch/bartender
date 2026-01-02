import AstalWp from "gi://AstalWp"
import { createBinding, For } from "ags"

export default function AudioMixer() {
  const wp = AstalWp.get_default()

  if (!wp) {
    return <box cssClasses={["audio-mixer", "unavailable"]} />
  }

  const speaker = wp.defaultSpeaker
  const streams = createBinding(wp.audio, "streams")

  if (!speaker) {
    return <box cssClasses={["audio-mixer", "unavailable"]} />
  }

  const getAppIcon = (stream: AstalWp.Endpoint): string => {
    // Try to get app icon from stream metadata
    if (stream.icon) return stream.icon
    // Fallback to generic audio icon
    return "audio-volume-high-symbolic"
  }

  return (
    <menubutton cssClasses={["audio-mixer"]}>
      <image iconName={createBinding(speaker, "volumeIcon")} />
      <popover>
        <box orientation={1} cssClasses={["mixer-popover"]}>
          {/* Master volume */}
          <box cssClasses={["mixer-master"]}>
            <image iconName={createBinding(speaker, "volumeIcon")} />
            <label label="Master" hexpand halign={1} />
            <slider
              widthRequest={150}
              value={createBinding(speaker, "volume")}
              onChangeValue={({ value }) => speaker.set_volume(value)}
            />
            <label
              label={createBinding(speaker, "volume").as((v) =>
                `${Math.round(v * 100)}%`
              )}
              widthChars={4}
            />
          </box>

          {/* Divider */}
          <box cssClasses={["mixer-divider"]} />

          {/* Per-app streams */}
          <box cssClasses={["mixer-apps"]} orientation={1}>
            <label label="Applications" cssClasses={["mixer-section-label"]} />
            <For each={streams}>
              {(stream) => {
                // Skip non-playback streams
                if (stream.mediaClass !== "Stream/Output/Audio") {
                  return <box />
                }

                const volume = createBinding(stream, "volume")
                const muted = createBinding(stream, "mute")

                return (
                  <box cssClasses={["mixer-app"]}>
                    <image iconName={getAppIcon(stream)} />
                    <label
                      label={stream.description || stream.name || "Unknown"}
                      hexpand
                      halign={1}
                      maxWidthChars={15}
                      ellipsize={3}
                    />
                    <button
                      cssClasses={muted.as((m) =>
                        m ? ["mute-btn", "muted"] : ["mute-btn"]
                      )}
                      onClicked={() => (stream.mute = !stream.mute)}
                    >
                      <image
                        iconName={muted.as((m) =>
                          m
                            ? "audio-volume-muted-symbolic"
                            : "audio-volume-high-symbolic"
                        )}
                      />
                    </button>
                    <slider
                      widthRequest={100}
                      value={volume}
                      onChangeValue={({ value }) => stream.set_volume(value)}
                      sensitive={muted.as((m) => !m)}
                    />
                    <label
                      label={volume.as((v) => `${Math.round(v * 100)}%`)}
                      widthChars={4}
                    />
                  </box>
                )
              }}
            </For>
          </box>
        </box>
      </popover>
    </menubutton>
  )
}
