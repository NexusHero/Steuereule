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
  // Exported so the CH-Lohnausweis fold (ticket 16) can read the stored answers it derives the
  // Grenzgänger-Status and the gated Einkunftsarten from (grenzgaengerStand) without re-reading
  // raw rows — the interview repository stays the one read path for InterviewAnswer.
  exports: [INTERVIEW_ANSWER_REPOSITORY],
})
export class InterviewModule {}
