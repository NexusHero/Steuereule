import { describe, expect, it } from 'vitest'
import { unverifiedDeletionNotBefore } from './unverified-account'

const at = (iso: string) => new Date(iso)

/** ADR-0030 §3a: the deadline floats with the warning; it is a floor. */
describe('unverifiedDeletionNotBefore', () => {
  it('is thirty days after registration when the warning went out in time', () => {
    expect(unverifiedDeletionNotBefore(at('2026-11-01T10:00:00Z'), at('2026-11-24T10:00:00Z'), at('2026-11-25T10:00:00Z'))).toEqual(at('2026-12-01T10:00:00Z'))
  })

  it('is seven days after a late warning', () => {
    expect(unverifiedDeletionNotBefore(at('2026-09-01T10:00:00Z'), at('2026-11-20T10:00:00Z'), at('2026-11-25T10:00:00Z'))).toEqual(at('2026-11-27T10:00:00Z'))
  })

  it('without a warning yet, no sooner than seven days from now', () => {
    expect(unverifiedDeletionNotBefore(at('2026-09-01T10:00:00Z'), null, at('2026-11-25T10:00:00Z'))).toEqual(at('2026-12-02T10:00:00Z'))
    expect(unverifiedDeletionNotBefore(at('2026-11-20T10:00:00Z'), null, at('2026-11-25T10:00:00Z'))).toEqual(at('2026-12-20T10:00:00Z'))
  })
})
