import type { Fetch } from './gemini-speech.js'
import type { SpeechConfig } from './speech-config.js'
import { SpeechProviderError, type SpeechPort, type SpeechRequest, type SpokenAudio } from './speech.port.js'
import { isWav, wavFromPcm } from './wav.js'

/** Mistral hosts API data in the EEA by default (ADR-0115). */
const ENDPOINT = 'https://api.mistral.ai/v1/audio/speech'

/** Generated speech is mono at 24 kHz. */
const SAMPLE_RATE = 24_000

interface MistralSpeechResponse {
  readonly audio_data?: string
}

/** Mistral's Voxtral speech model. The voice decides the language, so each language has its own. */
export class MistralSpeech implements SpeechPort {
  readonly available = true

  constructor(
    private readonly config: SpeechConfig & { readonly apiKey: string },
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  async speak(request: SpeechRequest, signal?: AbortSignal): Promise<SpokenAudio> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs)
    let response: Awaited<ReturnType<Fetch>>
    try {
      response = await this.fetchFn(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, input: request.text, voice_id: this.config.voices[request.language], response_format: 'wav' }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch {
      throw new SpeechProviderError(timeout.aborted ? 'timeout' : 'unreachable')
    }
    if (!response.ok) throw new SpeechProviderError('rejected', response.status)
    const data = ((await response.json()) as MistralSpeechResponse).audio_data
    if (!data) throw new SpeechProviderError('no-audio')
    const bytes = Buffer.from(data, 'base64')
    return { bytes: isWav(bytes) ? bytes : wavFromPcm(bytes, SAMPLE_RATE), mimeType: 'audio/wav' }
  }
}
