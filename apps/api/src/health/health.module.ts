import { Module } from '@nestjs/common'
import { assertDatabaseReachable } from '../config/assert-database-reachable.js'
import { HealthController } from './health.controller.js'
import { DATABASE_REACHABILITY_CHECK, HealthService } from './health.service.js'

@Module({
  controllers: [HealthController],
  providers: [
    // The real probe in production/dev. `test/support/build-test-app.ts` overrides this
    // token for the no-DB unit suite (ADR-0004) — see that file's own comment.
    { provide: DATABASE_REACHABILITY_CHECK, useValue: assertDatabaseReachable },
    HealthService,
  ],
})
export class HealthModule {}
