/**
 * When someone starts and stops talking, from the loudness of the microphone alone. Pure: it is fed a
 * level and a time and answers what just happened, so it can be tested without a microphone.
 */
export interface VoiceActivityOptions {
  /** Loudness (RMS, 0 to 1) above which a moment counts as speech. */
  readonly speechLevel: number
  /** How long it has to stay that loud before it is speech and not a click. */
  readonly startAfterMs: number
  /** How long it has to stay quiet before the speaker is done. */
  readonly endAfterMs: number
}

/** A pause of 0.9 s ends an utterance: shorter cuts people off in the middle of a figure, longer feels like no answer. */
export const DEFAULT_VOICE_ACTIVITY: VoiceActivityOptions = { speechLevel: 0.02, startAfterMs: 150, endAfterMs: 900 }

export type VoiceEvent = 'start' | 'end' | null

export interface VoiceActivity {
  /** The level measured at `now` (ms). `start` once speech began, `end` once it is over. */
  push(level: number, now: number): VoiceEvent
  /** When the speech that is going on began (ms), the first loud moment; null while nobody talks. */
  readonly speakingSince: number | null
  reset(): void
}

export function createVoiceActivity(options: VoiceActivityOptions = DEFAULT_VOICE_ACTIVITY): VoiceActivity {
  let loudSince: number | null = null
  let quietSince: number | null = null
  let speakingSince: number | null = null
  return {
    get speakingSince() {
      return speakingSince
    },
    reset() {
      loudSince = quietSince = speakingSince = null
    },
    push(level, now) {
      const loud = level >= options.speechLevel
      if (speakingSince === null) {
        if (!loud) {
          loudSince = null
          return null
        }
        loudSince ??= now
        if (now - loudSince < options.startAfterMs) return null
        speakingSince = loudSince
        quietSince = null
        return 'start'
      }
      if (loud) {
        quietSince = null
        return null
      }
      quietSince ??= now
      if (now - quietSince < options.endAfterMs) return null
      loudSince = quietSince = speakingSince = null
      return 'end'
    },
  }
}

/** Loudness of a block of samples (-1 to 1) as RMS. */
export function loudness(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) sum += samples[i]! * samples[i]!
  return Math.sqrt(sum / samples.length)
}
