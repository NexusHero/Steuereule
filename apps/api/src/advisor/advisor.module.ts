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
import { AssessmentModule } from '../assessment/assessment.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { AdvisorController } from './advisor.controller.js'
import { ADVISOR_REPOSITORY } from './advisor.repository.js'
import { PrismaAdvisorRepository } from './advisor.repository.prisma.js'
import { AdvisorService } from './advisor.service.js'
import { ADVISOR_RUN_LOG, InMemoryAdvisorRunLog, type AdvisorRunLog } from './run/advisor-run-log.js'
import { RedisAdvisorRunLog } from './run/advisor-run-log.redis.js'
import { AdvisorRunService } from './run/advisor-run.service.js'
import { Redis } from 'ioredis'

/**
 * With REDIS_URL the run log lives in Redis Streams, so any instance can serve a re-attaching
 * client. Without it the log stays in this process: fine for one instance, tests and local work.
 */
export function createAdvisorRunLog(env: NodeJS.ProcessEnv = process.env): AdvisorRunLog {
  const url = env.REDIS_URL?.trim()
  if (!url) return new InMemoryAdvisorRunLog()
  return new RedisAdvisorRunLog(new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false }))
}

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
    TaxEstimateModule,
    AssessmentModule,
  ],
  controllers: [AdvisorController],
  providers: [
    AdvisorService,
    AdvisorRunService,
    { provide: ADVISOR_RUN_LOG, useFactory: () => createAdvisorRunLog() },
    {
      provide: ADVISOR_REPOSITORY,
      useClass: PrismaAdvisorRepository,
    },
  ],
  exports: [AdvisorService, ADVISOR_REPOSITORY],
})
export class AdvisorModule {}
