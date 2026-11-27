import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { withRuntimeDatabaseRole } from '../config/database-url.js'
import { withAdaptiveDatabasePoolUrl } from '../config/runtime-capacity.js'
import { createDatabaseAdapter } from '../config/database-adapter.js'

/**
 * Thin Prisma wrapper with CPU-adaptive connection pool sizing. It connects as the runtime role, which the
 * row-level policies bind (P11); `PrismaModule` wraps it so every query carries the request's identity.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // Prisma 7 needs an adapter to construct a client at all; the boot guard has already refused an unset URL.
    const rawUrl = process.env.DATABASE_URL
    super({ adapter: createDatabaseAdapter(rawUrl ? withRuntimeDatabaseRole(withAdaptiveDatabasePoolUrl(rawUrl)) : rawUrl) })
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
