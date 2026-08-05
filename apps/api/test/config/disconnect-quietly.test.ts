// disconnectQuietly — the guard's CLEANUP path, contained (Salih's #275 test report).
//
// The companion to redact-cause.test.ts, and it exists because that file's control has
// a blind spot that cost this PR a round: `redactCause` guards the `catch`, and the
// guard's `finally` runs regardless of it. An abrupt completion in a `finally`
// *replaces* whatever the try/catch was completing with, so `await prisma.$disconnect()`
// there could discard the redacted finding and put Prisma's raw error — including, in
// one measured shape, the configured username — on stderr in its place. A control that
// only covers the expected failure path does not cover the cleanup path, and the
// cleanup path runs even when nothing failed.
//
// The end-to-end proof is in `test/boot/database-boot-guard.test.ts`, against a real
// spawned server and a peer that stalls the handshake. These cases pin the same
// property directly and deterministically, without waiting out a connection-pool
// timeout: whatever `$disconnect()` does, it must not escape.
import { describe, expect, it } from 'vitest'
import { disconnectQuietly } from '../../src/config/assert-database-reachable.js'

describe('disconnectQuietly', () => {
  it('swallows a rejecting $disconnect so it can never replace the finding the guard is throwing', async () => {
    // The shape that made this blocking: the rejection carries a credential, and
    // reaches the process unredacted because it comes out of `finally`, not `catch`.
    const client = {
      $disconnect: (): Promise<void> =>
        Promise.reject(new Error('Timed out fetching a new connection (user=someuser, password=super-secret-pw)')),
    }

    await expect(disconnectQuietly(client)).resolves.toBeUndefined()
  })

  it('still actually calls $disconnect — containment must not become "never cleans up"', async () => {
    // Guards the lazy version of this fix: dropping the disconnect entirely would also
    // make the test above pass, while leaking the probe's connection on every boot.
    let called = 0
    const client = {
      $disconnect: (): Promise<void> => {
        called += 1
        return Promise.resolve()
      },
    }

    await disconnectQuietly(client)

    expect(called).toBe(1)
  })

  it('resolves normally on a successful disconnect — the ordinary path is unchanged', async () => {
    const client = { $disconnect: (): Promise<void> => Promise.resolve() }

    await expect(disconnectQuietly(client)).resolves.toBeUndefined()
  })
})
