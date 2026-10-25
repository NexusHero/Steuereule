import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AccountModule } from './account/account.module.js'
import { AuthModule } from './auth/auth.module.js'
import { BelegModule } from './beleg/beleg.module.js'
import { BescheidModule } from './bescheid/bescheid.module.js'
import { FristenModule } from './fristen/fristen.module.js'
import { UebernahmeModule } from './uebernahme/uebernahme.module.js'
import { ChLohnausweisModule } from './ch-lohnausweis/ch-lohnausweis.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { DeviceModule } from './device/device.module.js'
import { HealthModule } from './health/health.module.js'
import { InterviewModule } from './interview/interview.module.js'
import { KapitalModule } from './kapital/kapital.module.js'
import { LstbModule } from './lstb/lstb.module.js'
import { ProfileModule } from './profile/profile.module.js'
import { RenteModule } from './rente/rente.module.js'
import { VeranlagungsartenvergleichModule } from './veranlagungsartenvergleich/veranlagungsartenvergleich.module.js'
import { VermietungModule } from './vermietung/vermietung.module.js'

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
    LstbModule,
    ChLohnausweisModule,
    RenteModule,
    KapitalModule,
    BelegModule,
    BescheidModule,
    AccountModule,
    DeviceModule,
    HealthModule,
    VeranlagungsartenvergleichModule,
    VermietungModule,
    FristenModule,
    UebernahmeModule,
  ],
})
export class AppModule {}
