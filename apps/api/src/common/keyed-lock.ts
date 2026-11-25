/**
 * One writer at a time per key: "count, then create" and "check, then create" become one step for every caller
 * that takes the same key. The Prisma adapter (`prisma/transaction.ts`) holds a Postgres advisory lock for the
 * length of a Read Committed transaction, so every repository call inside `work` joins that transaction and
 * reads what the previous holder committed. Traces to: ADR-0052 amendment 9 (caps under a lock).
 */
export interface KeyedLock {
  withLock<T>(key: string, work: () => Promise<T>): Promise<T>
}

export const KEYED_LOCK = Symbol('KEYED_LOCK')

/**
 * In-process: calls with the same key run one after the other. Enough for one process and for tests with
 * in-memory repositories; it gives no transaction, so a throw does not undo what `work` already wrote.
 */
export function inProcessKeyedLock(): KeyedLock {
  const tails = new Map<string, Promise<unknown>>()
  return {
    async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve()
      const run = previous.then(work, work)
      const tail = run.catch(() => undefined)
      tails.set(key, tail)
      try {
        return await run
      } finally {
        if (tails.get(key) === tail) tails.delete(key)
      }
    },
  }
}
