import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { HealthController } from './health.controller.js'
import { DATABASE_REACHABILITY_CHECK, HealthService } from './health.service.js'
import { createPooledDatabaseReachabilityCheck } from './pooled-database-reachability-check.js'

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [
    {
      provide: DATABASE_REACHABILITY_CHECK,
      useFactory: (prisma: PrismaService) => createPooledDatabaseReachabilityCheck(prisma),
      inject: [PrismaService],
    },
    HealthService,
  ],
})
export class HealthModule {}
