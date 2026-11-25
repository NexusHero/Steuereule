// H2-8: removing a further business deleted its profile and then its empty book outside a transaction
// and without the erasure flag, so the append-only trigger of the book (migration
// 20261120100000_self_employment) refused the second delete and left the profile gone, the book kept.
// Both deletes now run in one transaction that turns the flag on first; only an empty book goes.
import { describe, expect, it } from 'vitest'
import { PrismaBusinessRepository } from '../src/business/business.repository.prisma.js'

function prismaRecording() {
  const steps: string[] = []
  let ledgerWhere: Record<string, unknown> = {}
  const client = (scope: string) => ({
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      steps.push(`${scope}:executeRaw:${strings.join('?')}:${values.join(',')}`)
      return Promise.resolve(1)
    },
    businessProfile: {
      deleteMany: () => {
        steps.push(`${scope}:businessProfile.deleteMany`)
        return Promise.resolve({ count: 1 })
      },
    },
    ledger: {
      deleteMany: (args: { where: Record<string, unknown> }) => {
        ledgerWhere = args.where
        steps.push(`${scope}:ledger.deleteMany`)
        return Promise.resolve({ count: 1 })
      },
    },
  })
  const prisma = {
    ...client('outside'),
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      steps.push('begin')
      const result = await work(client('tx'))
      steps.push('commit')
      return result
    },
  }
  return { steps, ledgerWhere: () => ledgerWhere, repository: new PrismaBusinessRepository(prisma as never) }
}

describe('PrismaBusinessRepository.deleteProfile (H2-8)', () => {
  it('turns the erasure flag on, then deletes profile and empty book, all inside one transaction', async () => {
    const { steps, ledgerWhere, repository } = prismaRecording()

    await repository.deleteProfile('u', 2025, { person: 'A', business: 2 })

    expect(steps).toHaveLength(5)
    expect(steps[0]).toBe('begin')
    expect(steps[1]).toMatch(/^tx:executeRaw:SELECT set_config\(\?, 'on', true\):steuereule\.erasure$/)
    expect(steps.slice(2)).toEqual(['tx:businessProfile.deleteMany', 'tx:ledger.deleteMany', 'commit'])
    // The guard stays: a book with entries, log records or bank transactions is never deleted.
    expect(ledgerWhere()).toMatchObject({ userId: 'u', taxYear: 2025, person: 'A', business: 2, entries: { none: {} }, logRecords: { none: {} }, bankTransactions: { none: {} } })
  })
})
