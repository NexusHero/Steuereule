import { Module } from '@nestjs/common'
import { CommuteModule } from '../commute/commute.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { UnlockModule } from '../unlock/unlock.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { CapitalModule } from '../capital/capital.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { PensionModule } from '../pension/pension.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { LinkModule } from '../link/link.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { PrintoutController } from './printout.controller.js'
import { PrintoutService, TEMPLATES_BASE } from './printout.service.js'
import { PrintoutJobService } from './printout-job.service.js'

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
    PrintoutJobService,
    { provide: TEMPLATES_BASE, useValue: new URL('../../assets/vordrucke/', import.meta.url) },
  ],
  exports: [PrintoutService, PrintoutJobService],
})
export class PrintoutModule {}
