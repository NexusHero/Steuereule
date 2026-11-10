import { describe, expect, it } from 'vitest'
import { THINKING_PHRASE_COUNT, THINKING_PHRASE_INTERVAL_MS, thinkingLabelAt } from './thinkingLabel'

const base = { startedAt: 0, phraseCount: THINKING_PHRASE_COUNT }

describe('thinkingLabelAt (#451 decision 4)', () => {
  it('shows a fresh server step first', () => {
    expect(thinkingLabelAt({ ...base, steps: ['Prüfe EStG-Paragraph …'], lastStepAt: 1000, now: 1500 })).toEqual({
      kind: 'step',
      text: 'Prüfe EStG-Paragraph …',
    })
  })

  it('always shows the latest of several steps', () => {
    expect(thinkingLabelAt({ ...base, steps: ['a', 'b'], lastStepAt: 1000, now: 1200 })).toEqual({ kind: 'step', text: 'b' })
  })

  it('falls back to rotating phrases once the step is older than one interval', () => {
    const label = thinkingLabelAt({ ...base, steps: ['a'], lastStepAt: 0, now: THINKING_PHRASE_INTERVAL_MS + 1 })
    expect(label.kind).toBe('phrase')
  })

  it('rotates phrases every interval and wraps around', () => {
    const at = (now: number) => thinkingLabelAt({ ...base, steps: [], lastStepAt: null, now })
    expect(at(0)).toEqual({ kind: 'phrase', index: 0 })
    expect(at(THINKING_PHRASE_INTERVAL_MS)).toEqual({ kind: 'phrase', index: 1 })
    expect(at(THINKING_PHRASE_INTERVAL_MS * THINKING_PHRASE_COUNT)).toEqual({ kind: 'phrase', index: 0 })
  })

  it('keeps the interval inside the 2–3 s window the ticket asks for', () => {
    expect(THINKING_PHRASE_INTERVAL_MS).toBeGreaterThanOrEqual(2000)
    expect(THINKING_PHRASE_INTERVAL_MS).toBeLessThanOrEqual(3000)
    expect(THINKING_PHRASE_COUNT).toBe(12)
  })
})
