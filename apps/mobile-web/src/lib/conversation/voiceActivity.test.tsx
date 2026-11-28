import { describe, expect, it } from 'vitest'
import { createVoiceActivity, loudness } from './voiceActivity'

const OPTIONS = { speechLevel: 0.02, startAfterMs: 150, endAfterMs: 900 }
const LOUD = 0.1
const QUIET = 0.001

/** Feeds one level every 50 ms from `from` for `ms` and collects what happened. */
function feed(activity: ReturnType<typeof createVoiceActivity>, level: number, from: number, ms: number): Array<[string, number]> {
  const events: Array<[string, number]> = []
  for (let time = from; time < from + ms; time += 50) {
    const event = activity.push(level, time)
    if (event) events.push([event, time])
  }
  return events
}

describe('telling speech from silence', () => {
  it('starts once it has been loud for 150 ms, and dates the speech to the first loud moment', () => {
    const activity = createVoiceActivity(OPTIONS)
    expect(feed(activity, QUIET, 0, 1_000)).toEqual([])
    expect(feed(activity, LOUD, 1_000, 500)).toEqual([['start', 1_150]])
    expect(activity.speakingSince).toBe(1_000)
  })

  it('takes a click for nothing', () => {
    const activity = createVoiceActivity(OPTIONS)
    expect(feed(activity, LOUD, 0, 100)).toEqual([])
    expect(feed(activity, QUIET, 100, 500)).toEqual([])
    // The next sound starts its own count.
    expect(feed(activity, LOUD, 600, 100)).toEqual([])
    expect(activity.speakingSince).toBeNull()
  })

  it('ends after 900 ms of quiet, not at a shorter pause in the middle of a sentence', () => {
    const activity = createVoiceActivity(OPTIONS)
    feed(activity, LOUD, 0, 500)
    expect(feed(activity, QUIET, 500, 600)).toEqual([])
    expect(feed(activity, LOUD, 1_100, 300)).toEqual([])
    expect(feed(activity, QUIET, 1_400, 1_000)).toEqual([['end', 2_300]])
    expect(activity.speakingSince).toBeNull()
  })

  it('can hear the next utterance after one ended, and after a reset', () => {
    const activity = createVoiceActivity(OPTIONS)
    feed(activity, LOUD, 0, 500)
    feed(activity, QUIET, 500, 1_000)
    expect(feed(activity, LOUD, 2_000, 300)).toEqual([['start', 2_150]])
    activity.reset()
    expect(activity.speakingSince).toBeNull()
    expect(feed(activity, QUIET, 3_000, 2_000)).toEqual([])
  })
})

describe('loudness of a block of samples', () => {
  it('is the RMS, and nothing for no samples', () => {
    expect(loudness(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
    expect(loudness(new Float32Array(64))).toBe(0)
    expect(loudness([])).toBe(0)
  })
})
