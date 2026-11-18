import type { AssessmentDiff, AssessmentLesson } from '@steuereule/core'
import type { AssessmentDiffDto, AssessmentLessonDto } from './dto/assessment-diff.dto.js'

/** The core's diff as the wire carries it: the same fields, arrays copied out of the readonly ones. */
export function toDiffDto(diff: AssessmentDiff): AssessmentDiffDto {
  return {
    year: diff.year,
    filingType: diff.filingType,
    groups: diff.groups.map((g) => ({ group: g.group, rows: g.rows.map((r) => ({ ...r })) })),
    ownDeviations: diff.ownDeviations.map((d) => ({ ...d })),
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
