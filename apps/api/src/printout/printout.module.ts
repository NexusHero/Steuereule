import { Module } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'
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
import { ACROFORM_TEMPLATES_BASE, PRINTOUT_ESTIMATE, PrintoutService, TEMPLATES_BASE, type PrintoutEstimate } from './printout.service.js'
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
    { provide: ACROFORM_TEMPLATES_BASE, useValue: new URL('../../assets/vordrucke-acroform/', import.meta.url) },
    {
      // Looked up when asked for, as the capital module does: the estimate's module is not imported here.
      provide: PRINTOUT_ESTIMATE,
      inject: [ModuleRef],
      useFactory: (moduleRef: ModuleRef): PrintoutEstimate => ({
        getState: (userId, taxYear) => moduleRef.get(TaxEstimateService, { strict: false }).getState(userId, taxYear),
      }),
    },
  ],
  exports: [PrintoutService, PrintoutJobService],
})
export class PrintoutModule {}
