// The Strom (ADR-0089): one selection page — "Was trifft auf dich zu?" — instead of a yes/no page per
// topic, then one page per chosen topic with all its amounts. Nothing new is stored: the selection
// is a view on the catalogue's own yes/no answers, so the owl, the printout and the estimate read
// exactly what they read before.
import {
  ENTRIES,
  GATE_ACKNOWLEDGED,
  AMOUNT_LATER,
  QUESTIONS,
  entryForStep,
  nextStepFor,
  type Answers,
  type CatalogueEntry,
  type EntryQuestionId,
  type EntryStepId,
  type FollowUpTarget,
  type QuestionDeclaration,
} from './interview'

/** The headings of the selection page. */
export type StromGroup = 'arbeit' | 'wohnen' | 'vorsorge' | 'gesundheit' | 'sonstiges'

export type StromTopicId =
  | 'fortbildung'
  | 'dhf'
  | 'umzug'
  | 'lohnersatz'
  | 'nebenjob'
  | 'abfindung'
  | 'haushalt-gate'
  | 'kv-pv'
  | 'riester'
  | 'gesundheit-gate'
  | 'spenden'
  | 'einkuenfte'
  | 'vorauszahlungen-gate'

export interface StromTopic {
  readonly id: StromTopicId
  readonly group: StromGroup
  /** Shown only behind "Mehr anzeigen". */
  readonly rare: boolean
}

/** In the order of the selection page; each id is a top-level question of a catalogue entry. */
export const STROM_TOPICS: readonly StromTopic[] = [
  { id: 'fortbildung', group: 'arbeit', rare: false },
  { id: 'umzug', group: 'arbeit', rare: false },
  { id: 'dhf', group: 'arbeit', rare: false },
  { id: 'nebenjob', group: 'arbeit', rare: false },
  { id: 'lohnersatz', group: 'arbeit', rare: false },
  { id: 'abfindung', group: 'arbeit', rare: true },
  { id: 'haushalt-gate', group: 'wohnen', rare: false },
  { id: 'kv-pv', group: 'vorsorge', rare: false },
  { id: 'riester', group: 'vorsorge', rare: false },
  { id: 'gesundheit-gate', group: 'gesundheit', rare: false },
  { id: 'spenden', group: 'sonstiges', rare: false },
  { id: 'einkuenfte', group: 'sonstiges', rare: true },
  { id: 'vorauszahlungen-gate', group: 'sonstiges', rare: true },
]

const NO = 'Nein'
const YES = 'Ja'

/** The answers of the Strom's own pages, in the order they are sent. */
export interface StromPost {
  readonly questionId: EntryStepId
  readonly value: string
}

/** A topic as a one-question entry, so the catalogue walk runs over just this topic. */
export function topicEntry(id: StromTopicId): CatalogueEntry {
  const owner = entryForStep(id)
  if (owner === undefined) throw new Error(`Strom topic "${id}" belongs to no catalogue entry.`)
  return { id: owner, steps: [id] }
}

/** Training costs are Werbungskosten: only someone who works has them (§ 9 EStG). */
export function isTopicApplicable(id: StromTopicId, answers: Answers): boolean {
  if (id === 'fortbildung') return answers.job === 'Angestellt' || answers.job === 'Beides'
  return true
}

/** The kinds a topic is chosen with when it has no plain Ja (Nebenjob, Einkünfte); null for yes/no topics. */
export function topicKinds(id: StromTopicId): readonly string[] | null {
  const form = QUESTIONS[id].form
  if (form.kind !== 'enum' || form.values.includes(YES)) return null
  return form.values.filter((v) => v !== NO)
}

/** What the selection page starts with: every topic already answered with Ja or a kind. */
export function initialSelection(answers: Answers): Readonly<Partial<Record<StromTopicId, string>>> {
  const selection: Partial<Record<StromTopicId, string>> = {}
  for (const { id } of STROM_TOPICS) {
    const value = answers[id]
    if (value !== undefined && value !== NO) selection[id] = value
  }
  return selection
}

/**
 * The answers the selection page sends: the chosen value for each chosen topic, Nein for every
 * applicable topic left out — only what differs from the stored answers.
 */
