// The DB test tier under row-level security (P11). Nothing runs as `test-fixture` by itself: a query without an
// identity sees no rows and may write none, in a test as in the server. What a suite sets up, cleans up or looks
// at directly goes through `fixtureClient`/`asFixture`; what it calls as the app would (a repository or service a
// user's request reaches) runs as that user through `asDatabaseUser`, so the policies are exercised.
import { keepDatabaseIdentity, runAsDatabaseUser, systemDatabaseClient, withSystemDatabaseAccess } from '../../src/common/database-identity.js'

/**
 * A client (or a repository of a system path) for the suite's own seeding, cleanup and assertions: every call
 * runs as `test-fixture`.
 */
export function fixtureClient<T extends object>(client: T): T {
  return systemDatabaseClient(client, 'test-fixture')
}

/** Runs `work` as `test-fixture`: a system path the suite drives directly, or fixture work over several calls. */
export function asFixture<T>(work: () => T): T {
  return withSystemDatabaseAccess('test-fixture', work)
}

/**
 * `target` (a repository or service) whose every method runs as `userId`, the way a request of that user reaches
 * it. Identity is read when a query is built, so a lazily returned Prisma query carries it too; a returned
 * async generator is pulled as `userId` as well.
 */
export function asDatabaseUser<T extends object>(userId: string, target: T): T {
  return new Proxy(target, {
    get(object, prop) {
      const value: unknown = Reflect.get(object, prop, object)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) =>
        runAsDatabaseUser(userId, () => {
          const result = (value as (...a: unknown[]) => unknown).apply(object, args)
          return isAsyncGenerator(result) ? keepDatabaseIdentity(result) : result
        })
    },
  })
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function' && typeof (value as { next?: unknown }).next === 'function'
}
