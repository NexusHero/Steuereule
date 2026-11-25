import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Who the database sees as the caller (P11, row-level security). Every table that holds personal data has a
 * forced row-level-security policy: a row is visible and writable only when its owner matches the identity the
 * database client sets as a transaction-local setting before the query (`prisma/transaction.ts`). Without an
 * identity no setting is made and those tables return nothing (fail closed).
 *
 * The request identity is the `userId` that `UserContextGuard` established; `DatabaseIdentityInterceptor`
 * runs the handler as that user. Paths that legitimately cross users run under a named system reason instead.
 * Every reason is one row below, and `test/row-level-security.lock.test.ts` lists every call site, so a new
 * bypass is a visible decision in review.
 */
export const SYSTEM_DATABASE_REASONS = {
  'better-auth': "better-auth's own tables: sign-in, sessions, lookups by e-mail hash, OAuth provider, its hooks",
  'bearer-token': 'the MCP bearer token check: token, client and consent rows before the user is known',
  'guest-activity': 'the guest retention clock: written by the guard before the request has an identity',
  'lifecycle-sweeps': 'the guest, unverified-account, legal-hold, login-record and access-log sweeps (P7) over every user',
  'account-deletion': 'erasure: tombstones the access log, removes the partner rows of both sides, reads legal holds',
  'guest-takeover': "the guest→account takeover at the first sign-in: moves the guest's rows to the account",
  'partner-invitation': "redeeming a partner invitation: the code is on person A's row, the shadow data moves to B",
  'device-flow': 'the device login: the desktop has no identity while it waits for the phone to approve',
  'step-up-grant': 'step-up grants live in better-auth\'s Verification table, which has no owner column',
  'payment-webhook': 'the payment provider webhook: resolves a checkout session to its account',
  'field-key-rotation': 'rotate:field-key re-encrypts every encrypted column of every user (operator script, never the server)',
  'test-fixture': 'the DB test tier only: fixtures and service-level tests outside a request (never in a server)',
} as const

export type SystemDatabaseReason = keyof typeof SYSTEM_DATABASE_REASONS

export type DatabaseIdentity =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'system'; readonly reason: SystemDatabaseReason }

const identityStore = new AsyncLocalStorage<DatabaseIdentity>()
let outsideRequestsForTests: DatabaseIdentity | undefined

/** The identity the database client applies to a query issued now; undefined outside a request or bypass. */
export function currentDatabaseIdentity(): DatabaseIdentity | undefined {
  return identityStore.getStore() ?? outsideRequestsForTests
}

/**
 * The DB test tier (`test/support/database-test-identity.ts`) seeds rows for several users and calls services
 * outside a request; those run as `test-fixture`. A request still runs as its user, so the HTTP suites exercise
 * the policies. Refused outside Vitest; `main.ts` never starts a server under Vitest.
 */
export function useTestFixtureIdentityOutsideRequests(): void {
  if (process.env.VITEST !== 'true' || process.env.NODE_ENV === 'production') {
    throw new Error('The test-fixture database identity exists for the Vitest DB tier only.')
  }
  outsideRequestsForTests = { kind: 'system', reason: 'test-fixture' }
}

/** Runs `work` (and everything it starts) as `userId`: the policies let through that user's rows only. */
export function runAsDatabaseUser<T>(userId: string, work: () => T): T {
  if (userId.length === 0) throw new Error('A database identity needs a non-empty user id.')
  return identityStore.run({ kind: 'user', userId }, work)
}

/** Runs `work` past the row-level policies, for one of the named reasons above and nothing else. */
export function withSystemDatabaseAccess<T>(reason: SystemDatabaseReason, work: () => T): T {
  return identityStore.run({ kind: 'system', reason }, work)
}

/**
 * `source`, pulled under the identity of the caller of this function. A generator handed to a streamed
 * response is pulled after the handler returned, outside the request's identity; its queries would see
 * nothing. Bound here, every pull runs as the request did.
 */
export function keepDatabaseIdentity<T>(source: AsyncIterable<T>): AsyncGenerator<T> {
  const identity = identityStore.getStore()
  const iterator = source[Symbol.asyncIterator]()
  const pull = <R>(step: () => R): R => (identity === undefined ? step() : identityStore.run(identity, step))
  return (async function* () {
    try {
      for (;;) {
        const next = await pull(() => iterator.next())
        if (next.done) return
        yield next.value
      }
    } finally {
      await pull(() => iterator.return?.())
    }
  })()
}

/** Whether the policies see `a` and `b` alike. Two system reasons do: inside one transaction no switch is needed. */
export function sameDatabaseIdentity(a: DatabaseIdentity | undefined, b: DatabaseIdentity | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (a.kind === 'user') return b.kind === 'user' && a.userId === b.userId
  return b.kind === 'system'
}

/**
 * A client whose every query runs for `reason`, whatever the caller's identity: for an adapter that belongs to a
 * system path as a whole (better-auth, the bearer token check). Works on the row-level-aware clients of
 * `PrismaModule`, which read the identity when a query is built.
 */
export function systemDatabaseClient<T extends object>(client: T, reason: SystemDatabaseReason): T {
  return new Proxy(client, {
    get(target, prop) {
      const value: unknown = withSystemDatabaseAccess(reason, () => Reflect.get(target, prop, target))
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => withSystemDatabaseAccess(reason, () => (value as (...a: unknown[]) => unknown)(...args))
    },
  })
}
