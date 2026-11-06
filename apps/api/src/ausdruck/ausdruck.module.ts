import { Module } from '@nestjs/common'
import { CommuteModule } from '../arbeitsweg/arbeitsweg.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { UnlockModule } from '../freischaltung/freischaltung.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { CapitalModule } from '../kapital/kapital.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { PensionModule } from '../rente/rente.module.js'
import { MasterDataModule } from '../stammdaten/stammdaten.module.js'
import { RentalModule } from '../vermietung/vermietung.module.js'
import { ChildrenModule } from '../kinder/kinder.module.js'
import { LinkModule } from '../kopplung/kopplung.module.js'
import { MarkingModule } from '../kennzeichnung/kennzeichnung.module.js'
import { PrintoutController } from './ausdruck.controller.js'
import { PrintoutService, TEMPLATES_BASE } from './ausdruck.service.js'

@Module({
  imports: [
    MarkingModule,
    AuditModule,
    ChSalaryCertificateModule,
    UnlockModule,
    InterviewModule,
    CapitalModule,
    LstbModule,
    ProfileModule,
    PensionModule,
    MasterDataModule,
    RentalModule,
    ChildrenModule,
    LinkModule,
    CommuteModule,
  ],
  controllers: [PrintoutController],
  providers: [
    PrintoutService,
    { provide: TEMPLATES_BASE, useValue: new URL('../../assets/vordrucke/', import.meta.url) },
  ],
})
export class PrintoutModule {}
