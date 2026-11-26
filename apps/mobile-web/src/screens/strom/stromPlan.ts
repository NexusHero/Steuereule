// The order of the Strom (ADR-0089): basis page, the masks of the user's path (documents first),
// the selection, one page per chosen topic, Alleinerziehend where it applies, then the summary.
// Each step has its own address segment (/app/steuerjahr/:year/strom/:step).
import {
  ENTRIES,
  STROM_TOPICS,
  isTopicApplicable,
  isTopicOpen,
  nextStepFor,
  type InterviewOptions,
  topicPageSteps,
  type Answers,
  type StromTopicId,
} from '@steuereule/core'
import { GERMAN_JOB_TOO } from '@steuereule/core'
import { crossBorderWithGermanJob, hasGermanJobToo, tileById, visibleTiles, type PartnerFacts, type TileFacts, type TileId } from '../cockpit/tiles'
import type { FunnelPath } from '../funnel/KontoWandScreen'

export type StromMaskId = 'lstb' | 'ch' | 'rente' | 'arbeitsweg' | 'kinder'

export type StromStep =
  | { readonly kind: 'basis' }
  /** Person B's name and birth date, so the masks after it can be recorded for B (joint return). */
  | { readonly kind: 'partner' }
  /** A mask; `person: 'B'` records it for Person B of a joint return. */
  | { readonly kind: 'maske'; readonly id: StromMaskId; readonly person?: 'B' }
  | { readonly kind: 'auswahl' }
  | { readonly kind: 'thema'; readonly id: StromTopicId }
  | { readonly kind: 'alleinerziehend' }
  | { readonly kind: 'fertig' }

/** Documents first: the path's own certificate, then the way to work, then the children. */
const MASKS: Readonly<Record<FunnelPath, readonly StromMaskId[]>> = {
  angestellte: ['lstb', 'arbeitsweg', 'kinder'],
  ch: ['ch', 'arbeitsweg', 'kinder'],
  rente: ['rente', 'kinder'],
}

const TOPIC_SLUGS: Readonly<Record<StromTopicId, string>> = {
  fortbildung: 'fortbildung',
  umzug: 'umzug',
  dhf: 'doppelte-haushaltsfuehrung',
  nebenjob: 'nebenjob',
  lohnersatz: 'lohnersatz',
  abfindung: 'abfindung',
  'haushalt-gate': 'haushalt',
  'kv-pv': 'krankenversicherung',
  riester: 'riester',
  altersvorsorge: 'altersvorsorge',
  versicherungen: 'versicherungen',
  'gesundheit-gate': 'krankheitskosten',
  spenden: 'spenden',
  einkuenfte: 'einkuenfte',
  'vorauszahlungen-gate': 'vorauszahlungen',
}

const MASK_SLUGS: Readonly<Record<StromMaskId, string>> = {
  lstb: 'lohnsteuerbescheinigung',
  ch: 'schweiz',
  rente: 'rente',
  arbeitsweg: 'arbeitsweg',
  kinder: 'kinder',
}

export function slugOf(step: StromStep): string {
  switch (step.kind) {
    case 'basis':
      return 'basis'
    case 'partner':
      return 'partner'
    case 'maske':
      return step.person === 'B' ? `partner-${MASK_SLUGS[step.id]}` : MASK_SLUGS[step.id]
    case 'auswahl':
      return 'auswahl'
    case 'thema':
      return TOPIC_SLUGS[step.id]
    case 'alleinerziehend':
      return 'alleinerziehend'
    case 'fertig':
      return 'fertig'
  }
}

export function stepFromSlug(slug: string | undefined): StromStep | null {
  if (slug === 'basis' || slug === 'partner' || slug === 'auswahl' || slug === 'alleinerziehend' || slug === 'fertig') return { kind: slug }
  if (slug?.startsWith('partner-')) {
    const own = slug.slice('partner-'.length)
    const id = (Object.keys(MASK_SLUGS) as StromMaskId[]).find((mask) => MASK_SLUGS[mask] === own && mask !== 'kinder')
    return id === undefined ? null : { kind: 'maske', id, person: 'B' }
  }
  const mask = (Object.keys(MASK_SLUGS) as StromMaskId[]).find((id) => MASK_SLUGS[id] === slug)
  if (mask !== undefined) return { kind: 'maske', id: mask }
  const topic = (Object.keys(TOPIC_SLUGS) as StromTopicId[]).find((id) => TOPIC_SLUGS[id] === slug)
  return topic === undefined ? null : { kind: 'thema', id: topic }
}

