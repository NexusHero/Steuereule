import { Inject, Injectable } from '@nestjs/common'
import { isValidSteuerId, isValidSteuernummer } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ProfileRecord, ProfileRepository } from './profile.repository.js'

/** Thrown when a decrypted Profile field doesn't shape-validate as the thing it's supposed to be. */
export class ProfileIntegrityError extends Error {
  constructor(field: 'steuerId' | 'steuernummer') {
    super(`Profile.${field} failed to decrypt to a valid value — the stored ciphertext may be corrupted.`)
    this.name = 'ProfileIntegrityError'
  }
}

@Injectable()
export class PrismaProfileRepository implements ProfileRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const row = await this.prisma.profile.findUnique({ where: { userId } })
    if (!row) return null
    if (row.steuerId !== null && !isValidSteuerId(row.steuerId)) throw new ProfileIntegrityError('steuerId')
    if (!isValidSteuernummer(row.steuernummer ?? undefined)) throw new ProfileIntegrityError('steuernummer')
    return toRecord(row)
  }

  async upsert(userId: string, data: ProfileRecord): Promise<ProfileRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.profile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: { ...data },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'profile' },
      }),
    ])
    return toRecord(row)
  }
}

function toRecord(row: {
  firstName: string
  lastName: string
  steuerId: string | null
  steuernummer: string | null
  createdAt: Date
  updatedAt: Date
}): ProfileRecord {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    steuerId: row.steuerId,
    steuernummer: row.steuernummer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
