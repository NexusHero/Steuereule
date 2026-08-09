// Application logic for the Minimal-Gate (#318, REQ-015): userId+steuerjahr-scoped
// read/write, then the graph -> response mapping. Trusts that `userId` was produced
// by UserContextGuard + @RequiresAccount() (never accepts it from a param/body) —
// mirrors ProfileService/CockpitService's shape.
//
// The ONLY graph consulted here is @steuereule/core's (ADR-0033) — nextStep(),
// isReachable(), isValidAnswer(), remainingSteps() are imported, never reimplemented.
// This is what makes admission a real, server-side control (#318 P2) rather than the
// ADR-0021 defect class ("a mechanism that appears to control behaviour and does not").
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { isReachable, isValidAnswer, nextStep, remainingSteps, type Answers, type StepId } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from './interview-answer.repository.js'
import type { InterviewStateDto } from './dto/interview-state.dto.js'
import type { PostAnswerDto } from './dto/post-answer.dto.js'
import type { PostAnswerResponseDto } from './dto/post-answer-response.dto.js'

/** #318 P2 — questionId is not reachable given the answers stored so far. */
export class UnreachableAnswerError extends ConflictException {
  constructor(questionId: string) {
    super(`"${questionId}" is not reachable given the answers already stored for this tax year.`)
  }
}

/** #318 P2 — value is not an accepted answer for questionId (or questionId itself is unknown). */
export class InvalidAnswerValueError extends BadRequestException {
  constructor(questionId: string) {
    super(`"${questionId}" does not accept this value.`)
  }
}

function toAnswers(rows: InterviewAnswerRecord[]): Answers {
  const answers: Record<string, string> = {}
  for (const row of rows) answers[row.questionId] = row.value
  return answers as Answers
}

@Injectable()
export class InterviewService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly repository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getState(userId: string, steuerjahr: number): Promise<InterviewStateDto> {
    const rows = await this.repository.findAllForUserAndYear(userId, steuerjahr)
    const answers = toAnswers(rows)

    // Only log an access when there's actually something to access (REQ-004.2's
    // pattern, mirrored from ProfileService.getProfile) — a GET on a fresh tax year
    // with nothing answered yet appends no READ entry.
    if (rows.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'interview' })
    }

    return {
      answers: answers as Record<string, string>,
      nextStep: nextStep(answers),
      openItems: remainingSteps(answers),
    }
  }

  async postAnswer(userId: string, steuerjahr: number, dto: PostAnswerDto): Promise<PostAnswerResponseDto> {
    const rows = await this.repository.findAllForUserAndYear(userId, steuerjahr)
    const answers = toAnswers(rows)
    // Safe cast: isReachable/isValidAnswer are total over `string` — any id outside
    // the graph's own StepId union is simply never reachable (see interview.ts's own
    // "smuggled answer" handling), so an unrecognized questionId falls out as a
    // regular 409, with no separate id-whitelist needed here (see PostAnswerDto).
    const questionId = dto.questionId as StepId

    if (!isReachable(answers, questionId)) throw new UnreachableAnswerError(dto.questionId)
    if (!isValidAnswer(questionId, dto.value)) throw new InvalidAnswerValueError(dto.questionId)

    const updatedAnswers: Answers = { ...answers, [questionId]: dto.value }
    const openItems = remainingSteps(updatedAnswers)

    await this.repository.write({
      userId,
      steuerjahr,
      questionId: dto.questionId,
      value: dto.value,
      openItems,
    })

    return { nextStep: nextStep(updatedAnswers), openItems }
  }
}
