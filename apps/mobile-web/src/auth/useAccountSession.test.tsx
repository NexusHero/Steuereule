// #349 — exhaustive, pure table test for `deriveAccountSessionState`. No React, no MSW: the hook
// itself (`useAccountSession`) is thin wiring over this function, exercised end to end instead at
// `../screens/device/DeviceScreen.test.tsx` (the actual "don't render Login" defect) and
// `../screens/DatenschutzScreen.test.tsx` (the second consumer).
//
// The rule this table exists to pin down, precisely: **a known `data` always outranks a fresh
// `error`.** Row 3 below — a signed-in session that just failed a REFETCH with a 429 — is the case
// the issue is explicit must keep working; if that rule were ever inverted (checking `error`
// before `data`), this row is what would catch it, distinctly from the cold-start rows.
import { describe, it, expect } from 'vitest'
import { deriveAccountSessionState, type AccountSession } from './useAccountSession'

const SESSION = {
  user: { id: 'u1', email: 'anna@example.com', emailVerified: true, name: 'Anna' },
  session: { id: 's1', createdAt: new Date().toISOString() },
} as unknown as AccountSession

describe('deriveAccountSessionState (#349)', () => {
  it('is "loading" whenever isPending is true, regardless of data/error', () => {
    expect(deriveAccountSessionState(null, null, true)).toEqual({ status: 'loading' })
    expect(deriveAccountSessionState(SESSION, { status: 429 }, true)).toEqual({ status: 'loading' })
  })

  it('is "signed-in" on a genuine resolved session with no error', () => {
    expect(deriveAccountSessionState(SESSION, null, false)).toEqual({ status: 'signed-in', session: SESSION })
  })

  // The load-bearing row: better-auth's own atom keeps `latest.data` on any non-401 refetch
  // failure (session-atom.mjs:88-98) — a REFETCH of an already-known session surviving a 429
  // must still read as signed-in. The issue is explicit this case was never broken; this row is
  // what would catch a regression that inverted the `data`-before-`error` priority.
  it('stays "signed-in" when a KNOWN session sees a later 429 (refetch), never demoted to "unknown"', () => {
    expect(deriveAccountSessionState(SESSION, { status: 429 }, false)).toEqual({ status: 'signed-in', session: SESSION })
  })

  it('is "signed-out" on a genuine resolved "no session" answer (200, null, no error)', () => {
    expect(deriveAccountSessionState(null, null, false)).toEqual({ status: 'signed-out' })
  })

  it('is "signed-out" on a 401 — better-auth\'s own atom already treats this as authoritative', () => {
    expect(deriveAccountSessionState(null, { status: 401 }, false)).toEqual({ status: 'signed-out' })
  })

  // The defect itself: a cold-start non-401 failure (data still null, never established) must
  // never collapse into "signed-out".
  it('is "unknown" on a cold-start 429 — the exact mechanism #349 measures', () => {
    expect(deriveAccountSessionState(null, { status: 429 }, false)).toEqual({ status: 'unknown', reason: 'refused' })
  })

  it('is "unknown" on a cold-start 5xx', () => {
    expect(deriveAccountSessionState(null, { status: 500 }, false)).toEqual({ status: 'unknown', reason: 'refused' })
  })

  it('is "unknown" with reason "unreachable" on a genuine transport failure (no status at all)', () => {
    expect(deriveAccountSessionState(null, new TypeError('fetch failed'), false)).toEqual({ status: 'unknown', reason: 'unreachable' })
    expect(deriveAccountSessionState(null, { status: undefined }, false)).toEqual({ status: 'unknown', reason: 'unreachable' })
    expect(deriveAccountSessionState(null, { status: null }, false)).toEqual({ status: 'unknown', reason: 'unreachable' })
  })
})
