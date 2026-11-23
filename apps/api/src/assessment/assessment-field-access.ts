import {
  ASSESSMENT_FIELD_IDS,
  ASSESSMENT_NEW_POSITION_IDS,
  ISO_DATE_PATTERN,
  isAssessmentPositionId,
  isValidAssessmentAmount,
  isValidAssessmentPositionAmount,
  type AssessmentField,
} from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import type { AssessmentRepository } from './assessment.repository.js'

/** The five figures, the Besteuerungsgrundlagen beyond them, the date and the Erläuterungen (ADR-0098 §8). */
export const ASSESSMENT_ACCESS_FIELDS = [...ASSESSMENT_FIELD_IDS, ...ASSESSMENT_NEW_POSITION_IDS, 'assessmentDate', 'erlaeuterungen'] as const
const MAX_EXPLANATIONS_LENGTH = 4_000
const INTEGER_RE = /^-?\d+$/

/** A figure of the Bescheid as it is stored: whole euros within the field's range. `null` and „unklar“ pass as they are. */
function storedAmount(field: string, value: string | null): string | null {
  if (value === null || value === 'unklar') return value
  const trimmed = value.trim()
  if (!INTEGER_RE.test(trimmed)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" requires a whole-euro integer or "unklar".`)
  }
  const n = Number(trimmed)
  const original = (ASSESSMENT_FIELD_IDS as readonly string[]).includes(field)
  const valid = original ? isValidAssessmentAmount(field as AssessmentField, n) : isAssessmentPositionId(field) && isValidAssessmentPositionAmount(field, n)
  if (!valid) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" value "${value}" is out of allowed range.`)
  }
  return String(n)
}

/** The confirmation path's view of the screen `assessment` (ADR-0066, ADR-0098): the Bescheid of a year. */
export function assessmentFieldAccess(assessment: AssessmentRepository): ScreenAccess {
  // Any Bescheid value taken over, from whichever entry point, may be the first of an Eckjahr (ADR-0098 §4).
  const written = async (userId: string, taxYear: number, value: string | null) => {
    if (value !== null) await assessment.recordExternalYear(userId, taxYear)
    return true
  }
  return {
    fields: ASSESSMENT_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const r = await assessment.findForUserAndYear(userId, taxYear)
      return {
        einnahmen: r?.fields.einnahmen ?? null,
        vorsorgeaufwand: r?.fields.vorsorgeaufwand ?? null,
        anrechnung: r?.fields.anrechnung ?? null,
        festgesetzteSteuer: r?.fields.festgesetzteSteuer ?? null,
        erstattung: r?.fields.erstattung ?? null,
        ...Object.fromEntries(ASSESSMENT_NEW_POSITION_IDS.map((id) => [id, r?.positions?.[id] ?? null])),
        assessmentDate: r?.assessmentDate ?? null,
        erlaeuterungen: r?.explanations ?? null,
      }
    },
    async write(userId, taxYear, _instance, field, value) {
      if (field === 'assessmentDate') {
        if (value !== null && !ISO_DATE_PATTERN.test(value)) {
          throw new InvalidInputError('BESCHEIDDATUM_INVALID', 'assessmentDate must be an ISO yyyy-mm-dd date.')
        }
        await assessment.setDate(userId, taxYear, value)
        return written(userId, taxYear, value)
      }
      if (field === 'erlaeuterungen') {
        const text = value === null ? null : value.trim()
        if (text !== null && text.length > MAX_EXPLANATIONS_LENGTH) {
          throw new InvalidInputError('FIELD_VALUE_INVALID', `"erlaeuterungen" must be at most ${MAX_EXPLANATIONS_LENGTH} characters.`)
        }
        await assessment.setExplanations(userId, taxYear, text === '' ? null : text)
        return written(userId, taxYear, text === '' ? null : text)
      }
      if ((ASSESSMENT_FIELD_IDS as readonly string[]).includes(field) || isAssessmentPositionId(field)) {
        const stored = storedAmount(field, value)
        await assessment.setField(userId, taxYear, field as AssessmentField, stored)
        return written(userId, taxYear, stored)
      }
      return false
    },
  }
}
