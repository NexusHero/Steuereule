import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { INTERVIEW_ANSWER_REPOSITORY } from './interview-answer.repository.js'
import { PrismaInterviewAnswerRepository } from './interview-answer.repository.prisma.js'
import { InterviewController } from './interview.controller.js'
import { InterviewService } from './interview.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [InterviewController],
  providers: [InterviewService, { provide: INTERVIEW_ANSWER_REPOSITORY, useClass: PrismaInterviewAnswerRepository }],
  // Exported for BOTH consumers of the one read path (InterviewAnswer goes through the same
  // field-encryption + integrity-checked seam): the Cockpit (ticket 15) reads the answers for
  // its span, and the CH-Lohnausweis fold (ticket 16) derives Grenzgänger-Status + gated
  // Einkunftsarten (grenzgaengerStand) — neither re-reads raw rows.
  exports: [INTERVIEW_ANSWER_REPOSITORY],
})
export class InterviewModule {}
