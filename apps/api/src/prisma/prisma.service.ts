// Thin Prisma wrapper. Deliberately does NOT eagerly $connect() in onModuleInit —
// Prisma Client connects lazily on first query, so building the Nest app (e.g. to
// build the OpenAPI document, or in test/support/build-test-app.ts) never requires a
// live database. The real, request-serving process still needs one from its first
// request: `main.ts`'s `bootstrap()` — not this file, see
// config/assert-database-reachable.ts's own comment for why — asserts that
// separately, before ever calling buildApp().
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
