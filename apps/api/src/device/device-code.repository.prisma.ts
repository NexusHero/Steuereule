import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type {
  DeviceCodeRepository,
  DeviceCodeRequestContext,
  DevicePendingRecord,
} from './device-code.repository.js'

@Injectable()
export class PrismaDeviceCodeRepository implements DeviceCodeRepository {
  // Explicit token — see the comment on ProfileController's constructor (esbuild/tsx
  // never emit `design:paramtypes`, so implicit type-based DI silently resolves to
  // undefined without this). Plain PrismaService, not ENCRYPTED_PRISMA: none of
  // DeviceCode's columns are steuerId-class sensitive tax identifiers under
  // ADR-0008's field-encryption scope (mirrors TaxYear's same "not encrypted"
  // reasoning) — an IP/User-Agent/country/timestamp is ordinary request metadata.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
}
