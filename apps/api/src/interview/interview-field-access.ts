import { QUESTIONS, isValidAnswer, type EntryStepId } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import type { InterviewAnswerRepository } from './interview-answer.repository.js'

export const INTERVIEW_ACCESS_FIELDS: readonly string[] = Object.keys(QUESTIONS)

/** The confirmation path's view of the screen `interview` (ADR-0066): one field per question. */
export function interviewFieldAccess(interview: InterviewAnswerRepository): ScreenAccess {
  return {
    fields: INTERVIEW_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const rows = await interview.findAllForUserAndYear(userId, taxYear)
      return Object.fromEntries(rows.map((r) => [r.questionId, r.value]))
    },
    async write(userId, taxYear, _instance, field, value) {
      // The interview's own endpoint checks every answer; this path did not. One value outside
      // the accepted set (say „angestellt“ for „Angestellt“) made every later read of that
      // user's interview fail (#476). Null and '' take an answer back and stay allowed.
      if (value !== null && value !== '' && !isValidAnswer(field as EntryStepId, value)) {
        throw new InvalidInputError('FIELD_VALUE_INVALID', `"${value}" is not an accepted answer for "${field}".`)
      }
      await interview.write({
        userId,
        taxYear,
        questionId: field,
        value: value ?? '',
        openItems: 0,
      })
      return true
    },
  }
}
