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

/** What the user types in the chat to switch a skill on: `/grill-me`, as in other assistants. */
export const ADVISOR_SKILL_COMMANDS: Readonly<Record<string, AdvisorSkillId>> = { 'grill-me': 'berater-interview' }

export type SkillCommand =
  | { readonly kind: 'skill'; readonly command: string; readonly skill: AdvisorSkillId; /** What followed the command, to be sent as the first message. */ readonly rest: string }
  | { readonly kind: 'unknown'; readonly command: string }

/** Reads a message that starts with a slash command; null for an ordinary message. */
export function parseSkillCommand(text: string): SkillCommand | null {
  const match = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!match) return null
  const command = match[1]!.toLowerCase()
  const skill = Object.hasOwn(ADVISOR_SKILL_COMMANDS, command) ? ADVISOR_SKILL_COMMANDS[command] : undefined
  return skill ? { kind: 'skill', command, skill, rest: (match[2] ?? '').trim() } : { kind: 'unknown', command }
}

/** The commands that start with what the user has typed so far (`/gr` → grill-me). */
export function matchingSkillCommands(typed: string): readonly string[] {
  const match = /^\/([a-z0-9-]*)$/i.exec(typed)
  if (!match) return []
  return Object.keys(ADVISOR_SKILL_COMMANDS).filter((command) => command.startsWith(match[1]!.toLowerCase()))
}
