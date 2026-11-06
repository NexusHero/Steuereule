import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type {
  OwlSettingRecord,
  OwlSettingRepository,
  OwlCardDismissalRepository,
} from './owl-mode.repository.js'

@Injectable()
export class PrismaOwlSettingRepository implements OwlSettingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<OwlSettingRecord | null> {
    const row = await this.prisma.owlSetting.findUnique({ where: { userId } })
    if (!row) return null
    return {
      userId: row.userId,
      enabled: row.enabled,
      enabledAt: row.enabledAt,
    }
  }

  async setEnabled(userId: string, enabled: boolean): Promise<OwlSettingRecord> {
    const now = new Date()
    const [row] = await this.prisma.$transaction([
      this.prisma.owlSetting.upsert({
        where: { userId },
        create: {
          userId,
          enabled,
          enabledAt: enabled ? now : null,
        },
        update: {
          enabled,
          ...(enabled && { aktiviertAm: now }),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'eulen_einstellung' },
      }),
    ])
    return {
      userId: row.userId,
      enabled: row.enabled,
      enabledAt: row.enabledAt,
    }
  }
}

@Injectable()
export class PrismaOwlCardDismissalRepository implements OwlCardDismissalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUserAndYear(userId: string, taxYear: number): Promise<string[]> {
    const rows = await this.prisma.owlCardDismissal.findMany({
      where: { userId, taxYear },
      select: { fingerprint: true },
    })
    return rows.map((r) => r.fingerprint)
  }

  async dismiss(userId: string, taxYear: number, fingerprint: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.owlCardDismissal.create({
        data: { userId, taxYear, fingerprint },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'eulen_verwurf' },
      }),
    ])
  }
}
