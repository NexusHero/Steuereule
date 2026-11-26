import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { systemDatabaseClient } from '../common/database-identity.js'
import type {
  DeviceCodeRepository,
  DeviceCodeRequestContext,
  DevicePendingRecord,
} from './device-code.repository.js'

/**
 * The encrypting client (API-19): the desktop's address and browser are ciphertext at rest, like the session's
 * own (ADR-0109 §12). Rows that were never approved are swept after they expired (lifecycle sweep).
 */
@Injectable()
export class PrismaDeviceCodeRepository implements DeviceCodeRepository {
  private readonly prisma: EncryptedPrismaClient

  constructor(@Inject(ENCRYPTED_PRISMA) prisma: EncryptedPrismaClient) {
    // A system path as a whole (P11): device-flow. It also stamps the minted session (API-1).
    this.prisma = systemDatabaseClient(prisma, 'device-flow')
  }

  async recordRequestContext(deviceCode: string, context: DeviceCodeRequestContext): Promise<void> {
    await this.prisma.deviceCode.update({
      where: { deviceCode },
      data: {
        requestUserAgent: context.userAgent,
        requestIp: context.ip,
        requestRegion: context.region,
        requestedAt: context.requestedAt,
      },
    })
  }

  async findByUserCode(userCode: string): Promise<DevicePendingRecord | null> {
    const row = await this.prisma.deviceCode.findUnique({ where: { userCode } })
    if (!row) return null
    return {
      userCode: row.userCode,
      status: row.status,
      userAgent: row.requestUserAgent,
      region: row.requestRegion,
      requestedAt: row.requestedAt,
    }
  }

  async recordApprovalAnchor(userCode: string, userId: string, sessionCreatedAt: Date): Promise<void> {
    await this.prisma.deviceCode.updateMany({ where: { userCode, userId, status: 'pending' }, data: { approvedSessionCreatedAt: sessionCreatedAt } })
  }

  async findApprovalAnchor(deviceCode: string): Promise<Date | null> {
    const row = await this.prisma.deviceCode.findUnique({ where: { deviceCode }, select: { approvedSessionCreatedAt: true } })
    return row?.approvedSessionCreatedAt ?? null
  }

  async anchorSession(sessionToken: string, createdAt: Date, latestExpiry: Date): Promise<void> {
    const row = await this.prisma.session.findUnique({ where: { token: sessionToken }, select: { id: true, expiresAt: true } })
    if (!row) return
    const expiresAt = row.expiresAt.getTime() > latestExpiry.getTime() ? latestExpiry : row.expiresAt
    await this.prisma.session.update({ where: { id: row.id }, data: { createdAt, expiresAt } })
  }
}
