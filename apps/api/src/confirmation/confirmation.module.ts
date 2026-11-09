import { Module } from '@nestjs/common'
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { CapitalModule } from '../capital/capital.module.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { CommuteModule } from '../commute/commute.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { PensionModule } from '../pension/pension.module.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { RentalModule } from '../rental/rental.module.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { ProfileModule } from '../profile/profile.module.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { LinkModule } from '../link/link.module.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { InterviewModule } from '../interview/interview.module.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { ChildrenModule } from '../children/children.module.js'
import { ConfirmationController } from './confirmation.controller.js'
import { ConfirmationService } from './confirmation.service.js'
import { FIELD_ACCESS, fieldAccessFrom } from './field-access.js'

@Module({
  imports: [
    AuditModule,
    MarkingModule,
    LstbModule,
    PensionModule,
    CapitalModule,
    RentalModule,
    ProfileModule,
    MasterDataModule,
    LinkModule,
    InterviewModule,
    ChSalaryCertificateModule,
    ChildrenModule,
    CommuteModule,
    AssessmentModule,
  ],
  controllers: [ConfirmationController],
  providers: [
    ConfirmationService,
    {
      provide: FIELD_ACCESS,
      inject: [
        WAGE_TAX_CERTIFICATE_REPOSITORY,
        PENSION_REPOSITORY,
        CAPITAL_REPOSITORY,
        RENTAL_REPOSITORY,
        PROFILE_REPOSITORY,
        MASTER_DATA_REPOSITORY,
        PARTNER_COUPLING_REPOSITORY,
        INTERVIEW_ANSWER_REPOSITORY,
        CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
        CHILD_REPOSITORY,
        COMMUTE_REPOSITORY,
        ASSESSMENT_REPOSITORY,
      ],
      useFactory: (
        lstb: WageTaxCertificateRepository,
        pension: PensionRepository,
        capital: CapitalRepository,
        rental: RentalRepository,
        profile: ProfileRepository,
        masterData: MasterDataRepository,
        link: PartnerCouplingRepository,
        interview: InterviewAnswerRepository,
        chSalaryCertificate: CrossBorderSalaryStatementRepository,
        child: ChildRepository,
        commute: CommuteRepository,
        assessment: AssessmentRepository,
      ) =>
        fieldAccessFrom({
          lstb,
          pension,
          capital,
          rental,
          profile,
          masterData,
          link,
          interview,
          chSalaryCertificate,
          child,
          commute,
          assessment,
        }),
    },
  ],
  exports: [ConfirmationService],
})
export class ConfirmationModule {}
