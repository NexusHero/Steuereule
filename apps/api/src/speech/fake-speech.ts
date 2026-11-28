import type { HeardAudio, SpeechPort, SpeechRequest, SpokenAudio } from './speech.port.js'
import { wavFromPcm } from './wav.js'

/** What the scripted ear hears in every recording. */
export const FAKE_HEARD_TEXT = 'Sag mir kurz Hallo'

const SAMPLE_RATE = 8_000

/** The voice of CI and tests: a quiet tone whose length follows the text, so a player has something to play. */
export class FakeSpeech implements SpeechPort {
  readonly available = true

  async speak(request: SpeechRequest): Promise<SpokenAudio> {
    const samples = Math.min(SAMPLE_RATE, Math.max(SAMPLE_RATE / 5, request.text.length * 40))
    const pcm = Buffer.alloc(samples * 2)
    for (let i = 0; i < samples; i += 1) pcm.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / SAMPLE_RATE) * 600), i * 2)
    return { bytes: wavFromPcm(pcm, SAMPLE_RATE), mimeType: 'audio/wav' }
  }

  async transcribe(_heard: HeardAudio): Promise<string> {
    return FAKE_HEARD_TEXT
  }
}

/** No voice configured. */
export class NoSpeech implements SpeechPort {
  readonly available = false

  speak(): Promise<SpokenAudio> {
    return Promise.reject(new Error('no speech provider is configured'))
  }

  transcribe(): Promise<string> {
    return Promise.reject(new Error('no speech provider is configured'))
  }
}
