import type { Fetch } from './gemini-speech.js'
import type { SpeechConfig } from './speech-config.js'
import { SpeechProviderError, type HeardAudio, type SpeechPort, type SpeechRequest, type SpokenAudio } from './speech.port.js'
import { isWav, wavFromPcm } from './wav.js'

/** Mistral hosts API data in the EEA by default (ADR-0115). */
const ENDPOINT = 'https://api.mistral.ai/v1/audio'

/** Generated speech is mono at 24 kHz. */
const SAMPLE_RATE = 24_000

interface MistralSpeechResponse {
  readonly audio_data?: string
}

interface MistralTranscriptResponse {
  readonly text?: string
}

/** Mistral's Voxtral speech model. The voice decides the language, so each language has its own. */
export class MistralSpeech implements SpeechPort {
  readonly available = true

  constructor(
    private readonly config: SpeechConfig & { readonly apiKey: string },
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  async speak(request: SpeechRequest, signal?: AbortSignal): Promise<SpokenAudio> {
    const response = (await this.post(
      'speech',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ model: this.config.model, input: request.text, voice_id: this.config.voices[request.language], response_format: 'wav' }),
      signal,
    )) as MistralSpeechResponse
    if (!response.audio_data) throw new SpeechProviderError('no-audio')
    const bytes = Buffer.from(response.audio_data, 'base64')
    return { bytes: isWav(bytes) ? bytes : wavFromPcm(bytes, SAMPLE_RATE), mimeType: 'audio/wav' }
  }

  async transcribe(heard: HeardAudio, signal?: AbortSignal): Promise<string> {
    const form = new FormData()
    form.set('model', this.config.transcribeModel)
    form.set('language', heard.language)
    form.set('file', new Blob([new Uint8Array(heard.wav)], { type: 'audio/wav' }), 'aufnahme.wav')
    // No Content-Type of ours: the form sets it with its boundary.
    const response = (await this.post('transcriptions', {}, form, signal)) as MistralTranscriptResponse
    return (response.text ?? '').trim()
  }

  private async post(path: 'speech' | 'transcriptions', headers: Record<string, string>, body: string | FormData, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs)
    let response: Awaited<ReturnType<Fetch>>
    try {
      response = await this.fetchFn(`${ENDPOINT}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, ...headers },
        body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch {
      throw new SpeechProviderError(timeout.aborted ? 'timeout' : 'unreachable')
    }
    if (!response.ok) throw new SpeechProviderError('rejected', response.status)
    return response.json()
  }
}
