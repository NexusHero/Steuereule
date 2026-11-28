export const SPEECH_PORT = Symbol('SPEECH_PORT')

export const SPEECH_LANGUAGES = ['de', 'en'] as const
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number]

/** One WAV file: what every browser plays without a decoder of ours. */
export interface SpokenAudio {
  readonly bytes: Buffer
  readonly mimeType: 'audio/wav'
}

export interface SpeechRequest {
  readonly text: string
  readonly language: SpeechLanguage
}

/**
 * The owl's voice (ADR-0115): text in, spoken audio out. The provider behind it is a setting, so another
 * one replaces an adapter and nothing else.
 */
export interface SpeechPort {
  /** False where no voice is configured: the app then reads with the device's own voice. */
  readonly available: boolean
  speak(request: SpeechRequest, signal?: AbortSignal): Promise<SpokenAudio>
}

/** The provider did not answer with audio. Carries no provider text: that may quote the request. */
export class SpeechProviderError extends Error {
  constructor(readonly reason: 'rejected' | 'unreachable' | 'no-audio' | 'timeout', readonly status?: number) {
    super(`speech provider: ${reason}${status === undefined ? '' : ` (${status})`}`)
    this.name = 'SpeechProviderError'
  }
}
