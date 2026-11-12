/**
 * Skills of the owl (#495): a way of working the user switches on for the conversation. They ship
 * with the app, the user only turns them on and off. A skill changes how the owl asks and answers;
 * it never widens what she may write (Zero-Write stays, ADR-0038).
 */
export const ADVISOR_SKILL_IDS = ['berater-interview'] as const
export type AdvisorSkillId = (typeof ADVISOR_SKILL_IDS)[number]

export function isAdvisorSkillId(value: unknown): value is AdvisorSkillId {
  return typeof value === 'string' && (ADVISOR_SKILL_IDS as readonly string[]).includes(value)
}

/** One round of the interview: a few questions, each with answers to tap. */
export interface AdvisorQuestionRound {
  readonly questions: readonly AdvisorRoundQuestion[]
}

export interface AdvisorRoundQuestion {
  readonly text: string
  /** Two to four answers to tap; the user can always write their own instead. */
  readonly options: readonly string[]
  /** The owl's own pick, one of `options`. */
  readonly recommended?: string | undefined
}

export const ADVISOR_ROUND_MAX_QUESTIONS = 4
export const ADVISOR_ROUND_MAX_OPTIONS = 4
