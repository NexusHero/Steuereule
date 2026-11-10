import { PrismaClient as KeystorePrismaClient } from '@prisma-keystore/client'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { resolveKeystoreDatabaseUrl } from './keystore-config.js'
import type { UserKeyStore, WrappedUserKey } from './user-key-store.js'

/** Prisma adapter on the dedicated keystore database (prisma/keystore/schema.prisma). */
@Injectable()
export class PrismaUserKeyStore implements UserKeyStore, OnModuleDestroy {
  private readonly client = new KeystorePrismaClient({ datasources: { keystore: { url: resolveKeystoreDatabaseUrl() } } })

  async find(userId: string): Promise<WrappedUserKey | null> {
    const row = await this.client.userDataKey.findUnique({ where: { userId } })
    return row === null ? null : { wrappedDek: row.wrappedDek, keyVersion: row.keyVersion }
  }

  async createIfAbsent(userId: string, candidate: WrappedUserKey): Promise<WrappedUserKey> {
    const row = await this.client.userDataKey.upsert({
      where: { userId },
      update: {},
      create: { userId, wrappedDek: candidate.wrappedDek, keyVersion: candidate.keyVersion },
    })
    return { wrappedDek: row.wrappedDek, keyVersion: row.keyVersion }
  }

  async destroy(userId: string): Promise<boolean> {
    const { count } = await this.client.userDataKey.deleteMany({ where: { userId } })
    return count > 0
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect()
  }
}
