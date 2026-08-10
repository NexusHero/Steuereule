// #306/#308 — the vocabulary itself. The screen tests prove the copy a user sees; these prove
// the classification underneath, including the two paths no screen can reach: a status we
// cannot make sense of, and a thrown value that is not a transport failure.
import { describe, it, expect } from 'vitest'
import { classifyByStatus, classifyThrown, reasonOf, RequestFailedError } from './failure-reason'

describe('classifyByStatus', () => {
  it('treats a missing status as unreachable — nothing answered', () => {
    expect(classifyByStatus(undefined)).toBe('unreachable')
    expect(classifyByStatus(null)).toBe('unreachable')
    expect(classifyByStatus(0)).toBe('unreachable')
  })

  it('treats any real response as refused — the server answered, and the answer was no', () => {
    // 403 is the one the stakeholder actually hit (better-auth SESSION_NOT_FRESH), and the one
    // the old copy blamed on his connection.
    expect(classifyByStatus(403)).toBe('refused')
    expect(classifyByStatus(401)).toBe('refused')
    expect(classifyByStatus(429)).toBe('refused')
    expect(classifyByStatus(500)).toBe('refused')
  })

  // No case here for the `< 100` branch. It is unreachable through every caller that exists —
  // the only source is better-fetch's `status`, taken from `Response.status`, which is never in
  // (0, 100) — so a test would have to invent a value no `Response` can carry in order to reach
  // the line. That is a coverage-driven test, not a behavioural one (#336 review, F5), and it
  // would have inflated this module's coverage figure while proving nothing. The branch stays
  // as a documented defensive default; see the comment on it.
})

describe('classifyThrown', () => {
  it('reads a TypeError as the transport never completing', () => {
    expect(classifyThrown(new TypeError('Failed to fetch'))).toBe('unreachable')
  })

  it('does not claim to know what any other throw means', () => {
    // The mirror defect: calling this "refused" would assert the server answered when nothing
    // here establishes that it did.
    expect(classifyThrown(new Error('boom'))).toBe('unknown')
    expect(classifyThrown('boom')).toBe('unknown')
    expect(classifyThrown(undefined)).toBe('unknown')
  })
})

describe('reasonOf — the fallback, and why it must not be load-bearing', () => {
  // Measured on #336, and the reason `useDeviceSessions` grew an `Array.isArray` guard: a 200
  // carrying `text/html` used to reach `data.map(...)` and throw a raw `TypeError`, which lands
  // here and defaults to 'unknown'. The copy a user saw was correct — by accident. This pins
  // the fallback's behaviour so the distinction stays visible: an unclassified error rendering
  // the right string is not the same as a classified one, even when the screen cannot tell.
  it('defaults an unclassified TypeError to unknown — the accident that hid a missing guard', () => {
    expect(reasonOf(new TypeError('data.map is not a function'))).toBe('unknown')
    // Note what it must NOT do: `classifyThrown` would call this same value 'unreachable',
    // because `fetch` rejects with `TypeError`. That is why only a value thrown by the request
    // itself may go through `classifyThrown` — see its doc comment.
    expect(classifyThrown(new TypeError('data.map is not a function'))).toBe('unreachable')
  })
})

describe('reasonOf', () => {
  it('recovers the reason a RequestFailedError carried', () => {
    expect(reasonOf(new RequestFailedError('x', 'refused'))).toBe('refused')
    expect(reasonOf(new RequestFailedError('x', 'unreachable'))).toBe('unreachable')
  })

  it('falls back to unknown for anything that carried no reason', () => {
    // This is the honest default for the whole scheme: an error from somewhere that never
    // classified itself must not inherit a cause it never established.
    expect(reasonOf(new Error('plain'))).toBe('unknown')
    expect(reasonOf(null)).toBe('unknown')
  })
})
