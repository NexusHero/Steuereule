import { Inject, Injectable } from '@nestjs/common'
import { isValidSteuerId, isValidSteuernummer } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ProfileRecord, ProfileRepository } from './profile.repository.js'

/**
 * Thrown when a decrypted (or pass-through) Profile field doesn't shape-validate as
 * the thing it's supposed to be (REQ-003.5). prisma-field-encryption's `mode=strict`
 * throws when a value *parses* as a cloak envelope but fails to decrypt (a tampered
 * ciphertext byte or auth tag) — but by design it silently passes through any stored
 * value that doesn't parse as an envelope at all, to support gradual migration from
 * legacy clear-text data. This API has never written a plaintext row (every write
 * goes through this same extended client from day one), so any such pass-through
 * value is definitionally corruption, not legacy data. Re-using
 * isValidSteuerId/isValidSteuernummer — the exact same determinism-boundary
 * validators the write-side DTOs already enforce — catches that case too, without
 * hand-rolling a second parser for the cloak envelope format.
 */
export class ProfileIntegrityError extends Error {
  constructor(field: 'steuerId' | 'steuernummer') {
    super(`Profile.${field} failed to decrypt to a valid value — the stored ciphertext may be corrupted.`)
    this.name = 'ProfileIntegrityError'
  }
}

@Injectable()
export class PrismaProfileRepository implements ProfileRepository {
  // Explicit token — see the comment on ProfileController's constructor. Injects the
  // field-encryption-extended client (ADR-0008), never the plain PrismaService: this
  // is the only place Profile rows are read/written, so it's the only place that
  // needs to (transparently) encrypt/decrypt steuerId/steuernummer.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const row = await this.prisma.profile.findUnique({ where: { userId } })
    if (!row) return null
    if (!isValidSteuerId(row.steuerId)) throw new ProfileIntegrityError('steuerId')
    if (!isValidSteuernummer(row.steuernummer ?? undefined)) throw new ProfileIntegrityError('steuernummer')
    return toRecord(row)
  }

  /**
   * Idempotent upsert scoped to userId. Writes the profile row and its WRITE audit
   * entry (REQ-004.1) as a single Prisma array-form `$transaction` — both statements
   * commit or neither does, so a persisted profile write can never exist without its
   * audit entry (ADR-0008). This is the one place that composes with
   * TaxDataAccessLog directly rather than through AuditService: true cross-table
   * atomicity needs both operations passed to `$transaction` *unexecuted*, which
   * only the Prisma-specific persistence layer can do without leaking Prisma types
   * into the Prisma-agnostic ProfileService/AuditService seam. The read path's
   * (non-atomic, informational) READ entry is still appended via AuditService — see
   * ProfileService.getProfile.
   */
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
  steuerId: string
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
