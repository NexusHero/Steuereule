// Prisma implementation of the export data assembly (ADR-0013 §4, REQ-011).
// Reads Profile through ENCRYPTED_PRISMA (field-level decryption), the user's own
// TaxDataAccessLog rows, and better-auth identity — never any other user's data,
// and never secrets (password hash, session/verification tokens).
import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportData, ExportRepository } from './export.repository.js'

@Injectable()
export class PrismaExportRepository implements ExportRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async assembleExportData(userId: string): Promise<ExportData> {
    // Three parallel queries — no interdependency, so they can run concurrently.
    const [profileRow, accessLogRows, userRow, accountRows] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.taxDataAccessLog.findMany({
        where: { userId },
        select: { action: true, resource: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          emailVerified: true,
          createdAt: true,
        },
      }),
      this.prisma.account.findMany({
        where: { userId },
        select: { providerId: true },
      }),
    ])

    if (!userRow) {
      throw new Error(`ExportRepository: User ${userId} not found — export requires an existing account.`)
    }

    const authProviders = accountRows.map((a) => a.providerId)
    // Deduplicate: a user may have multiple Account rows with the same providerId
    // (e.g. re-linked credentials). The export lists unique provider names.
    const uniqueAuthProviders = [...new Set(authProviders)]

    return {
      profile: profileRow
        ? {
            firstName: profileRow.firstName,
            lastName: profileRow.lastName,
            steuerId: profileRow.steuerId,
            steuernummer: profileRow.steuernummer,
            createdAt: profileRow.createdAt,
            updatedAt: profileRow.updatedAt,
          }
        : null,
      account: {
        email: userRow.email,
        name: userRow.name,
        emailVerified: userRow.emailVerified,
        createdAt: userRow.createdAt,
        authProviders: uniqueAuthProviders,
      },
      accessLog: accessLogRows.map((row) => ({
        action: row.action,
        resource: row.resource,
        createdAt: row.createdAt,
      })),
    }
  }
}
