// Thin Prisma wrapper. Deliberately does NOT eagerly $connect() in onModuleInit —
// Prisma Client connects lazily on first query, so booting the Nest app (e.g. to
// build the OpenAPI document) never requires a live database.
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
