import { Inject, Injectable } from '@nestjs/common'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../config/features.js'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
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
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { GuestCannotUseThisEndpointError } from '../common/account-required.error.js'
import type { UserIdKind } from '../auth/user-context.guard.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from './interview-answer.repository.js'
import type { InterviewStateDto } from './dto/interview-state.dto.js'
import type { PostAnswerDto } from './dto/post-answer.dto.js'
import type { PostAnswerResponseDto } from './dto/post-answer-response.dto.js'
import { answersFrom } from './answers.js'

/** QuestionId is not reachable given the answers stored so far. */
export class UnreachableAnswerError extends ConflictError {
  constructor(questionId: string) {
    super('ANSWER_UNREACHABLE', `"${questionId}" is not reachable given the answers already stored for this tax year.`)
  }
}

/** Value is not an accepted answer for questionId. */
export class InvalidAnswerValueError extends InvalidInputError {
  constructor(questionId: string) {
    super('ANSWER_VALUE_INVALID', `"${questionId}" does not accept this value.`)
  }
}

const ADMITTED_ENTRY_IDS: readonly EntryId[] = [
  'minimal-gate',
  'lebenslagen',
  'einkuenfte',
  'sonderausgaben',
  'segment-ch',
  'alleinerziehend',
  'berufsprofil',
  // Prepayments of the year (ADR-0081): the estimate credits them, the form does not ask for them.
  'vorauszahlungen',
]

/** § 35a / § 33 entries: answers are only taken once estimate and printout can use them (ADR-0032). */
const BOOSTER_ENTRY_IDS: readonly EntryId[] = ['haushalt', 'gesundheit']

export function admittedEntryIds(boostersEnabled: boolean): readonly EntryId[] {
  return boostersEnabled ? [...ADMITTED_ENTRY_IDS, ...BOOSTER_ENTRY_IDS] : ADMITTED_ENTRY_IDS
}

const GUEST_ADMITTED_ENTRY_IDS: readonly EntryId[] = ['minimal-gate']

/** Entries one spouse answers for themselves; the user answers them for Person B too (ADR-0088). */
export const PERSONAL_ENTRY_IDS: readonly EntryId[] = ['lebenslagen', 'sonderausgaben']

function assertGuestMayUse(kind: UserIdKind, entryId: EntryId): void {
  if (kind === 'guest' && !GUEST_ADMITTED_ENTRY_IDS.includes(entryId)) {
    throw new GuestCannotUseThisEndpointError()
  }
}

@Injectable()
export class InterviewService {
  /** Tests switch the § 35a / § 33 boosters on; production follows the flag. */
  protected readonly boostersEnabled: boolean = HOUSEHOLD_AND_HEALTH_BOOSTERS

  constructor(
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly repository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getState(userId: string, taxYear: number, entryKey?: string, kind: UserIdKind = 'session'): Promise<InterviewStateDto> {
    const requestedEntry = entryKey ?? 'minimal-gate'
    if (Object.hasOwn(ENTRIES, requestedEntry)) assertGuestMayUse(kind, requestedEntry as EntryId)

    const rows = await this.repository.findAllForUserAndYear(userId, taxYear)
    const answers = answersFrom(rows)

    if (rows.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'interview' })
    }

    const entryId = entryKey ?? 'minimal-gate'
    if (!Object.hasOwn(ENTRIES, entryId)) {
      throw new InvalidInputError('CATALOGUE_ENTRY_UNKNOWN', `"${entryKey}" is not a known catalogue entry.`)
    }
    const entry = ENTRIES[entryId as EntryId]
    return {
      answers: answers as Record<string, string>,
      nextStep: nextStepFor(entry, answers),
      openItems: remainingStepsFor(entry, answers),
    }
  }

  async postAnswer(userId: string, taxYear: number, dto: PostAnswerDto, kind: UserIdKind = 'session', personalOnly = false): Promise<PostAnswerResponseDto> {
    const rows = await this.repository.findAllForUserAndYear(userId, taxYear)
    const answers = answersFrom(rows)
    const entryId = entryForStep(dto.questionId as never)
    if (entryId === undefined || !admittedEntryIds(this.boostersEnabled).includes(entryId) || (personalOnly && !PERSONAL_ENTRY_IDS.includes(entryId))) {
      throw new UnreachableAnswerError(dto.questionId)
    }
    assertGuestMayUse(kind, entryId)

    const entry = ENTRIES[entryId]
    if (!isReachableFor(entry, answers, dto.questionId as never)) throw new UnreachableAnswerError(dto.questionId)
    if (!isValidAnswer(dto.questionId as never, dto.value)) throw new InvalidAnswerValueError(dto.questionId)

    const updatedAnswers: Answers = { ...answers, [dto.questionId]: dto.value }
    const openItems = remainingSteps(updatedAnswers)

    await this.repository.write({
      userId,
      taxYear,
      questionId: dto.questionId,
      value: dto.value,
      openItems,
    })

    return { nextStep: nextStepFor(entry, updatedAnswers), openItems: remainingStepsFor(entry, updatedAnswers) }
  }
}