export function sameStep(a: StromStep, b: StromStep): boolean {
  return slugOf(a) === slugOf(b)
}

function isBasisDone(answers: Answers, options: InterviewOptions = {}): boolean {
  return nextStepFor(ENTRIES['minimal-gate'], answers, options).kind === 'done'
}

function shownTiles(facts: TileFacts): ReadonlySet<TileId> {
  return new Set(visibleTiles(facts).map((tile) => tile.id))
}

function masksFor(facts: TileFacts): readonly StromMaskId[] {
  const tiles = shownTiles(facts)
  const masks = MASKS[facts.path].filter((id) => tiles.has(id))
  if (!crossBorderWithGermanJob(facts)) return masks
  const at = masks.indexOf('arbeitsweg') + 1
  return [...masks.slice(0, at), 'lstb', ...masks.slice(at)]
}

/** Person B of a joint return who is recorded in this account (no account of their own). */
function jointPartner(answers: Answers, facts: TileFacts): PartnerFacts | null {
  const partner = facts.partner
  return answers.familienstand === 'Verheiratet' && partner != null && partner.joint ? partner : null
}

/**
 * Person B's masks, in the order of A's (ADR-0088): what the basis says B does decides them. A Grenzgänger
 * B gets the Swiss certificate and the way to work, plus the German certificate when B also worked in
 * Germany; an employee in Germany the LStB and the way to work; a pensioner the pension.
 */
function partnerMasks(answers: Answers, partner: PartnerFacts): readonly StromMaskId[] {
  const job = answers['partner-job']
  if (job === 'Rente') return ['rente']
  if (job !== 'Angestellt') return []
  if (answers['partner-ausland'] !== 'Ja, in die Schweiz') return ['lstb', 'arbeitsweg']
  const german = answers['partner-de-job'] === GERMAN_JOB_TOO || hasGermanJobToo(partner.commute, partner.lstb)
  return german ? ['ch', 'arbeitsweg', 'lstb'] : ['ch', 'arbeitsweg']
}

/** The partner's data as the facts a tile's status reads. */
function partnerTileFacts(partner: PartnerFacts, answers: Answers): TileFacts {
  return { path: 'angestellte', answers, lstb: partner.lstb, ch: partner.ch, pension: partner.pension, commute: partner.commute }
}

function isPartnerNamed(partner: PartnerFacts): boolean {
  return (partner.name ?? '').trim() !== '' && partner.birthDate !== null
}

/** The topics on this user's selection page. */
export function applicableTopics(answers: Answers): readonly StromTopicId[] {
  return STROM_TOPICS.filter((topic) => isTopicApplicable(topic.id, answers)).map((topic) => topic.id)
}

/** A chosen topic with something left to ask on its own page. */
function hasTopicPage(id: StromTopicId, answers: Answers): boolean {
  const value = answers[id]
  return value !== undefined && value !== 'Nein' && topicPageSteps(id, answers).length > 0
}

/**
 * Every step of this user's Strom, in order. Without `facts` (the basis is not answered yet, or the
 * cockpit's data is still loading) the Strom is just its basis page.
 */
export function stromSteps(answers: Answers, facts: TileFacts | null, options: InterviewOptions = {}): readonly StromStep[] {
  if (!isBasisDone(answers, options) || facts === null) return [{ kind: 'basis' }]
  const tiles = shownTiles(facts)
  const partner = jointPartner(answers, facts)
  const own = masksFor(facts)
  const beforeChildren = own.filter((id) => id !== 'kinder')
  const bMasks = partner === null ? [] : partnerMasks(answers, partner)
  return [
    { kind: 'basis' },
    // B is named first, so every mask after it can say whose it is (Echtdatentest 18.11.2026).
    ...(partner !== null && bMasks.length > 0 ? [{ kind: 'partner' } as const] : []),
    ...beforeChildren.map((id) => ({ kind: 'maske', id }) as const),
    ...bMasks.map((id) => ({ kind: 'maske', id, person: 'B' }) as const),
    ...(own.includes('kinder') ? [{ kind: 'maske', id: 'kinder' } as const] : []),
    { kind: 'auswahl' },
    ...applicableTopics(answers)
      .filter((id) => hasTopicPage(id, answers))
      .map((id) => ({ kind: 'thema', id }) as const),
    ...(tiles.has('alleinerziehend') ? [{ kind: 'alleinerziehend' } as const] : []),
    { kind: 'fertig' },
  ]
}

