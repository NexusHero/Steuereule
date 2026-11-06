import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AccountModule } from './account/account.module.js'
import { AssistantsModule } from './assistenten/assistenten.module.js'
import { PrintoutModule } from './ausdruck/ausdruck.module.js'
import { AuthModule } from './auth/auth.module.js'
import { ReceiptModule } from './beleg/beleg.module.js'
import { AssessmentModule } from './bescheid/bescheid.module.js'
import { UnlockModule } from './freischaltung/freischaltung.module.js'
import { DeadlinesModule } from './fristen/fristen.module.js'
import { TakeoverModule } from './uebernahme/uebernahme.module.js'
import { ConfirmationModule } from './bestaetigung/bestaetigung.module.js'
import { ChSalaryCertificateModule } from './ch-lohnausweis/ch-lohnausweis.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { DeviceModule } from './device/device.module.js'
import { HealthModule } from './health/health.module.js'
import { InterviewModule } from './interview/interview.module.js'
import { CapitalModule } from './kapital/kapital.module.js'
import { CommuteModule } from './arbeitsweg/arbeitsweg.module.js'
import { TaxEstimateModule } from './steuerschaetzung/steuerschaetzung.module.js'
import { LstbModule } from './lstb/lstb.module.js'
import { ProfileModule } from './profile/profile.module.js'
import { PensionModule } from './rente/rente.module.js'
import { MasterDataModule } from './stammdaten/stammdaten.module.js'
import { FilingTypeComparisonModule } from './veranlagungsartenvergleich/veranlagungsartenvergleich.module.js'
import { RentalModule } from './vermietung/vermietung.module.js'
import { ChildrenModule } from './kinder/kinder.module.js'
import { LinkModule } from './kopplung/kopplung.module.js'
import { OwlModeModule } from './eulen-modus/eulen-modus.module.js'
import { DomainErrorFilter } from './common/domain-error.filter.js'

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    AuthModule,
    ProfileModule,
    CockpitModule,
    InterviewModule,
    LstbModule,
    ChSalaryCertificateModule,
    PensionModule,
    CapitalModule,
    CommuteModule,
    TaxEstimateModule,
    ReceiptModule,
    AssessmentModule,
    AccountModule,
    AssistantsModule,
    DeviceModule,
    HealthModule,
    FilingTypeComparisonModule,
    RentalModule,
    DeadlinesModule,
    TakeoverModule,
    ConfirmationModule,
    UnlockModule,
    MasterDataModule,
    PrintoutModule,
    ChildrenModule,
    LinkModule,
    OwlModeModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
