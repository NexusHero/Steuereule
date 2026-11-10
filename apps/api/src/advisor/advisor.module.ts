import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { CapitalModule } from '../capital/capital.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { CommuteModule } from '../commute/commute.module.js'
import { ConfirmationModule } from '../confirmation/confirmation.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KiModule } from '../ki/ki.module.js'
import { LstbDataModule } from '../lstb/lstb-data.module.js'
import { OwlModeModule } from '../owl-mode/owl-mode.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { AdvisorController } from './advisor.controller.js'
import { AdvisorDataModule } from './advisor-data.module.js'
import { AdvisorService } from './advisor.service.js'

@Module({
  imports: [
    PrismaModule,
    AdvisorDataModule,
    AuditModule,
    OwlModeModule,
    ConfirmationModule,
    InterviewModule,
    KiModule,
    LstbDataModule,
    ChSalaryCertificateModule,
    CommuteModule,
    ChildrenModule,
    RentalModule,
    CapitalModule,
    ProfileModule,
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService],
  exports: [AdvisorService, AdvisorDataModule],
})
export class AdvisorModule {}
