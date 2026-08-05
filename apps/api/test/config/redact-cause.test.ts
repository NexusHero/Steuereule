// redactCause — the back half of Musti's "never the DSN" ruling, closing a leak that
// describeDatabaseTarget alone doesn't: `cause` prints by default wherever
// assertDatabaseReachable's thrown error surfaces unhandled (bootstrap()'s top-level
// `.catch`), so attaching Prisma's own error verbatim would reopen exactly the
// redaction the front of the guard builds. This is deliberately NOT proven via a live,
// misconfigured Postgres (the connection-refused case the boot-guard test spawns a real
// process for never leaks anything, by measurement — this leak is specific to the
// *auth-failure* class of error, which needs a real, reachable-but-wrong-credentials
// server to reproduce honestly). Constructing the real Prisma error class directly,
// with the exact message Prisma is measured to produce for that failure, proves the
// redaction against the actual defect instead of a case that never had it.
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { redactCause } from '../../src/config/assert-database-reachable.js'

describe('redactCause', () => {
  it('strips the username Prisma’s own auth-failure message names, keeping only the class and error code', () => {
    // The exact shape measured against a real local Postgres with a wrong password
    // (right host/port/user otherwise): the username lands in `.message`, not the
    // password — still a credential, still not this guard's to leak.
    const authFailure = new Prisma.PrismaClientInitializationError(
      'Authentication failed against database server, the provided database credentials for `someuser` are not valid.',
      '6.19.3',
      'P1000',
    )

    const redacted = redactCause(authFailure)

    expect(redacted.message).not.toContain('someuser')
    expect(redacted.message).toBe('PrismaClientInitializationError (P1000)')
  })

  it('falls back to the class name alone when a Prisma error carries no errorCode', () => {
    const noCode = new Prisma.PrismaClientInitializationError('some server-reported detail', '6.19.3')
    expect(redactCause(noCode).message).toBe('PrismaClientInitializationError')
  })

  it('passes a non-Prisma error through unchanged — this file’s own timeout error has no interpolated secret to redact', () => {
    const timeout = new Error('timed out after 5000ms')
    expect(redactCause(timeout)).toBe(timeout)
  })

  it('never throws on a non-Error thrown value', () => {
    expect(redactCause('a raw string was thrown').message).toBe('unknown error')
    expect(redactCause(undefined).message).toBe('unknown error')
  })
})
