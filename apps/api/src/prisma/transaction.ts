import { AsyncLocalStorage } from 'node:async_hooks'
import { Prisma } from '@prisma/client'
import { ConflictError } from '../common/domain-error.js'
import { currentDatabaseIdentity, MissingDatabaseIdentityError, sameDatabaseIdentity, type DatabaseIdentity } from '../common/database-identity.js'
import type { KeyedLock } from '../common/keyed-lock.js'
import type { TransactionRunner } from '../common/transaction-runner.js'

/** The transaction a `run` opened, and the identity its row-level setting was made for. */
interface ActiveTransaction {
  readonly client: object
  readonly identity: DatabaseIdentity | undefined
}

const activeTransaction = new AsyncLocalStorage<ActiveTransaction>()

// --- Row-level security (P11) ------------------------------------------------------------------------------
// The policies of migration `…_p11_row_level_security` read these two transaction-local settings. A query
// outside a transaction is sent as a batch `[set_config, query]`, which Prisma runs as one transaction on one
// connection; an interactive transaction sets them as its first statement. Without an identity nothing is set,
// and every table with personal data answers with no rows.

/** The account or guest id whose rows the query may see (`app_rls.user_id()` in the policies). */
export const USER_ID_SETTING = 'steuereule.user_id'
/** A named system reason (`app_rls.is_system()`); set only through `withSystemDatabaseAccess`. */
export const SYSTEM_SETTING = 'steuereule.system'

interface RawCapable {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<number>
}

function setIdentity(client: object, identity: DatabaseIdentity | undefined): PromiseLike<number> {
  const userId = identity?.kind === 'user' ? identity.userId : ''
  const system = identity?.kind === 'system' ? identity.reason : ''
  return (client as RawCapable).$executeRaw`SELECT set_config(${USER_ID_SETTING}, ${userId}, true), set_config(${SYSTEM_SETTING}, ${system}, true)`
}

const RAW_QUERY_METHODS = new Set(['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe', '$queryRawTyped'])

/**
 * A query that carries its identity. Prisma queries are lazy; this one too: it runs when awaited, as the batch
 * `[set_config, query]`, or inside a batch of the same client, where the batch carries the setting instead.
 */
class IdentifiedQuery<T> implements PromiseLike<T> {
  private running: Promise<T> | undefined
  readonly [Symbol.toStringTag] = 'PrismaPromise'

  constructor(
    readonly raw: PromiseLike<T>,
    private readonly execute: () => Promise<T>,
  ) {}

