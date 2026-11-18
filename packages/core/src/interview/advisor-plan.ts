// The owl's plan across answers. A model that drafts a few points of a long message and promises the
// rest "im nächsten Schritt" may forget them in the next answer; the app keeps the last plan with the
// answer, shows its open steps to the model next turn and names them to the user, so no point is
// dropped silently, whichever model answers.
import { ADVISOR_PLAN_MAX_STEPS, ADVISOR_PLAN_STEP_STATUSES, type AdvisorPlanStep } from './ki-port'

/**
 * What an answer's meta carries of the plan: the last `plan_steps` list of its turn, or the earlier
 * plan carried on while it still had open steps. Kept apart from `AdvisorMessageMeta` and read back
 * through `planOfMeta`, so stored rows of any age are checked before they are trusted.
 */
export interface AdvisorPlanMeta {
  readonly plan?: readonly AdvisorPlanStep[] | undefined
}

const STATUSES: ReadonlySet<string> = new Set(ADVISOR_PLAN_STEP_STATUSES)

function isPlanStep(value: unknown): value is AdvisorPlanStep {
  if (typeof value !== 'object' || value === null) return false
  const { text, status } = value as { text?: unknown; status?: unknown }
  return typeof text === 'string' && text.trim().length > 0 && typeof status === 'string' && STATUSES.has(status)
}

/** The plan stored with one answer, or null when there is none or its shape is not one the app wrote. */
export function planOfMeta(meta: object | null | undefined): readonly AdvisorPlanStep[] | null {
  const plan: unknown = meta ? (meta as { plan?: unknown }).plan : undefined
  if (!Array.isArray(plan) || plan.length === 0 || plan.length > ADVISOR_PLAN_MAX_STEPS) return null
  return plan.every(isPlanStep) ? plan.map((step) => ({ text: step.text, status: step.status })) : null
}

/** The newest plan of a conversation: an answer that did not update the plan does not end it. */
export function latestPlan(records: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly meta: object | null }>): readonly AdvisorPlanStep[] | null {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i]!
    if (record.role !== 'assistant') continue
    const plan = planOfMeta(record.meta)
    if (plan) return plan
  }
  return null
}

/** The steps not done yet; a running step is still open for the user. */
export function openPlanSteps(plan: readonly AdvisorPlanStep[] | null | undefined): AdvisorPlanStep[] {
  return (plan ?? []).filter((step) => step.status !== 'erledigt')
}

/**
 * The plan to keep with this answer: the model's own when it made one this turn, else the earlier
 * plan while it still has open steps. A finished earlier plan is not copied forward.
 */
export function carriedPlan(turnPlan: readonly AdvisorPlanStep[] | null, previousPlan: readonly AdvisorPlanStep[] | null): readonly AdvisorPlanStep[] | null {
  if (turnPlan && turnPlan.length > 0) return turnPlan
  return openPlanSteps(previousPlan).length > 0 ? previousPlan : null
}

// Verbs every step uses; they say nothing about which point a sentence is about.
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'erfassen', 'eintragen', 'nachtragen', 'ergänzen', 'prüfen', 'klären', 'anlegen', 'vorbereiten', 'übernehmen',
  'erfassung', 'prüfung', 'klärung', 'entwurf', 'entwürfe', 'angeben', 'berechnen', 'rechnen',
])

function normalized(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Whether the answer already names a step in its own words: every telling word of the step occurs,
 * compared by its stem so „Spenden“ and „Spende“ count alike.
 */
function mentions(reply: string, step: AdvisorPlanStep): boolean {
  const text = normalized(step.text)
  const words = text.split(' ').filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word))
  if (words.length === 0) return reply.includes(text)
  return words.every((word) => reply.includes(word.slice(0, Math.max(5, word.length - 2))))
}

/**
 * The line the app adds under an answer whose plan still has open steps, unless the answer already
 * names them all. All open steps are listed, so the line never reads as if fewer were left.
 */
export function openPlanNote(plan: readonly AdvisorPlanStep[] | null | undefined, replyText: string): string {
  const open = openPlanSteps(plan)
  if (open.length === 0) return ''
  const reply = normalized(replyText)
  if (open.every((step) => mentions(reply, step))) return ''
  return `\n\nNoch offen: ${open.map((step) => withoutClosingPunctuation(step.text.trim())).join(', ')}.`
}

/** The step without its closing „.“, „!“ or „?“; a loop, since `/[.!?]+$/` backtracks on long input. */
function withoutClosingPunctuation(text: string): string {
  let end = text.length
  while (end > 0 && '.!?'.includes(text[end - 1]!)) end -= 1
  return text.slice(0, end)
}
