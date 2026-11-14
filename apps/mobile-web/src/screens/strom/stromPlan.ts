// The order of the Strom (ADR-0089): basis page, the masks of the user's path (documents first),
// the selection, one page per chosen topic, Alleinerziehend where it applies, then the summary.
// Each step has its own address segment (/app/steuerjahr/:year/strom/:step).
import {
  ENTRIES,
  STROM_TOPICS,
  isTopicApplicable,
  isTopicOpen,
  nextStepFor,
  topicPageSteps,
  type Answers,
  type StromTopicId,
} from '@steuereule/core'
import { tileById, visibleTiles, type TileFacts, type TileId } from '../cockpit/tiles'
import type { FunnelPath } from '../funnel/KontoWandScreen'

export type StromMaskId = 'lstb' | 'ch' | 'rente' | 'arbeitsweg' | 'kinder'

export type StromStep =
  | { readonly kind: 'basis' }
  | { readonly kind: 'maske'; readonly id: StromMaskId }
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
    case 'maske':
      return MASK_SLUGS[step.id]
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
  if (slug === 'basis' || slug === 'auswahl' || slug === 'alleinerziehend' || slug === 'fertig') return { kind: slug }
  const mask = (Object.keys(MASK_SLUGS) as StromMaskId[]).find((id) => MASK_SLUGS[id] === slug)
  if (mask !== undefined) return { kind: 'maske', id: mask }
  const topic = (Object.keys(TOPIC_SLUGS) as StromTopicId[]).find((id) => TOPIC_SLUGS[id] === slug)
  return topic === undefined ? null : { kind: 'thema', id: topic }
}

export function sameStep(a: StromStep, b: StromStep): boolean {
  return slugOf(a) === slugOf(b)
}

function isBasisDone(answers: Answers): boolean {
  return nextStepFor(ENTRIES['minimal-gate'], answers).kind === 'done'
}

function shownTiles(facts: TileFacts): ReadonlySet<TileId> {
  return new Set(visibleTiles(facts).map((tile) => tile.id))
}

/**
 * A cross-border commuter who also had a German job in the year (ADR-0079): the way-to-work mask
 * records the change (the first way ends, a second one starts), or a German certificate is already
 * entered. Then the German LStB belongs in the Strom too, right after the way to work.
 */
function hasGermanJobToo(facts: TileFacts): boolean {
  if (facts.path !== 'ch') return false
  const inputs = facts.commute?.inputs
  const changed = inputs != null && (inputs.secondFrom != null || inputs.secondOneWayKm != null || inputs.periodTo != null)
  const lstb = facts.lstb
  const entered = lstb != null && [lstb.bruttoarbeitslohn, lstb.lohnsteuer, lstb.sozialversicherung].some((field) => field.kind === 'erfasst')
  return changed || entered
}

function masksFor(facts: TileFacts): readonly StromMaskId[] {
  const tiles = shownTiles(facts)
  const masks = MASKS[facts.path].filter((id) => tiles.has(id))
  if (!hasGermanJobToo(facts)) return masks
  const at = masks.indexOf('arbeitsweg') + 1
  return [...masks.slice(0, at), 'lstb', ...masks.slice(at)]
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
export function stromSteps(answers: Answers, facts: TileFacts | null): readonly StromStep[] {
  if (!isBasisDone(answers) || facts === null) return [{ kind: 'basis' }]
  const tiles = shownTiles(facts)
  return [
    { kind: 'basis' },
    ...masksFor(facts).map((id) => ({ kind: 'maske', id }) as const),
    { kind: 'auswahl' },
    ...applicableTopics(answers)
      .filter((id) => hasTopicPage(id, answers))
      .map((id) => ({ kind: 'thema', id }) as const),
    ...(tiles.has('alleinerziehend') ? [{ kind: 'alleinerziehend' } as const] : []),
    { kind: 'fertig' },
  ]
}

export function isStepOpen(step: StromStep, answers: Answers, facts: TileFacts): boolean {
  switch (step.kind) {
    case 'basis':
      return !isBasisDone(answers)
    case 'maske':
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

/**
 * Where "Weiter" in the cockpit leads: the first step still open, or the summary once everything is
 * answered. Null while a mask's data is still loading — no step is suggested rather than a wrong one.
 */
export function nextOpenStep(answers: Answers, facts: TileFacts | null): StromStep | null {
  if (!isBasisDone(answers)) return { kind: 'basis' }
  if (facts === null) return null
  for (const step of stromSteps(answers, facts)) {
    if (step.kind === 'maske' && facts.pendingTiles?.has(step.id)) return null
    if (isStepOpen(step, answers, facts)) return step
  }
  return { kind: 'fertig' }
}

/** The step after `current` in this user's Strom; the summary when `current` is no longer part of it. */
export function stepAfter(current: StromStep, answers: Answers, facts: TileFacts | null): StromStep {
  const steps = stromSteps(answers, facts)
  const index = steps.findIndex((s) => sameStep(s, current))
  if (index === -1) return nextOpenStep(answers, facts) ?? { kind: 'fertig' }
  return steps[index + 1] ?? { kind: 'fertig' }
}

/** The step before `current`, or null at the start (back leaves the Strom). */
export function stepBefore(current: StromStep, answers: Answers, facts: TileFacts | null): StromStep | null {
  const steps = stromSteps(answers, facts)
  const index = steps.findIndex((s) => sameStep(s, current))
  return index > 0 ? (steps[index - 1] ?? null) : null
}

/** "Schritt x von y" for the header. */
export function stepPosition(current: StromStep, answers: Answers, facts: TileFacts | null): { readonly index: number; readonly total: number } | null {
  const steps = stromSteps(answers, facts).filter((s) => s.kind !== 'fertig')
  const index = steps.findIndex((s) => sameStep(s, current))
  return index === -1 ? null : { index: index + 1, total: steps.length }
}
