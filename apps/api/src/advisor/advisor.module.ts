import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { CapitalModule } from '../capital/capital.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { CommuteModule } from '../commute/commute.module.js'
import { ConfirmationModule } from '../confirmation/confirmation.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KiModule } from '../ki/ki.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { OwlModeModule } from '../owl-mode/owl-mode.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { AdvisorController } from './advisor.controller.js'
import { ADVISOR_REPOSITORY } from './advisor.repository.js'
import { PrismaAdvisorRepository } from './advisor.repository.prisma.js'
import { AdvisorService } from './advisor.service.js'

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    OwlModeModule,
    ConfirmationModule,
    InterviewModule,
    KiModule,
    LstbModule,
    ChSalaryCertificateModule,
    CommuteModule,
    ChildrenModule,
    RentalModule,
    CapitalModule,
    ProfileModule,
  ],
  controllers: [AdvisorController],
  providers: [
    AdvisorService,
    {
      provide: ADVISOR_REPOSITORY,
      useClass: PrismaAdvisorRepository,
    },
  ],
  exports: [AdvisorService, ADVISOR_REPOSITORY],
})
export class AdvisorModule {}
