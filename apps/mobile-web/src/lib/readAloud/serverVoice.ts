import { getApiClientBaseUrl } from '@steuereule/api-client'
import { apiFetch } from '../../net/apiFetch'

/** Plays one piece of audio after the other on this device. */
export interface AudioOutput {
  /** Resolves when the piece was played to its end; rejects when the device could not play it. */
  play(audio: Blob): Promise<void>
  stop(): void
}

/** The owl's voice from the server (ADR-0115): one passage of text in, its audio out. */
export interface ServerVoice {
  passage(text: string, language: string, signal: AbortSignal): Promise<Blob>
  /** Called in the press itself, so the browser lets the audio that arrives later play. */
  output(): AudioOutput | null
}

interface AudioElement {
  src: string
  addEventListener(type: 'ended' | 'error', listener: () => void): void
  play(): Promise<void>
  pause(): void
}

/** The shortest valid WAV: playing it in the press unlocks the element for the audio that follows. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

export function browserAudioOutput(): AudioOutput | null {
  const scope = globalThis as unknown as { Audio?: new () => AudioElement; URL?: { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void } }
  const { Audio: Ctor, URL: urls } = scope
  if (!Ctor || !urls?.createObjectURL || !urls.revokeObjectURL) return null
  const create = urls.createObjectURL.bind(urls)
  const revoke = urls.revokeObjectURL.bind(urls)
  const element = new Ctor()
  let current: string | null = null
  let settle: ((error?: Error) => void) | null = null
  const release = (): void => {
    if (current !== null) revoke(current)
    current = null
  }
  // Only the piece that is playing has a `settle`: the end of the unlocking silence or of a stopped piece is nobody's.
  element.addEventListener('ended', () => settle?.())
  element.addEventListener('error', () => settle?.(new Error('audio playback failed')))
  element.src = SILENCE
  void element.play().catch(() => undefined)
  return {
    play(audio) {
      release()
      current = create(audio)
      element.src = current
      return new Promise<void>((resolve, reject) => {
        settle = (error) => {
          settle = null
          release()
          if (error) reject(error)
          else resolve()
        }
        element.play().catch(() => settle?.(new Error('audio playback refused')))
      })
    },
    stop() {
      element.pause()
      // A stopped piece is over for the caller too, or it would wait for an end that never comes.
      settle?.()
    },
  }
}

/** The voice route of the API. A refusal (no voice, limit, provider down) rejects: the caller decides what reads instead. */
export const apiServerVoice: ServerVoice = {
  async passage(text, language, signal) {
    const response = await apiFetch(`${getApiClientBaseUrl()}/v1/eulen-modus/stimme`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: language.toLowerCase().startsWith('en') ? 'en' : 'de' }),
      signal,
    })
    if (!response.ok) throw new Error('the voice route refused the passage')
    return response.blob()
  },
  output: browserAudioOutput,
}