  // A Prisma query is a lazy thenable too; this one must stay one so repositories can await or batch it.
  // oxlint-disable-next-line unicorn/no-thenable
  then<A = T, B = never>(onFulfilled?: ((value: T) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    this.running ??= this.execute()
    return this.running.then(onFulfilled, onRejected)
  }

  catch<B = never>(onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<T | B> {
    return this.then(undefined, onRejected)
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.then().finally(onFinally)
  }

  /** Lets Prisma batch the underlying query in a `$transaction([...])` of any client. */
  requestTransaction(...args: unknown[]): unknown {
    return (this.raw as unknown as { requestTransaction(...a: unknown[]): unknown }).requestTransaction(...args)
  }
}

const unwrap = (query: unknown): unknown => (query instanceof IdentifiedQuery ? query.raw : query)

type BatchOrWork = readonly PromiseLike<unknown>[] | ((client: object) => Promise<unknown>)
type TransactionMethod = (work: BatchOrWork, options?: unknown) => Promise<unknown>

/** Outside a transaction: every query, batch and interactive transaction gets the identity's setting first. */
function identifiedRoot(target: object, identity: DatabaseIdentity) {
  const wrapQuery = (create: () => PromiseLike<unknown>) => {
    const raw = create()
    return new IdentifiedQuery(raw, async () => {
      const [, result] = await (target as { $transaction: (q: unknown[]) => Promise<unknown[]> }).$transaction([setIdentity(target, identity), raw])
      return result
    })
  }
  const transaction: TransactionMethod = async (work, options) => {
    const run = (target as { $transaction: TransactionMethod }).$transaction.bind(target)
    if (typeof work === 'function') {
      return run(async (tx: object) => {
        await setIdentity(tx, identity)
        return work(tx)
      }, options)
    }
    const results = (await run([setIdentity(target, identity), ...work.map(unwrap)] as unknown as BatchOrWork, options)) as unknown[]
    return results.slice(1)
  }
  return { wrapQuery, transaction }
}

/** Outside a request and outside a named system path: every query and transaction is refused. */
function refusingRoot(what: string) {
  const refusal = (): Promise<never> => Promise.reject(new MissingDatabaseIdentityError(what))
  // Lazy like a Prisma query: the query is never built, and it rejects only when awaited.
  const wrapQuery = (_create: () => PromiseLike<unknown>) => new IdentifiedQuery<never>(Promise.resolve(undefined as never), refusal)
  const transaction: TransactionMethod = () => Promise.reject(new MissingDatabaseIdentityError(what))
  return { wrapQuery, transaction }
}

/** Inside a transaction opened for another identity: switch the setting for this one query, then back. */
function switchedTransaction(tx: object, opened: DatabaseIdentity | undefined, identity: DatabaseIdentity) {
  const around = async <R>(work: () => PromiseLike<R>): Promise<R> => {
    await setIdentity(tx, identity)
    try {
      return await work()
    } finally {
      await setIdentity(tx, opened)
    }
  }
  const wrapQuery = (create: () => PromiseLike<unknown>) => {
    const raw = create()
    return new IdentifiedQuery(raw, () => around(() => raw))
  }
  const transaction: TransactionMethod = (work) =>
    around(async () => {
      if (typeof work === 'function') return work(tx)
      const results: unknown[] = []
      for (const query of work) results.push(await query)
      return results
    })
  return { wrapQuery, transaction }
}

function identified(source: object, scope: { wrapQuery: (create: () => PromiseLike<unknown>) => unknown; transaction: TransactionMethod }) {
  return new Proxy(source, {
    get(target, prop) {
      if (prop === '$transaction') return scope.transaction
      const value: unknown = Reflect.get(target, prop, target)
      if (typeof prop === 'string' && RAW_QUERY_METHODS.has(prop) && typeof value === 'function') {
        return (...args: unknown[]) => scope.wrapQuery(() => (value as (...a: unknown[]) => PromiseLike<unknown>).apply(target, args))
      }
      if (typeof value === 'function') return (value as (...args: unknown[]) => unknown).bind(target)
      if (isModelDelegate(value)) return delegateProxy(value, scope.wrapQuery)
      return value
    },
  })
}

function isModelDelegate(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { findMany?: unknown }).findMany === 'function'
}

function delegateProxy(delegate: Record<string, unknown>, wrapQuery: (create: () => PromiseLike<unknown>) => unknown) {
  return new Proxy(delegate, {
    get(target, method) {
      const value: unknown = Reflect.get(target, method, target)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => wrapQuery(() => (value as (...a: unknown[]) => PromiseLike<unknown>).apply(target, args))
    },
  })
}

export interface DatabaseClientOptions {
  /**
   * Whether calls join the interactive transaction of a surrounding `run` (the encrypted client: yes). The
   * plain client never did: its queries keep their own connection, now with their own setting.
   */
  readonly joinTransactions?: boolean
}

/**
 * Repositories keep injecting one client; the proxy routes each call to the transaction client of the
 * surrounding `run`, so no repository signature changes, and gives every query the row-level identity of
 * the request or system path it runs for (P11).
 */
export function transactionAwareClient<T extends object>(root: T, options: DatabaseClientOptions = {}): T {
  const joinTransactions = options.joinTransactions ?? true
  return new Proxy(root, {
    get(target, prop) {
      const active = joinTransactions ? activeTransaction.getStore() : undefined
      const identity = currentDatabaseIdentity()
      if (active !== undefined) {
        // An identity other than the one the transaction was opened for (a system step inside a user's
        // transaction, or the reverse) switches the setting around each of its queries.
        if (identity !== undefined && !sameDatabaseIdentity(identity, active.identity)) {
          return Reflect.get(identified(active.client, switchedTransaction(active.client, active.identity, identity)), prop)
        }
        // Repositories batch their own writes with `$transaction([...])`; an interactive
        // transaction client has no such method, so those batches join the outer one instead.
        if (prop === '$transaction') return joinOuterTransaction(active.client)
        const value: unknown = Reflect.get(active.client, prop, active.client)
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(active.client) : value
      }
      if (identity !== undefined) return Reflect.get(identified(target, identifiedRoot(target, identity)), prop)
      // No identity: a query fails when it is built; the client's other methods ($connect, $disconnect, …) work.
      return Reflect.get(identified(target, refusingRoot(String(prop))), prop)
    },
  })
}

function joinOuterTransaction(tx: object) {
  return async (work: readonly PromiseLike<unknown>[] | ((client: object) => Promise<unknown>)): Promise<unknown> => {
    if (typeof work === 'function') return work(tx)
    // Prisma queries are lazy; awaiting them in order runs them on the outer transaction.
    const results: unknown[] = []
    for (const query of work) results.push(await query)
    return results
  }
}

/**
 * Runs `work` so that the repositories and adapters it calls join `tx`, an interactive transaction the caller
 * opened on a client of `PrismaModule` itself: their writes commit or roll back with the caller's own.
 */
export function joinTransaction<T>(tx: object, work: () => Promise<T>): Promise<T> {
  return activeTransaction.run({ client: tx, identity: currentDatabaseIdentity() }, work)
}

interface InteractiveTransactionClient {
  $transaction<R>(
    work: (tx: object) => Promise<R>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel; maxWait: number; timeout: number },
  ): Promise<R>
}

/**
 * An advisory lock per key, held by a Read Committed transaction (not the Repeatable Read of the runner below:
 * its snapshot would be taken by the lock statement itself, before the wait, and the count after it would miss
 * what the previous holder committed). Repositories called in `work` join the transaction. Inside a running
 * transaction the lock is taken there and released with it.
 */
export class PrismaKeyedLock implements KeyedLock {
  constructor(private readonly client: InteractiveTransactionClient) {}

  async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const outer = activeTransaction.getStore()?.client as LockingClient | undefined
    if (outer !== undefined) {
      await outer.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
      return work()
    }
    return this.client.$transaction(
      async (tx) => {
        await (tx as LockingClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
        return activeTransaction.run({ client: tx, identity: currentDatabaseIdentity() }, work)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5_000, timeout: 10_000 },
    )
  }
}

interface LockingClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>
}

export class PrismaTransactionRunner implements TransactionRunner {
  readonly rollsBack = true

  constructor(private readonly client: InteractiveTransactionClient) {}

  isActive(): boolean {
    return activeTransaction.getStore() !== undefined
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (activeTransaction.getStore() !== undefined) return work()
    try {
      // Repeatable Read turns a concurrent write between our stale check and our write
      // into a serialization failure instead of a silent lost update.
      // The client sets the row-level identity as the transaction's first statement (P11).
      const identity = currentDatabaseIdentity()
      return await this.client.$transaction((tx) => activeTransaction.run({ client: tx, identity }, work), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5_000,
        timeout: 10_000,
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictError(
          'CONCURRENT_WRITE_CONFLICT',
          'Die Daten wurden gleichzeitig an anderer Stelle geändert. Bitte erneut versuchen.',
        )
      }
      throw error
    }
  }
}
