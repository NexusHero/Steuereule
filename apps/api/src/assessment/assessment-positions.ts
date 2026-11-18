import {
  ASSESSMENT_POSITION_IDS,
  assessmentExplanations,
  isValidAssessmentPositionAmount,
  type AssessedReturn,
  type AssessmentPositionId,
  type AssessmentPositionValues,
  type FiledReturn,
} from '@steuereule/core'
import { storedPosition, type AssessmentRecord } from './assessment.repository.js'
import type { FilingVersionRecord } from './filing-version.repository.js'

/** A stored position: a whole-euro amount, „unklar“ (unreadable), or null (not read). Anything else is unreadable. */
export function positionValue(record: AssessmentRecord | null, id: AssessmentPositionId): number | 'unklar' | null {
  const stored = storedPosition(record, id)
  if (stored === null) return null
  const n = Number(stored)
  return stored !== 'unklar' && /^-?\d+$/.test(stored) && isValidAssessmentPositionAmount(id, n) ? n : 'unklar'
}

/** The read amounts of the Bescheid; unread and unreadable positions are absent, never 0. */
export function assessedValuesOf(record: AssessmentRecord | null): AssessmentPositionValues {
  const values: Partial<Record<AssessmentPositionId, number>> = {}
  for (const id of ASSESSMENT_POSITION_IDS) {
    const v = positionValue(record, id)
    if (typeof v === 'number') values[id] = v
  }
  return values
}

/** The right side of the Bescheid-Abgleich (ADR-0098 §8). */
export function assessedReturnOf(record: AssessmentRecord | null): AssessedReturn {
  const positions: Partial<Record<AssessmentPositionId, number | 'not_read'>> = {}
  for (const id of ASSESSMENT_POSITION_IDS) {
    const v = positionValue(record, id)
    if (v !== null) positions[id] = v === 'unklar' ? 'not_read' : v
  }
  return { positions, explanations: assessmentExplanations(record?.explanations ?? null) }
}

/** The left side: the version frozen at submission. */
export function filedReturnOf(version: FilingVersionRecord): FiledReturn {
  return { year: version.taxYear, filingType: version.filingType, positions: version.positions }
}

/** Whether a Bescheid row holds anything read at all — an empty row is no Bescheid. */
export function hasAssessedValues(record: AssessmentRecord | null): boolean {
  return record !== null && ASSESSMENT_POSITION_IDS.some((id) => storedPosition(record, id) !== null)
}
