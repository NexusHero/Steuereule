import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AccountModule } from './account/account.module.js'
import { AssistentenModule } from './assistenten/assistenten.module.js'
import { AusdruckModule } from './ausdruck/ausdruck.module.js'
import { AuthModule } from './auth/auth.module.js'
import { BelegModule } from './beleg/beleg.module.js'
import { BescheidModule } from './bescheid/bescheid.module.js'
import { FreischaltungModule } from './freischaltung/freischaltung.module.js'
import { FristenModule } from './fristen/fristen.module.js'
import { UebernahmeModule } from './uebernahme/uebernahme.module.js'
import { BestaetigungModule } from './bestaetigung/bestaetigung.module.js'
import { ChLohnausweisModule } from './ch-lohnausweis/ch-lohnausweis.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { DeviceModule } from './device/device.module.js'
import { HealthModule } from './health/health.module.js'
import { InterviewModule } from './interview/interview.module.js'
import { KapitalModule } from './kapital/kapital.module.js'
import { ArbeitswegModule } from './arbeitsweg/arbeitsweg.module.js'
import { LstbModule } from './lstb/lstb.module.js'
import { ProfileModule } from './profile/profile.module.js'
import { RenteModule } from './rente/rente.module.js'
import { StammdatenModule } from './stammdaten/stammdaten.module.js'
import { VeranlagungsartenvergleichModule } from './veranlagungsartenvergleich/veranlagungsartenvergleich.module.js'
import { VermietungModule } from './vermietung/vermietung.module.js'
import { KinderModule } from './kinder/kinder.module.js'
import { KopplungModule } from './kopplung/kopplung.module.js'
import { EulenModusModule } from './eulen-modus/eulen-modus.module.js'
import { DomainErrorFilter } from './common/domain-error.filter.js'

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    AuthModule,
    ProfileModule,
    CockpitModule,
    InterviewModule,
    LstbModule,
    ChLohnausweisModule,
    RenteModule,
    KapitalModule,
    ArbeitswegModule,
    BelegModule,
    BescheidModule,
    AccountModule,
    AssistentenModule,
    DeviceModule,
    HealthModule,
    VeranlagungsartenvergleichModule,
    VermietungModule,
    FristenModule,
    UebernahmeModule,
    BestaetigungModule,
    FreischaltungModule,
    StammdatenModule,
    AusdruckModule,
    KinderModule,
    KopplungModule,
    EulenModusModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
