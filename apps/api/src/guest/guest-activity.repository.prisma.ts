import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { GuestActivityRepository } from './guest-activity.repository.js'

@Injectable()
export class PrismaGuestActivityRepository implements GuestActivityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async touch(guestUserId: string, at: Date): Promise<void> {
    await this.prisma.guestActivity.upsert({ where: { userId: guestUserId }, create: { userId: guestUserId, lastWriteAt: at }, update: { lastWriteAt: at } })
  }

  async dueBefore(cutoff: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.guestActivity.findMany({ where: { lastWriteAt: { lt: cutoff } }, orderBy: { lastWriteAt: 'asc' }, take: limit, select: { userId: true } })
    return rows.map((row) => row.userId)
  }

  async claim(guestUserId: string, cutoff: Date, to: Date): Promise<boolean> {
    const { count } = await this.prisma.guestActivity.updateMany({ where: { userId: guestUserId, lastWriteAt: { lt: cutoff } }, data: { lastWriteAt: to } })
    return count === 1
  }

  async stillClaimed(guestUserId: string, to: Date): Promise<boolean> {
    return (await this.prisma.guestActivity.count({ where: { userId: guestUserId, lastWriteAt: to } })) === 1
  }

  async restart(guestUserId: string, at: Date): Promise<void> {
    await this.prisma.guestActivity.updateMany({ where: { userId: guestUserId }, data: { lastWriteAt: at } })
  }

  async drop(guestUserId: string): Promise<void> {
    await this.prisma.guestActivity.deleteMany({ where: { userId: guestUserId } })
  }

  async isAccount(userId: string): Promise<boolean> {
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) !== null
  }
}
