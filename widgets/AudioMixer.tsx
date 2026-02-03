import GLib from "gi://GLib"
import AstalWp from "gi://AstalWp"
import { createBinding, createState, For, onCleanup } from "ags"
import { execAsync } from "ags/process"
import ConfigService from "../services/config"
import AudioControlService from "../services/audioctl"

type JackMode = "speakers" | "headphones" | "both"

export default function AudioMixer() {
  const wp = AstalWp.get_default()

  if (!wp) {
    return <box cssClasses={["audio-mixer", "unavailable"]} />
  }

  const audio = wp.audio
  const speakers = createBinding(audio, "speakers")
  const streams = createBinding(audio, "streams")

  // Output jack state (speakers/headphones/both) - codec-agnostic
  const [jackMode, setJackMode] = createState<JackMode>("speakers")
  const config = ConfigService.get_default()
  const audioCard = String(config.config.audio.card)
  const audioCtl = AudioControlService.get_default()

  async function refreshJackMode(): Promise<void> {
    try {
      const speakerCtl = audioCtl.speakerControl
      const headphoneCtl = audioCtl.headphoneControl

      const speakerOn = await audioCtl.getControlState(speakerCtl, audioCard)
      const headphoneOn = await audioCtl.getControlState(headphoneCtl, audioCard)

      if (speakerOn && headphoneOn) {
        setJackMode("both")
      } else if (headphoneOn) {
        setJackMode("headphones")
      } else {
        setJackMode("speakers")
      }
    } catch (e) {
      console.error("[AudioMixer] Jack refresh error:", e)
    }
  }

  async function setJack(mode: JackMode): Promise<void> {
    try {
      const speakerCtl = audioCtl.speakerControl
      const headphoneCtl = audioCtl.headphoneControl

      switch (mode) {
        case "speakers":
          await audioCtl.setControlState(speakerCtl, audioCard, "on")
          await audioCtl.setControlState(headphoneCtl, audioCard, "off")
          break
        case "headphones":
          await audioCtl.setControlState(speakerCtl, audioCard, "off")
          await audioCtl.setControlState(headphoneCtl, audioCard, "on")
          break
        case "both":
          await audioCtl.setControlState(speakerCtl, audioCard, "on")
          await audioCtl.setControlState(headphoneCtl, audioCard, "on")
          break
      }
      setJackMode(mode)
    } catch (e) {
      console.error("[AudioMixer] Jack set error:", e)
    }
  }

  // Initial refresh and polling for jack state
  refreshJackMode()
  const jackTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
    refreshJackMode()
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => GLib.source_remove(jackTimer))

  const getAppIcon = (stream: AstalWp.Stream): string => {
    if (stream.icon) return stream.icon
    return "audio-volume-high-symbolic"
  }

  const shortenName = (name: string) =>
    name
      .replace("Built-in Audio ", "")
      .replace(" Stereo", "")
      .replace("Analog", "Speakers")
      .replace("HDMI / DisplayPort", "HDMI")
      .replace("Digital", "HDMI")

  function MasterVolume() {
    const speaker = audio.defaultSpeaker
    if (!speaker) {
      return (
        <box cssClasses={["mixer-master"]}>
          <label label="No audio device" />
        </box>
      )
    }

    const volume = createBinding(speaker, "volume")
    const volumeIcon = createBinding(speaker, "volumeIcon")
    const mute = createBinding(speaker, "mute")

    return (
      <box cssClasses={["mixer-master"]}>
        <button
          cssClasses={mute.as((m) => m ? ["mute-btn", "muted"] : ["mute-btn"])}
          onClicked={() => (speaker.mute = !speaker.mute)}
        >
          <image iconName={volumeIcon} />
        </button>
        <label label="Master" hexpand halign={1} />
        <slider
          widthRequest={150}
          value={volume}
          onChangeValue={({ value }) => speaker.set_volume(value)}
        />
        <label
          label={volume.as((v) => `${Math.round(v * 100)}%`)}
          widthChars={4}
        />
      </box>
    )
  }

  return (
    <menubutton cssClasses={["audio-mixer"]}>
      <image iconName={audio.defaultSpeaker ? createBinding(audio.defaultSpeaker, "volumeIcon") : "audio-volume-high-symbolic"} />
      <popover>
        <box orientation={1} cssClasses={["mixer-popover"]}>
          {/* Output device selector */}
          <box cssClasses={["mixer-devices"]} orientation={1}>
            <label label="Output Device" cssClasses={["mixer-section-label"]} />
            <For each={speakers}>
              {(endpoint) => {
                const isDefault = createBinding(endpoint, "isDefault")
                const name = endpoint.description || endpoint.name || "Unknown"
                const shortName = shortenName(name)

                return (
                  <button
                    cssClasses={isDefault.as((d) =>
                      d ? ["device-btn", "active"] : ["device-btn"]
                    )}
                    onClicked={() => endpoint.set_is_default(true)}
                  >
                    <box>
                      <image
                        iconName={isDefault.as((d) =>
                          d ? "emblem-ok-symbolic" : "audio-card-symbolic"
                        )}
                      />
                      <label label={shortName} hexpand halign={1} />
                    </box>
                  </button>
                )
              }}
            </For>
          </box>

          {/* Divider */}
          <box cssClasses={["mixer-divider"]} />

          {/* Output jacks (speakers/headphones) - ALC1220 specific */}
          <box cssClasses={["mixer-jacks"]} orientation={1}>
            <label label="Output Jack" cssClasses={["mixer-section-label"]} />
            <box>
              <button
                cssClasses={jackMode((m) => m === "speakers" ? ["jack-btn", "active"] : ["jack-btn"])}
                tooltipText="Rear speakers only"
                onClicked={() => setJack("speakers")}
              >
                <box>
                  <image iconName="audio-speakers-symbolic" />
                  <label label="Speakers" />
                </box>
              </button>
              <button
                cssClasses={jackMode((m) => m === "headphones" ? ["jack-btn", "active"] : ["jack-btn"])}
                tooltipText="Front headphones only"
                onClicked={() => setJack("headphones")}
              >
                <box>
                  <image iconName="audio-headphones-symbolic" />
                  <label label="Headphones" />
                </box>
              </button>
              <button
                cssClasses={jackMode((m) => m === "both" ? ["jack-btn", "active"] : ["jack-btn"])}
                tooltipText="Both outputs"
                onClicked={() => setJack("both")}
              >
                <box>
                  <image iconName="audio-card-symbolic" />
                  <label label="Both" />
                </box>
              </button>
            </box>
          </box>

          {/* Divider */}
          <box cssClasses={["mixer-divider"]} />

          {/* Master volume */}
          <MasterVolume />

          {/* Divider */}
          <box cssClasses={["mixer-divider"]} />

          {/* Per-app streams */}
          <box cssClasses={["mixer-apps"]} orientation={1}>
            <label label="Applications" cssClasses={["mixer-section-label"]} />
            <For each={streams}>
              {(stream) => {
                if (stream.mediaClass !== AstalWp.MediaClass.AUDIO_STREAM) {
                  return <box />
                }

                const volume = createBinding(stream, "volume")
                const muted = createBinding(stream, "mute")

                return (
                  <box cssClasses={["mixer-app"]} orientation={1}>
                    <box>
                      <image iconName={getAppIcon(stream)} />
                      <label
                        label={stream.description || stream.name || "Unknown"}
                        hexpand
                        halign={1}
                        maxWidthChars={12}
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
                        widthRequest={80}
                        value={volume}
                        onChangeValue={({ value }) => stream.set_volume(value)}
                        sensitive={muted.as((m) => !m)}
                      />
                      <label
                        label={volume.as((v) => `${Math.round(v * 100)}%`)}
                        widthChars={4}
                      />
                    </box>
                    <box cssClasses={["mixer-app-route"]}>
                      <image iconName="audio-card-symbolic" />
                      <For each={speakers}>
                        {(endpoint) => {
                          const isTarget =
                            stream.targetEndpoint?.id === endpoint.id
                          const shortName = shortenName(
                            endpoint.description || endpoint.name || "?"
                          )
                          return (
                            <button
                              cssClasses={
                                isTarget
                                  ? ["route-btn", "active"]
                                  : ["route-btn"]
                              }
                              tooltipText={
                                endpoint.description || endpoint.name
                              }
                              onClicked={() =>
                                stream.set_target_endpoint(endpoint)
                              }
                            >
                              <label label={shortName} />
                            </button>
                          )
                        }}
                      </For>
                    </box>
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
