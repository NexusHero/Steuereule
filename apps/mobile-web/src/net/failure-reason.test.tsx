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

  it('says unknown rather than guessing, for a status that is not a status', () => {
    expect(classifyByStatus(-1)).toBe('unknown')
    expect(classifyByStatus(99)).toBe('unknown')
  })
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
