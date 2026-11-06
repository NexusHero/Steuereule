import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type {
  OwlSettingRecord,
  OwlSettingRepository,
  OwlCardDismissalRepository,
} from './eulen-modus.repository.js'

@Injectable()
export class PrismaOwlSettingRepository implements OwlSettingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<OwlSettingRecord | null> {
    const row = await this.prisma.eulenEinstellung.findUnique({ where: { userId } })
    if (!row) return null
    return {
      userId: row.userId,
      aktiviert: row.aktiviert,
      aktiviertAm: row.aktiviertAm,
    }
  }

  async setEnabled(userId: string, aktiviert: boolean): Promise<OwlSettingRecord> {
    const now = new Date()
    const [row] = await this.prisma.$transaction([
      this.prisma.eulenEinstellung.upsert({
        where: { userId },
        create: {
          userId,
          aktiviert,
          aktiviertAm: aktiviert ? now : null,
        },
        update: {
          aktiviert,
          ...(aktiviert && { aktiviertAm: now }),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'eulen_einstellung' },
      }),
    ])
    return {
      userId: row.userId,
      aktiviert: row.aktiviert,
      aktiviertAm: row.aktiviertAm,
    }
  }
}

@Injectable()
export class PrismaOwlCardDismissalRepository implements OwlCardDismissalRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUserAndYear(userId: string, steuerjahr: number): Promise<string[]> {
    const rows = await this.prisma.eulenKartenVerwurf.findMany({
      where: { userId, steuerjahr },
      select: { fingerprint: true },
    })
    return rows.map((r) => r.fingerprint)
  }

  async dismiss(userId: string, steuerjahr: number, fingerprint: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.eulenKartenVerwurf.create({
        data: { userId, steuerjahr, fingerprint },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'eulen_verwurf' },
      }),
    ])
  }
}
