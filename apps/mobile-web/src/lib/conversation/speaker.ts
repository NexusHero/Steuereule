import type { AudioOutput, ServerVoice } from '../readAloud/serverVoice'
import { LEVEL_STEP_MS } from './microphone'
import { loudnessEnvelope } from './wav'

export interface SpeakerOptions {
  readonly voice: ServerVoice
  readonly output: AudioOutput
  readonly language: string
  /** The passage that starts to play now. */
  readonly onPassage: (passage: string) => void
  readonly now?: () => number
  /** How loud a piece of audio is over time; reads the WAV file unless a test says otherwise. */
  readonly envelopeOf?: (audio: Blob) => Promise<readonly number[]>
}

/** Speaks passages in the order they are handed in, while more may still come. */
export interface Speaker {
  say(passage: string): void
  /** No more passages will come. Resolves when the last one was said; rejects when the voice failed. */
  finish(): Promise<void>
  /** Ends at once: what plays stops, what waits is dropped. */
  stop(): void
  /** How loud the voice is right now (RMS, 0 to 1), for the line on screen. */
  level(): number
}

const envelopeFromWav = async (audio: Blob): Promise<readonly number[]> => {
  try {
    return loudnessEnvelope(await audio.arrayBuffer(), LEVEL_STEP_MS)
  } catch {
    return []
  }
}

export function createSpeaker({ voice, output, language, onPassage, now = () => Date.now(), envelopeOf = envelopeFromWav }: SpeakerOptions): Speaker {
  const abort = new AbortController()
  const fetched = new Map<number, Promise<Blob>>()
  const passages: string[] = []
  /** `stopped`: ended at once. `closed`: no more passages will come. */
  const flow = { stopped: false, closed: false }
  /** The passage that plays or is waited for. */
  let at = 0
  let playing: { readonly envelope: readonly number[]; readonly since: number } | null = null
  let failure: unknown = null
  let wake: (() => void) | null = null

  const fetchPassage = (index: number): Promise<Blob> | null => {
    const text = passages[index]
    if (text === undefined) return null
    let passage = fetched.get(index)
    if (!passage) {
      passage = voice.passage(text, language, abort.signal)
      // Fetched ahead of its turn: a failure is dealt with when the turn comes.
      passage.catch(() => undefined)
      fetched.set(index, passage)
    }
    return passage
  }

  async function run(): Promise<void> {
    for (let index = 0; !flow.stopped; index += 1) {
      at = index
      let passage = fetchPassage(index)
      while (passage === null && !flow.closed && !flow.stopped) {
        await new Promise<void>((resolve) => (wake = resolve))
        passage = fetchPassage(index)
      }
      if (passage === null || flow.stopped) return
      const audio = await passage
      if (flow.stopped) return
      void fetchPassage(index + 1)
      const envelope = await envelopeOf(audio)
      if (flow.stopped) return
      onPassage(passages[index]!)
      playing = { envelope, since: now() }
      await output.play(audio)
      playing = null
    }
  }

  // Never rejects: a failure is kept for whoever waits in `finish`.
  const done: Promise<void> = run().catch((error: unknown) => {
    playing = null
    failure = error ?? new Error('the voice failed')
  })

  return {
    say(passage) {
      if (flow.stopped || flow.closed) return
      passages.push(passage)
      // Asked for at once when it is the passage that is waited for or the one after the passage that plays:
      // one is always fetched ahead, never more.
      if (passages.length - 1 <= at + 1) void fetchPassage(passages.length - 1)
      wake?.()
    },
    finish() {
      flow.closed = true
      wake?.()
      return done.then(() => {
        if (failure !== null) throw failure
      })
    },
    stop() {
      if (flow.stopped) return
      flow.stopped = true
      playing = null
      abort.abort()
      output.stop()
      wake?.()
    },
    level() {
      if (!playing) return 0
      return playing.envelope[Math.floor((now() - playing.since) / LEVEL_STEP_MS)] ?? 0
    },
  }
}