export function isStepOpen(step: StromStep, answers: Answers, facts: TileFacts, options: InterviewOptions = {}): boolean {
  switch (step.kind) {
    case 'basis':
      return !isBasisDone(answers, options)
    case 'partner':
      return facts.partner == null || !isPartnerNamed(facts.partner)
    case 'maske':
      if (step.person === 'B') return facts.partner == null || tileById(step.id).status(partnerTileFacts(facts.partner, answers)) !== 'erledigt'
      return tileById(step.id).status(facts) !== 'erledigt'
    case 'auswahl':
      return applicableTopics(answers).some((id) => answers[id] === undefined)
    case 'thema':
      return isTopicOpen(step.id, answers)
    case 'alleinerziehend':
      return nextStepFor(ENTRIES.alleinerziehend, answers).kind !== 'done'
    case 'fertig':
      return false
  }
}

/** A step whose data is still loading: neither its status nor the count can be told yet. */
function isStepPending(step: StromStep, facts: TileFacts): boolean {
  if (step.kind === 'partner') return facts.partner?.pending === true
  if (step.kind !== 'maske') return false
  return step.person === 'B' ? facts.partner?.pending === true : facts.pendingTiles?.has(step.id) === true
}

/**
 * Where "Weiter" in the cockpit leads: the first step still open, or the summary once everything is
 * answered. Null while a mask's data is still loading — no step is suggested rather than a wrong one.
 */
export function nextOpenStep(answers: Answers, facts: TileFacts | null, options: InterviewOptions = {}): StromStep | null {
  if (!isBasisDone(answers, options)) return { kind: 'basis' }
  if (facts === null) return null
  for (const step of stromSteps(answers, facts, options)) {
    if (isStepPending(step, facts)) return null
    if (isStepOpen(step, answers, facts, options)) return step
  }
  return { kind: 'fertig' }
}

/**
 * How far the user is: the steps of their Strom that are answered, out of all of them (the summary is
 * no step of its own). Null while a mask's data is still loading — no count rather than a wrong one.
 */
export function stromProgress(answers: Answers, facts: TileFacts | null, options: InterviewOptions = {}): { readonly done: number; readonly total: number } | null {
  if (facts === null || !isBasisDone(answers, options)) return null
  const steps = stromSteps(answers, facts, options).filter((s) => s.kind !== 'fertig')
  if (steps.some((s) => isStepPending(s, facts))) return null
  return { done: steps.filter((s) => !isStepOpen(s, answers, facts, options)).length, total: steps.length }
}

/** The step after `current` in this user's Strom; the summary when `current` is no longer part of it. */
export function stepAfter(current: StromStep, answers: Answers, facts: TileFacts | null, options: InterviewOptions = {}): StromStep {
  const steps = stromSteps(answers, facts, options)
  const index = steps.findIndex((s) => sameStep(s, current))
  if (index === -1) return nextOpenStep(answers, facts, options) ?? { kind: 'fertig' }
  return steps[index + 1] ?? { kind: 'fertig' }
}

/** The step before `current`, or null at the start (back leaves the Strom). */
export function stepBefore(current: StromStep, answers: Answers, facts: TileFacts | null, options: InterviewOptions = {}): StromStep | null {
  const steps = stromSteps(answers, facts, options)
  const index = steps.findIndex((s) => sameStep(s, current))
  return index > 0 ? (steps[index - 1] ?? null) : null
}

/** "Schritt x von y" for the header. */
export function stepPosition(current: StromStep, answers: Answers, facts: TileFacts | null, options: InterviewOptions = {}): { readonly index: number; readonly total: number } | null {
  const steps = stromSteps(answers, facts, options).filter((s) => s.kind !== 'fertig')
  const index = steps.findIndex((s) => sameStep(s, current))
  return index === -1 ? null : { index: index + 1, total: steps.length }
}
