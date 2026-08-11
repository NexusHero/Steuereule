import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { HealthController } from './health.controller.js'
import { DATABASE_REACHABILITY_CHECK, HealthService } from './health.service.js'
import { createPooledDatabaseReachabilityCheck } from './pooled-database-reachability-check.js'

@Module({
  // PrismaModule, not a bare PrismaService import: PrismaService is a provider of
  // PrismaModule (see that module's own comment), not exported/global on its own —
  // this import is what puts it in HealthModule's DI graph for the factory below.
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [
    // The real, request-serving probe (#338 F1 — see pooled-database-reachability-check.ts's
    // own header for the measured failure this replaced). Deliberately built from the app's
    // own `PrismaService`, not #275's `assertDatabaseReachable` — that function stays the
    // one-shot boot guard it always was, imported exactly once, from `main.ts`. This factory
    // only captures the `PrismaService` reference at module-construction time; it calls
    // nothing on it — the first `$queryRaw` happens on the first real `/v1/health/ready`
    // request, inside `pooledDatabaseReachabilityCheck()`, never here. That is what keeps
    // this compatible with `assert-database-reachable.ts`'s "building the app never needs a
    // live database" rule, and why `test/support/build-test-app.ts`'s inert `PrismaService`
    // stub (ADR-0004) still works unchanged — nothing calls a method on it during boot.
    {
      provide: DATABASE_REACHABILITY_CHECK,
      useFactory: (prisma: PrismaService) => createPooledDatabaseReachabilityCheck(prisma),
      inject: [PrismaService],
    },
    HealthService,
  ],
})
export class HealthModule {}
