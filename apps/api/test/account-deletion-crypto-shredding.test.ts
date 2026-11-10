// ADR-0059: the receipt key lives in the keystore database, outside the tax-data transaction.
// It must be destroyed BEFORE that transaction (a failure then leaves files unreadable, never
// readable-but-orphaned), and kept while tax data is under a legal hold.
import { describe, expect, it } from 'vitest'
import { PrismaAccountDeletionRepository } from '../src/account/account-deletion.repository.prisma.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'
import { InMemoryUserKeyStore } from './fakes/in-memory-user-key-store.js'

function prismaStub(taxDataHolds: number, order: string[]): PrismaService {
  return {
    legalHold: { count: async () => taxDataHolds },
    $transaction: async () => {
      order.push('transaction')
      throw new Error('simulated tax-data transaction failure')
    },
  } as unknown as PrismaService
}

describe('PrismaAccountDeletionRepository — crypto-shredding order', () => {
  it('destroys the receipt key before the tax-data transaction runs', async () => {
    const order: string[] = []
    const keys = new InMemoryUserKeyStore()
    await keys.createIfAbsent('user-del', { wrappedDek: 'v1.x', keyVersion: 1 })
    const originalDestroy = keys.destroy.bind(keys)
    keys.destroy = async (userId) => {
      order.push('shred')
      return originalDestroy(userId)
    }

    await expect(new PrismaAccountDeletionRepository(prismaStub(0, order), keys).deleteAccount('user-del')).rejects.toThrow(
      /simulated/,
    )

    expect(order).toEqual(['shred', 'transaction'])
    expect(await keys.find('user-del')).toBeNull()
  })

  it('keeps the key while tax data is under a legal hold', async () => {
    const keys = new InMemoryUserKeyStore()
    await keys.createIfAbsent('user-held', { wrappedDek: 'v1.x', keyVersion: 1 })

    await expect(new PrismaAccountDeletionRepository(prismaStub(1, []), keys).deleteAccount('user-held')).rejects.toThrow()

    expect(keys.destroyed).toEqual([])
    expect(await keys.find('user-held')).not.toBeNull()
  })
})