export function selectionChanges(
  stored: Answers,
  selection: Readonly<Partial<Record<StromTopicId, string>>>,
  basis: Answers,
): readonly StromPost[] {
  const posts: StromPost[] = []
  for (const entryId of Object.keys(ENTRIES) as (keyof typeof ENTRIES)[]) {
    for (const step of ENTRIES[entryId].steps) {
      const topic = STROM_TOPICS.find((t) => t.id === step)
      if (topic === undefined || !isTopicApplicable(topic.id, basis)) continue
      const value = selection[topic.id] ?? NO
      if (stored[topic.id] !== value) posts.push({ questionId: topic.id, value })
    }
  }
  return posts
}

/** Topics the user leaves out that already hold an answer behind them (Q14: ask before). */
export function deselectedWithAnswers(stored: Answers, selection: Readonly<Partial<Record<StromTopicId, string>>>): readonly StromTopicId[] {
  return STROM_TOPICS.filter(({ id }) => {
    const value = stored[id]
    if (value === undefined || value === NO || selection[id] !== undefined) return false
    return topicPageSteps(id, stored).some((step) => stored[step] !== undefined)
  }).map(({ id }) => id)
}

function targetId(target: FollowUpTarget): EntryStepId {
  return typeof target === 'string' ? target : target.step
}

function branchFor(decl: QuestionDeclaration, answer: string): readonly FollowUpTarget[] {
  const followUps = decl.followUps
  const declared = followUps !== undefined && Object.hasOwn(followUps, answer) ? followUps[answer] : undefined
  return declared ?? decl.defaultFollowUp ?? []
}

/**
 * Every step a one-page form shows, top-down: a question, then (once answered) what follows from
 * its answer; a notice (gate) is shown in place. An unanswered choice does not open its branch yet.
 */
export function pageSteps(entry: CatalogueEntry, answers: Answers): readonly EntryStepId[] {
  const out: EntryStepId[] = []
  const visit = (targets: readonly FollowUpTarget[]): boolean => {
    for (const target of targets) {
      const id = targetId(target)
      out.push(id)
      if (typeof target !== 'string' && target.terminal) return false
      const answer = answers[id] ?? (QUESTIONS[id].kind === 'gate' ? GATE_ACKNOWLEDGED : undefined)
      if (answer !== undefined && !visit(branchFor(QUESTIONS[id], answer))) return false
    }
    return true
  }
  visit(entry.steps)
  return out
}

/** The steps of a topic's own page: everything behind the topic's question, never the question itself. */
export function topicPageSteps(id: StromTopicId, answers: Answers): readonly EntryStepId[] {
  return pageSteps(topicEntry(id), answers).filter((step) => step !== id)
}

/**
 * The answers a one-page form sends, in the order the server admits them (each after the question
 * it follows). Notices are acknowledged on the way. `complete` is false when a shown field is still
 * empty; then nothing is sent, so a half-filled page never leaves half its answers behind.
 */
export function answersToPost(entry: CatalogueEntry, draft: Answers, stored: Answers): { readonly complete: boolean; readonly posts: readonly StromPost[] } {
  const posts: StromPost[] = []
  const plan = (targets: readonly FollowUpTarget[]): 'ok' | 'missing' | 'stop' => {
    for (const target of targets) {
      const id = targetId(target)
      const decl = QUESTIONS[id]
      const value = draft[id] ?? (decl.kind === 'gate' ? GATE_ACKNOWLEDGED : undefined)
      if (value === undefined) return 'missing'
      if (stored[id] !== value) posts.push({ questionId: id, value })
      if (typeof target !== 'string' && target.terminal) return 'stop'
      const result = plan(branchFor(decl, value))
      if (result !== 'ok') return result
    }
    return 'ok'
  }
  const result = plan(entry.steps)
  return result === 'missing' ? { complete: false, posts: [] } : { complete: true, posts }
}

/** A chosen topic whose page still waits for an answer, or holds an amount marked „später“. */
export function isTopicOpen(id: StromTopicId, answers: Answers): boolean {
  if (answers[id] === NO) return false
  if (nextStepFor(topicEntry(id), answers).kind !== 'done') return true
  return topicPageSteps(id, answers).some((step) => answers[step] === AMOUNT_LATER)
}

/** For callers that only know a question id: is it a Strom topic? */
export function isStromTopic(id: EntryQuestionId | string): id is StromTopicId {
  return STROM_TOPICS.some((t) => t.id === id)
}
