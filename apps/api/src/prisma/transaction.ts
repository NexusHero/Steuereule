import { AsyncLocalStorage } from 'node:async_hooks'
import { Prisma } from '@prisma/client'
import { ConflictError } from '../common/domain-error.js'
import type { KeyedLock } from '../common/keyed-lock.js'
import type { TransactionRunner } from '../common/transaction-runner.js'

const activeTransaction = new AsyncLocalStorage<object>()

/**
 * Repositories keep injecting one client; the proxy routes each call to the
 * transaction client of the surrounding `run`, so no repository signature changes.
 */
export function transactionAwareClient<T extends object>(root: T): T {
  return new Proxy(root, {
    get(target, prop) {
      const tx = activeTransaction.getStore()
      // Repositories batch their own writes with `$transaction([...])`; an interactive
      // transaction client has no such method, so those batches join the outer one instead.
      if (tx !== undefined && prop === '$transaction') return joinOuterTransaction(tx)
      const source = tx ?? target
      const value: unknown = Reflect.get(source, prop, source)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(source) : value
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
    const outer = activeTransaction.getStore() as LockingClient | undefined
    if (outer !== undefined) {
      await outer.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
      return work()
    }
    return this.client.$transaction(
      async (tx) => {
        await (tx as LockingClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
        return activeTransaction.run(tx, work)
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
      return await this.client.$transaction((tx) => activeTransaction.run(tx, work), {
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
