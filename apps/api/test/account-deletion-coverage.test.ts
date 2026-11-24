// Art. 17 coverage control: every Prisma model carrying a `userId` must be accounted
// for by the account-deletion transaction. Derived from `Prisma.dmmf` (the schema
// itself), so a new userId-keyed model that nobody added to the deletion goes red here
// instead of silently surviving an erasure — the defect this test was written after:
// ten tax-data tables outlived "Konto löschen" because none has a FK to User.
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { taxDataTables } from '../src/account/delete-account-transaction.prisma.js'

// Handled by deleteAccountTransaction outside taxDataTables(), each with its reason.
const HANDLED_ELSEWHERE: Record<string, string> = {
  Profile: 'deleted (or held) by its own step',
  TaxDataAccessLog: 'anonymised to a tombstone, Art. 30 record retained',
  Session: 'cascades off User',
  Account: 'cascades off User',
  TwoFactor: 'cascades off User',
  Passkey: 'cascades off User',
  Unlock: 'cascades off User',
  OauthClient: 'cascades off User',
  OauthRefreshToken: 'cascades off User',
  OauthAccessToken: 'cascades off User',
  OauthConsent: 'cascades off User',
  DeviceCode: 'deleted by its own step',
  GuestActivity: 'the guest retention clock; the sweep drops it with the guest (ADR-0109)',
  LegalHold: 'the retention record itself — must outlive the erasure it justifies',
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

describe('account deletion covers every userId-keyed model', () => {
  const userKeyedModels = Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'userId'))
    .map((model) => model.name)

  // A proxy stands in for the transaction client: each accessed delegate reports its
  // own model name, so this reads exactly what taxDataTables() would delete.
  const covered = new Set(
    taxDataTables(new Proxy({}, { get: (_target, key) => String(key) }) as never).map(String),
  )

  it.each(userKeyedModels)('%s is deleted, held, anonymised or cascaded', (model) => {
    expect(covered.has(lowerFirst(model)) || model in HANDLED_ELSEWHERE).toBe(true)
  })

  it('control proof: the check is not vacuous — the tax-data tables are found and covered', () => {
    expect(userKeyedModels).toContain('Capital')
    expect(covered.has('capital')).toBe(true)
    expect(covered.has('profile')).toBe(false)
  })
})

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
