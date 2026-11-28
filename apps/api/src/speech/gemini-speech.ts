import type { SpeechConfig } from './speech-config.js'
import { SpeechProviderError, type SpeechPort, type SpeechRequest, type SpokenAudio } from './speech.port.js'
import { isWav, sampleRateOf, wavFromPcm } from './wav.js'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiAudioResponse {
  readonly candidates?: readonly { readonly content?: { readonly parts?: readonly { readonly inlineData?: { readonly data?: string; readonly mimeType?: string } }[] } }[]
}

export type Fetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Gemini's speech models over the Generative Language API. The key travels in a header, never in the URL. */
export class GeminiSpeech implements SpeechPort {
  readonly available = true

  constructor(
    private readonly config: SpeechConfig & { readonly apiKey: string },
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  async speak(request: SpeechRequest, signal?: AbortSignal): Promise<SpokenAudio> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs)
    const body = {
      // The passage and nothing else: a line on how to sound is read aloud with it (measured 28.11.2026). The voice
      // carries the tone, and the model takes the language from the text.
      contents: [{ parts: [{ text: request.text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.voice } } } },
    }
    let response: Awaited<ReturnType<Fetch>>
    try {
      response = await this.fetchFn(`${ENDPOINT}/${encodeURIComponent(this.config.model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch {
      throw new SpeechProviderError(timeout.aborted ? 'timeout' : 'unreachable')
    }
    if (!response.ok) throw new SpeechProviderError('rejected', response.status)
    const audio = ((await response.json()) as GeminiAudioResponse).candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData
    if (!audio?.data) throw new SpeechProviderError('no-audio')
    const bytes = Buffer.from(audio.data, 'base64')
    return { bytes: isWav(bytes) ? bytes : wavFromPcm(bytes, sampleRateOf(audio.mimeType)), mimeType: 'audio/wav' }
  }
}
