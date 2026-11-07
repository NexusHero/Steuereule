import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { withAdaptiveDatabasePoolUrl } from '../config/runtime-capacity.js'

/** Thin Prisma wrapper with CPU-adaptive connection pool sizing. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const rawUrl = process.env.DATABASE_URL
    super(
      rawUrl
        ? { datasources: { db: { url: withAdaptiveDatabasePoolUrl(rawUrl) } } }
        : undefined,
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
