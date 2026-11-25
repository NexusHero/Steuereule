// Art. 17: the coverage of every model is locked by personal-data-registry.lock.test.ts (P7); this file keeps the
// order proof for the append-only book.
import { describe, expect, it } from 'vitest'

describe('account deletion and the append-only book (ADR-0101)', () => {
  it('turns the erasure flag on before it deletes a single tax-data row', async () => {
    const { deleteAccountTransaction } = await import('../src/account/delete-account-transaction.prisma.js')
    const calls: string[] = []
    const table = (name: string) => ({
      count: async () => 0,
      deleteMany: async () => {
        calls.push(`delete:${name}`)
        return { count: 0 }
      },
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => null,
      findMany: async () => [],
      delete: async () => undefined,
    })
    const tx = new Proxy(
      {
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          calls.push(`raw:${strings.join('?')}:${values.join(',')}`)
          return 1
        },
      } as Record<string, unknown>,
      { get: (target, key) => (key in target ? target[String(key)] : table(String(key))) },
    )
    const prisma = { $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) }
    await deleteAccountTransaction(prisma as never, 'user-1')
    const flag = calls.findIndex((c) => c.startsWith('raw:') && c.includes('set_config') && c.includes('steuereule.erasure'))
    const firstBookDelete = calls.indexOf('delete:journalLine')
    expect(flag).toBeGreaterThanOrEqual(0)
    expect(firstBookDelete).toBeGreaterThan(flag)
    expect(calls.indexOf('delete:journalEntry')).toBeGreaterThan(firstBookDelete)
    expect(calls.indexOf('delete:ledger')).toBeGreaterThan(calls.indexOf('delete:ledgerLogRecord'))
  })
})
