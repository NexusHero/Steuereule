import { describe, expect, it } from 'vitest'
import { ADVISOR_MODEL_FAILURE_REASONS, describeModelFailure, fallbackNotice } from './advisor-failure'

describe('model failures (#487)', () => {
  it('has words for every reason, and says which ones retrying cannot fix', () => {
    for (const reason of ADVISOR_MODEL_FAILURE_REASONS) expect(describeModelFailure(reason).text.length).toBeGreaterThan(20)
    expect(describeModelFailure('not-configured').retryable).toBe(false)
    expect(describeModelFailure('quota').retryable).toBe(true)
  })

  it('tells the user that the answer comes from fixed rules', () => {
    const notice = fallbackNotice({ reason: 'quota', detail: 'Gemini · HTTP 429' })
    expect(notice).toContain('Kontingent')
    expect(notice).toContain('festen Regeln')
  })
})
