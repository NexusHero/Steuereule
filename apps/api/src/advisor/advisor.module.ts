import { BusinessModule } from '../business/business.module.js'
import { Module } from '@nestjs/common'
import { PrintoutModule } from '../printout/printout.module.js'
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
import { PensionModule } from '../pension/pension.module.js'
import { ReceiptStorageModule } from '../receipt/receipt-storage.module.js'
import { LinkModule } from '../link/link.module.js'
import { AdvisorController } from './advisor.controller.js'
import { ADVISOR_REPOSITORY } from './advisor.repository.js'
import { PrismaAdvisorRepository } from './advisor.repository.prisma.js'
import { AdvisorService } from './advisor.service.js'
import { AdvisorCaseDigest } from './advisor-case-digest.js'
import { AdvisorConversations } from './advisor-conversations.js'
import { AdvisorOpening } from './advisor-opening.js'
import { AdvisorProjectNotes } from './advisor-project-notes.js'
import { AdvisorDocumentStaging } from './advisor-document-staging.js'
import { AdvisorTurn } from './advisor-turn.js'
import { AdvisorCaseFacts } from './advisor-case-facts.js'
import { draftRecordRegistry } from './advisor-draft-records.js'
import { AdvisorDrafts, DRAFT_RECORDS } from './advisor-drafts.js'
import { ChildDraftRecords } from '../children/child-draft-records.js'
import type { DraftRecordSource } from '../common/draft-record-source.js'
import { RentalDraftRecords } from '../rental/rental-draft-records.js'
import { AdvisorModelsService } from './advisor-models.service.js'
import { AdvisorModelCatalog } from '../ki/advisor-model-catalog.js'
import { ADVISOR_RUN_LOG, InMemoryAdvisorRunLog, type AdvisorRunLog } from './run/advisor-run-log.js'
import { RedisAdvisorRunLog } from './run/advisor-run-log.redis.js'
import { AdvisorRunService } from './run/advisor-run.service.js'
import { Redis } from 'ioredis'
import { redisTlsOptions } from '../redis/redis-options.js'
import { FIELD_ENCRYPTION_KEYS, type FieldEncryptionKeySet } from '../common/field-encryption-keys.js'

/**
 * With REDIS_URL the run log lives in Redis Streams, so any instance can serve a re-attaching
 * client. Without it the log stays in this process: fine for one instance, tests and local work.
 */
export function createAdvisorRunLog(keys: FieldEncryptionKeySet, env: NodeJS.ProcessEnv = process.env): AdvisorRunLog {
  const url = env.REDIS_URL?.trim()
  if (!url) return new InMemoryAdvisorRunLog()
  // The events carry the chat text: sealed under a key derived from the field-encryption key (H2-9).
  return new RedisAdvisorRunLog(new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false, ...redisTlsOptions(env) }), keys)
}

@Module({
  imports: [
    PrismaModule,
    PrintoutModule,
    BusinessModule,
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
    PensionModule,
    LinkModule,
    CapitalModule,
    ProfileModule,
    TaxEstimateModule,
    AssessmentModule,
    ReceiptStorageModule,
  ],
  controllers: [AdvisorController],
  providers: [
    AdvisorService,
    AdvisorCaseFacts,
    AdvisorDrafts,
    AdvisorCaseDigest,
    AdvisorConversations,
    AdvisorProjectNotes,
    AdvisorOpening,
    AdvisorDocumentStaging,
    AdvisorTurn,
    // Each owning module provides the rows of its mask; a new mask with rows adds its source here.
    { provide: DRAFT_RECORDS, inject: [ChildDraftRecords, RentalDraftRecords], useFactory: (...sources: DraftRecordSource[]) => draftRecordRegistry(sources) },
    AdvisorRunService,
    AdvisorModelsService,
    AdvisorModelCatalog,
    { provide: ADVISOR_RUN_LOG, inject: [FIELD_ENCRYPTION_KEYS], useFactory: (keys: FieldEncryptionKeySet) => createAdvisorRunLog(keys) },
    {
      provide: ADVISOR_REPOSITORY,
      useClass: PrismaAdvisorRepository,
    },
  ],
  exports: [AdvisorDocumentStaging, AdvisorDrafts, ADVISOR_REPOSITORY],
})
export class AdvisorModule {}
