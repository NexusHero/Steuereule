import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { withRuntimeDatabaseRole } from '../config/database-url.js'
import { withAdaptiveDatabasePoolUrl } from '../config/runtime-capacity.js'

/**
 * Thin Prisma wrapper with CPU-adaptive connection pool sizing. It connects as the runtime role, which the
 * row-level policies bind (P11); `PrismaModule` wraps it so every query carries the request's identity.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const rawUrl = process.env.DATABASE_URL
    super(
      rawUrl
        ? { datasources: { db: { url: withRuntimeDatabaseRole(withAdaptiveDatabasePoolUrl(rawUrl)) } } }
        : undefined,
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
