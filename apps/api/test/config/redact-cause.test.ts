// redactCause — the back half of Musti's "never the DSN" ruling, closing a leak that
// describeDatabaseTarget alone doesn't: `cause` prints by default wherever
// assertDatabaseReachable's thrown error surfaces unhandled (bootstrap()'s top-level
// `.catch`), so attaching Prisma's own error verbatim would reopen exactly the
// redaction the front of the guard builds. Not proven via a live, misconfigured
// Postgres here (the connection-refused case the boot-guard test spawns a real process
// for never leaks anything, by measurement) — this needs a real, reachable-but-wrong-
// credentials server to reproduce honestly, which is what
// database-boot-guard-auth-failure.integration.test.ts does end to end against a real
// Postgres. This file constructs the real Prisma error class directly, with the exact
// message shape Prisma is measured to produce for that failure, to prove the pure
// redaction logic in isolation and fast, without needing a live DB for every case.
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { ProbeTimeoutError, redactCause } from '../../src/config/assert-database-reachable.js'

describe('redactCause', () => {
  it('strips the username Prisma’s own auth-failure message names, keeping only the class name', () => {
    // The exact shape measured against a real local Postgres with a wrong password
    // (right host/port/user otherwise): the username lands in `.message`, not the
    // password — still a credential, still not this guard's to leak. Measured, not
    // assumed: Prisma never populates `errorCode` for this failure — the real object
    // it throws has `errorCode: undefined` — so this is constructed the same way,
    // with no third constructor argument. Passing a fabricated error code here would
    // assert a shape the real system never produces (Musti's review, F1b).
    const authFailure = new Prisma.PrismaClientInitializationError(
      'Authentication failed against database server, the provided database credentials for `someuser` are not valid.',
      '6.19.3',
    )

    const redacted = redactCause(authFailure)

    expect(redacted.message).not.toContain('someuser')
    expect(redacted.message).toBe('PrismaClientInitializationError')
  })

  it('allowlists only ProbeTimeoutError, by identity — passed through unchanged, since its message is a fixed template with no interpolated secret', () => {
    const timeout = new ProbeTimeoutError('timed out after 5000ms')
    expect(redactCause(timeout)).toBe(timeout)
  })

  it('redacts anything else by default, including an error type this file has never seen before — the point of an allowlist over a denylist', () => {
    // A denylist keyed on "starts with Prisma" would have passed this through
    // verbatim, full message and stack, purely because it isn't a Prisma error —
    // exactly the silent-leak-by-default the structural review named. A plain
    // TypeError (a DNS/TLS failure, a wrapper, anything unrecognised) must be
    // redacted too, not waved through for lack of a matching denylist entry.
    const unexpected = new TypeError('connect ETIMEDOUT 10.0.0.5:5432 (user=someuser)')

    const redacted = redactCause(unexpected)

    expect(redacted.message).not.toContain('someuser')
    expect(redacted.message).not.toContain('10.0.0.5')
    expect(redacted.message).toBe('TypeError')
  })

  it('never throws on a non-Error thrown value', () => {
    expect(redactCause('a raw string was thrown').message).toBe('unknown error')
    expect(redactCause(undefined).message).toBe('unknown error')
  })
})
