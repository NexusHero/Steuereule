import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AccountModule } from './account/account.module.js'
import { AuthModule } from './auth/auth.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { DeviceModule } from './device/device.module.js'
import { HealthModule } from './health/health.module.js'
import { InterviewModule } from './interview/interview.module.js'
import { ProfileModule } from './profile/profile.module.js'

@Module({
  imports: [
    // One default throttler; every rate-limited route overrides its own window/max
    // via `@Throttle` (see device.controller.ts / account-deletion.controller.ts).
    // The guard is applied per-route (`@UseGuards(ThrottlerGuard)`), not globally,
    // so the account-deletion route can run it *after* UserContextGuard resolves the
    // userId its tracker keys on.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    AuthModule,
    ProfileModule,
    CockpitModule,
    InterviewModule,
    AccountModule,
    DeviceModule,
    HealthModule,
  ],
})
export class AppModule {}
