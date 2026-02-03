import { execAsync } from "ags/process"
import ConfigService from "./config"

interface AudioControl {
  name: string
  type: "speaker" | "headphone" | "unknown"
}

class AudioControlService {
  private static _instance: AudioControlService | null = null

  private _speakerControl: string = "Line Out"
  private _headphoneControl: string = "Headphone"
  private _initialized: boolean = false

  static get_default(): AudioControlService {
    if (!this._instance) {
      this._instance = new AudioControlService()
    }
    return this._instance
  }

  private constructor() {
    this._discoverControls()
  }

  get speakerControl(): string {
    return this._speakerControl
  }

  get headphoneControl(): string {
    return this._headphoneControl
  }

  get initialized(): boolean {
    return this._initialized
  }

  private async _discoverControls(): Promise<void> {
    try {
      const config = ConfigService.get_default()
      const audioCard = String(config.config.audio.card)

      // Get all controls from amixer
      const output = await execAsync(["amixer", "-c", audioCard, "scontrols"])
      const controls = this._parseControls(output)

      console.log(`[AudioControl] Found ${controls.length} controls:`, controls.map(c => c.name))

      // Find speaker control
      const speakerMatches = controls.filter(c =>
        /^(line out|speaker|front|surround|pcm|master)$/i.test(c.name)
      )
      if (speakerMatches.length > 0) {
        this._speakerControl = speakerMatches[0].name
        console.log(`[AudioControl] Speaker control: ${this._speakerControl}`)
      } else {
        console.warn("[AudioControl] No speaker control found, using default: Line Out")
      }

      // Find headphone control
      const headphoneMatches = controls.filter(c =>
        /^(headphone|hp)$/i.test(c.name)
      )
      if (headphoneMatches.length > 0) {
        this._headphoneControl = headphoneMatches[0].name
        console.log(`[AudioControl] Headphone control: ${this._headphoneControl}`)
      } else {
        console.warn("[AudioControl] No headphone control found, using default: Headphone")
      }

      this._initialized = true
    } catch (e) {
      console.error("[AudioControl] Failed to discover controls:", e)
      console.warn("[AudioControl] Using defaults: Line Out, Headphone")
      this._initialized = true
    }
  }

  private _parseControls(output: string): AudioControl[] {
    const controls: AudioControl[] = []
    const lines = output.split("\n")

    for (const line of lines) {
      // Format: Simple mixer control 'Line Out',0
      const match = line.match(/Simple mixer control '([^']+)'/)
      if (match) {
        const name = match[1]
        let type: "speaker" | "headphone" | "unknown" = "unknown"

        // Classify control type based on name
        if (/headphone|hp/i.test(name)) {
          type = "headphone"
        } else if (/line out|speaker|front|surround|pcm|master/i.test(name)) {
          type = "speaker"
        }

        controls.push({ name, type })
      }
    }

    return controls
  }

  async getControlState(controlName: string, audioCard: string): Promise<boolean> {
    try {
      const output = await execAsync(["amixer", "-c", audioCard, "sget", controlName])
      return output.includes("[on]")
    } catch (e) {
      return false
    }
  }

  async setControlState(controlName: string, audioCard: string, state: "on" | "off"): Promise<void> {
    try {
      const amixerState = state === "on" ? "unmute" : "mute"
      await execAsync(["amixer", "-c", audioCard, "sset", controlName, amixerState])
    } catch (e) {
      console.warn(`[AudioControl] Failed to set ${controlName} to ${state}:`, e)
    }
  }
}

export default AudioControlService
