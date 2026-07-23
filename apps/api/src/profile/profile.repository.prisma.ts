import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { ProfileRecord, ProfileRepository } from './profile.repository.js'

@Injectable()
export class PrismaProfileRepository implements ProfileRepository {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const row = await this.prisma.profile.findUnique({ where: { userId } })
    if (!row) return null
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      steuerId: row.steuerId,
      steuernummer: row.steuernummer,
    }
  }

  async upsert(userId: string, data: ProfileRecord): Promise<ProfileRecord> {
    const row = await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      steuerId: row.steuerId,
      steuernummer: row.steuernummer,
    }
  }
}
