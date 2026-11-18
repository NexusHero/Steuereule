import { shortAssessmentReason, type AssessmentDiff, type AssessmentDiffRow, type AssessmentLesson } from '@steuereule/core'
import type { AssessmentDiffDto, AssessmentLessonDto } from './dto/assessment-diff.dto.js'

/** A row with the receipt's short reason, derived from the Finanzamt's explanation in the core. */
function withShortReason<R extends AssessmentDiffRow>(row: R): R & { shortReason: string | null } {
  return { ...row, shortReason: shortAssessmentReason(row.position, row.explanation, row.declared, row.assessed) }
}

/** The core's diff as the wire carries it: the same fields, arrays copied out of the readonly ones, each row with its short reason. */
export function toDiffDto(diff: AssessmentDiff): AssessmentDiffDto {
  return {
    year: diff.year,
    filingType: diff.filingType,
    groups: diff.groups.map((g) => ({ group: g.group, rows: g.rows.map(withShortReason) })),
    ownDeviations: diff.ownDeviations.map(withShortReason),
    followOnChain: diff.followOnChain.map((l) => ({ ...l })),
    totalRefundEffect: diff.totalRefundEffect,
    singleEffectsSum: diff.singleEffectsSum,
    effectsDifferFromTotal: diff.effectsDifferFromTotal,
    generalExplanations: [...diff.generalExplanations],
    counts: { ...diff.counts },
  }
}

export function toLessonDto(lesson: AssessmentLesson): AssessmentLessonDto {
  return {
    ...lesson,
    recognised: { ...lesson.recognised },
    nextYear: lesson.nextYear === null ? null : { ...lesson.nextYear },
    mask: lesson.mask === null ? null : { ...lesson.mask },
  }
}
