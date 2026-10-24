// Application logic for the interview catalogue (#318 REQ-015 Minimal-Gate; R2 — the on-demand
// catalogue entries: Segment 2 + Lebenslagen + Sonderausgaben, ticket 08). userId+steuerjahr-scoped
// read/write, then the graph -> response mapping. Trusts that `userId` was produced by
// UserContextGuard + @RequiresAccount() (never accepts it from a param/body) — mirrors
// ProfileService/CockpitService's shape.
//
// The ONLY graph consulted here is @steuereule/core's (ADR-0033) — entryForStep/isReachableFor/
// isValidAnswer/nextStepFor/remainingStepsFor are imported, never reimplemented. This is what makes
// admission a real, server-side control (#318 P2) rather than the ADR-0021 defect class. R2 derives
// the owning catalogue entry from a bare questionId (entryForStep, D3 in interview.ts) instead of
// trusting a client-supplied scope — so a Lebenslagen write, a segment-ch write and a Minimal-Gate
// write are admitted by the SAME engine, differing only in which entry the id belongs to.
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import {
  ENTRIES,
  entryForStep,
  isReachableFor,
  isValidAnswer,
  nextStepFor,
  remainingSteps,
  remainingStepsFor,
  type Answers,
  type EntryId,
  type EntryStepId,
} from '@steuereule/core'
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

  async getState(userId: string, steuerjahr: number, eintrag?: string): Promise<InterviewStateDto> {
    const rows = await this.repository.findAllForUserAndYear(userId, steuerjahr)
    const answers = toAnswers(rows)

    // Only log an access when there's actually something to access (REQ-004.2's
    // pattern, mirrored from ProfileService.getProfile) — a GET on a fresh tax year
    // with nothing answered yet appends no READ entry.
    if (rows.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'interview' })
    }

    // R2 — `eintrag` names the catalogue entry to re-enter; absent → the Minimal-Gate. `Object.hasOwn`
    // guards against both an unknown id AND an inherited `Object.prototype` key (`constructor`, …),
    // the same fix as interview.ts's `branchFor`/`isValidAnswer` (F9/F11). An unknown id is a 400.
    const entryId = eintrag ?? 'minimal-gate'
    if (!Object.hasOwn(ENTRIES, entryId)) {
      throw new BadRequestException(`"${eintrag}" is not a known catalogue entry.`)
    }
    const entry = ENTRIES[entryId as EntryId]

    return {
      answers: answers as Record<string, string>,
      nextStep: nextStepFor(entry, answers),
      openItems: remainingStepsFor(entry, answers),
    }
  }

  async postAnswer(userId: string, steuerjahr: number, dto: PostAnswerDto): Promise<PostAnswerResponseDto> {
    const rows = await this.repository.findAllForUserAndYear(userId, steuerjahr)
    const answers = toAnswers(rows)
    // R2 — derive the owning entry from the bare questionId (D3) rather than trusting a
    // client-supplied scope; an unrecognized id falls out as a regular 409 with no separate
    // id-whitelist needed (see PostAnswerDto). Minimal-Gate ids keep their #318 behaviour exactly
    // — isReachableFor(ENTRIES['minimal-gate'], …) is the same admission isReachable() did before.
    const entryId = entryForStep(dto.questionId as never)
    if (entryId === undefined) throw new UnreachableAnswerError(dto.questionId)

    const entry = ENTRIES[entryId]
    if (!isReachableFor(entry, answers, dto.questionId as never)) throw new UnreachableAnswerError(dto.questionId)
    if (!isValidAnswer(dto.questionId as never, dto.value)) throw new InvalidAnswerValueError(dto.questionId)

    const updatedAnswers: Answers = { ...answers, [dto.questionId]: dto.value }
    // TaxYear.openItems stays the Minimal-Gate's own count (unchanged from #318, so REQ-015's
    // vertical P6 stays green); the ENTRY-scoped count is what this response reports, so a
    // catalogue screen can show its own progress without perturbing the Cockpit's Minimal-Gate
    // number. Folding every entry's count into one openItems figure is a follow-up (product call:
    // which on-demand entries count as "open" before the user has opened them).
    const openItems = remainingSteps(updatedAnswers)

    await this.repository.write({
      userId,
      steuerjahr,
      questionId: dto.questionId,
      value: dto.value,
      openItems,
    })

    return { nextStep: nextStepFor(entry, updatedAnswers), openItems: remainingStepsFor(entry, updatedAnswers) }
  }
}
