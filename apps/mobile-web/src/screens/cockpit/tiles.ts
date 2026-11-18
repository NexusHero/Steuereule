import {
  ENTRIES,
  GERMAN_JOB_TOO,
  entryForStep,
  laterAmountSteps,
  nextStepFor,
  wageTaxCertificateStatus,
  type Answers,
  type Conflict,
  type EntryStepId,
  type Notice,
  type WageTaxCertificateFieldState,
} from '@steuereule/core'
import type {
  ChSalaryCertificateResponseDto,
  ChildrenResponseDto,
  CommuteResponseDto,
  KapitalResponseDto,
  LstbFieldDto,
  LstbResponseDto,
  MasterDataResponseDto,
  PensionResponseDto,
  RentalResponseDto,
} from '@steuereule/api-client'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../../config/features'
import type { CatalogEntryParam } from '../../navigation/routes'
import type { FunnelPath } from '../funnel/KontoWandScreen'
import { derivePersonas, type Persona } from './personas'

export type TileId =
  | 'lstb'
  | 'ch'
  | 'rente'
  | 'lebenslagen'
  | 'einkuenfte'
  | 'sonderausgaben'
  | 'arbeitsweg'
  | 'kapital'
  | 'vermietung'
  | 'kinder'
  | 'alleinerziehend'
  | 'haushalt'
  | 'gesundheit'
  | 'vorauszahlungen'

export type TileStatus = 'offen' | 'erledigt' | 'betrag-offen'

export type TileRoute =
  | { readonly screen: 'Lstb' }
  | { readonly screen: 'CrossBorder' }
  | { readonly screen: 'Pension' }
  | { readonly screen: 'Catalog'; readonly entry: CatalogEntryParam }
  | { readonly screen: 'Workdays' }
  | { readonly screen: 'Capital' }
  | { readonly screen: 'Rental' }
  | { readonly screen: 'Children' }

/**
 * Person B of a joint return without an account of their own (ADR-0073): who they are and what is
 * entered for them. Null when there is no such partner (single, separate returns, or B's own account).
 */
export interface PartnerFacts {
  /** Joint return (Zusammenveranlagung) recorded by this account; false when filing separately. */
  readonly joint: boolean
  readonly name: string | null
  /** ISO date, as the link stores it. */
  readonly birthDate: string | null
  /** A query for B is still loading or failed: no step or count is suggested rather than a wrong one. */
  readonly pending?: boolean | undefined
  readonly lstb?: LstbResponseDto | null | undefined
  readonly ch?: ChSalaryCertificateResponseDto | null | undefined
  readonly pension?: PensionResponseDto | null | undefined
  readonly commute?: CommuteResponseDto | null | undefined
}

export interface TileFacts {
  readonly path: FunnelPath
  readonly answers: Answers
  readonly masterData?: MasterDataResponseDto | null | undefined
  readonly boosterEnabled?: boolean | undefined
  readonly pendingTiles?: ReadonlySet<TileId> | undefined
  readonly lstb?: LstbResponseDto | null | undefined
  readonly ch?: ChSalaryCertificateResponseDto | null | undefined
  readonly pension?: PensionResponseDto | null | undefined
  readonly commute?: CommuteResponseDto | null | undefined
  readonly capital?: KapitalResponseDto | null | undefined
  readonly rental?: RentalResponseDto | null | undefined
  readonly children?: ChildrenResponseDto | null | undefined
  readonly partner?: PartnerFacts | null | undefined
}

/**
 * A cross-border commuter who also had a German job in the year (ADR-0079): the way-to-work mask
 * records the change (the first way ends, a second one starts), or a German certificate is already
 * entered. Then the German LStB is asked too — for A in the Strom, for B in the partner tiles.
 */
export function hasGermanJobToo(commute: CommuteResponseDto | null | undefined, lstb: LstbResponseDto | null | undefined): boolean {
  const inputs = commute?.inputs
  const changed = inputs != null && (inputs.secondFrom != null || inputs.secondOneWayKm != null || inputs.periodTo != null)
  const entered = lstb != null && [lstb.bruttoarbeitslohn, lstb.lohnsteuer, lstb.sozialversicherung].some((field) => field.kind === 'erfasst')
  return changed || entered
}

/**
 * The German certificate belongs to a cross-border commuter's return: the basis says so („Auch in
 * Deutschland“), or the way to work records a change of job, or a certificate is already entered.
 */
export function crossBorderWithGermanJob(facts: TileFacts): boolean {
  return facts.path === 'ch' && (facts.answers['de-job'] === GERMAN_JOB_TOO || hasGermanJobToo(facts.commute, facts.lstb))
}

export interface TileDefinition {
  readonly id: TileId
  readonly titleKey: `cockpit.kachel.${TileId}.titel`
  readonly route: TileRoute
  readonly personas: 'all' | readonly Persona[]
  readonly isVisible: (facts: TileFacts) => boolean
  readonly status: (facts: TileFacts) => TileStatus
}

function lstbFieldToState(field: LstbFieldDto): WageTaxCertificateFieldState {
  if (field.kind === 'erfasst' && field.value !== undefined) {
    return { kind: 'erfasst', value: field.value }
  }
  return field.kind === 'unklar' ? { kind: 'unklar' } : { kind: 'offen' }
}

function catalogStatus(entry: CatalogEntryParam, answers: Answers): TileStatus {
  if (laterAmountSteps(answers).some((step) => entryForStep(step) === entry)) {
    return 'betrag-offen'
  }
  return nextStepFor(ENTRIES[entry], answers).kind === 'done' ? 'erledigt' : 'offen'
}

export const TILES: readonly TileDefinition[] = [
  {
    id: 'lstb',
    titleKey: 'cockpit.kachel.lstb.titel',
    route: { screen: 'Lstb' },
    personas: ['angestellt'],
    isVisible: () => true,
    status: (f) => {
      if (!f.lstb) return 'offen'
      const result = wageTaxCertificateStatus({
        bruttoarbeitslohn: lstbFieldToState(f.lstb.bruttoarbeitslohn),
        lohnsteuer: lstbFieldToState(f.lstb.lohnsteuer),
        sozialversicherung: lstbFieldToState(f.lstb.sozialversicherung),
      })
      return result.kind === 'vollstaendig' ? 'erledigt' : 'offen'
    },
  },
  {
    id: 'ch',
    titleKey: 'cockpit.kachel.ch.titel',
    route: { screen: 'CrossBorder' },
    personas: ['grenzgaenger'],
    isVisible: () => true,
    status: (f) => (f.ch?.foldStatus?.kind === 'bestimmt' && f.ch.exchangeRate !== null ? 'erledigt' : 'offen'),
  },
  {
    id: 'rente',
    titleKey: 'cockpit.kachel.rente.titel',
    route: { screen: 'Pension' },
    personas: ['rentner'],
    isVisible: () => true,
    status: (f) => (f.pension?.status.kind === 'bestimmt' ? 'erledigt' : 'offen'),
  },
  {
    id: 'lebenslagen',
    titleKey: 'cockpit.kachel.lebenslagen.titel',
    route: { screen: 'Catalog', entry: 'lebenslagen' },
    personas: ['angestellt', 'grenzgaenger'],
    isVisible: () => true,
    status: (f) => catalogStatus('lebenslagen', f.answers),
  },
  {
    id: 'einkuenfte',
    titleKey: 'cockpit.kachel.einkuenfte.titel',
    route: { screen: 'Catalog', entry: 'einkuenfte' },
    personas: 'all',
    isVisible: () => true,
    status: (f) => catalogStatus('einkuenfte', f.answers),
  },
  {
    id: 'sonderausgaben',
    titleKey: 'cockpit.kachel.sonderausgaben.titel',
    route: { screen: 'Catalog', entry: 'sonderausgaben' },
    personas: 'all',
    isVisible: () => true,
    status: (f) => catalogStatus('sonderausgaben', f.answers),
  },
  {
    id: 'arbeitsweg',
    titleKey: 'cockpit.kachel.arbeitsweg.titel',
    route: { screen: 'Workdays' },
    personas: ['angestellt', 'grenzgaenger'],
    isVisible: () => true,
    status: (f) => (f.commute?.inputs != null && f.commute.workdays != null ? 'erledigt' : 'offen'),
  },
  {
    id: 'kapital',
    titleKey: 'cockpit.kachel.kapital.titel',
    route: { screen: 'Capital' },
    personas: ['rentner', 'anleger'],
    isVisible: () => true,
    status: (f) => (f.capital?.status.kind === 'bestimmt' ? 'erledigt' : 'offen'),
  },
  {
    id: 'vermietung',
    titleKey: 'cockpit.kachel.vermietung.titel',
    route: { screen: 'Rental' },
    personas: ['vermieter'],
    isVisible: () => true,
    status: (f) => (f.rental?.status.kind === 'bestimmt' ? 'erledigt' : 'offen'),
  },
  {
    id: 'kinder',
    titleKey: 'cockpit.kachel.kinder.titel',
    route: { screen: 'Children' },
    personas: ['eltern'],
    isVisible: () => true,
    status: (f) => (f.children !== undefined && f.children !== null && f.children.kinder.length > 0 ? 'erledigt' : 'offen'),
  },
  {
    id: 'alleinerziehend',
    titleKey: 'cockpit.kachel.alleinerziehend.titel',
    route: { screen: 'Catalog', entry: 'alleinerziehend' },
    personas: ['alleinerziehend'],
    // § 24b EStG is closed to married people — not even under „Weitere Themen“ (UX review H7).
    isVisible: (f) => !derivePersonas(f.answers, f.masterData).has('verheiratet'),
    status: (f) => catalogStatus('alleinerziehend', f.answers),
  },
  {
    id: 'haushalt',
    titleKey: 'cockpit.kachel.haushalt.titel',
    route: { screen: 'Catalog', entry: 'haushalt' },
    personas: 'all',
    isVisible: (f) => f.boosterEnabled ?? HOUSEHOLD_AND_HEALTH_BOOSTERS,
    status: (f) => catalogStatus('haushalt', f.answers),
  },
  {
    id: 'gesundheit',
    titleKey: 'cockpit.kachel.gesundheit.titel',
    route: { screen: 'Catalog', entry: 'gesundheit' },
    personas: ['rentner', 'eltern', 'alleinerziehend'],
    isVisible: (f) => f.boosterEnabled ?? HOUSEHOLD_AND_HEALTH_BOOSTERS,
    status: (f) => catalogStatus('gesundheit', f.answers),
  },
  {
    // Cross-border commuters and landlords pay income tax in advance as a rule (§ 37 EStG, ADR-0081).
    id: 'vorauszahlungen',
    titleKey: 'cockpit.kachel.vorauszahlungen.titel',
    route: { screen: 'Catalog', entry: 'vorauszahlungen' },
    personas: ['grenzgaenger', 'vermieter'],
    isVisible: () => true,
    status: (f) => catalogStatus('vorauszahlungen', f.answers),
  },
]

const TILES_BY_ID: Readonly<Record<TileId, TileDefinition>> = Object.fromEntries(
  TILES.map((tile) => [tile.id, tile]),
) as Readonly<Record<TileId, TileDefinition>>

export function tileById(id: TileId): TileDefinition {
  return TILES_BY_ID[id]
}

export interface PartitionedTiles {
  readonly main: readonly TileDefinition[]
  readonly more: readonly TileDefinition[]
}

export function partitionTiles(facts: TileFacts): PartitionedTiles {
  const personas = derivePersonas(facts.answers, facts.masterData)
  const main: TileDefinition[] = []
  const more: TileDefinition[] = []
  for (const tile of TILES) {
    if (!tile.isVisible(facts)) continue
    if (tile.personas === 'all' || tile.personas.some((p) => personas.has(p)) || (tile.id === 'lstb' && crossBorderWithGermanJob(facts))) {
      main.push(tile)
    } else {
      more.push(tile)
    }
  }
  return { main, more }
}

export interface GroupedTiles {
  /** Part of the user's path and still to do — or done but flagged by a finding. */
  readonly required: readonly TileDefinition[]
  /** Fits the user, can pay off, never blocks the return. */
  readonly optional: readonly TileDefinition[]
  /** Done and unflagged: shown compactly at the end. */
  readonly done: readonly TileDefinition[]
  /** Topics that do not fit the user's personas („Weitere Themen“). */
  readonly more: readonly TileDefinition[]
}

/**
 * A tile the return cannot do without: the steps of the user's path, and the two the Strom asks as steps
 * of their own once they apply (the children, Alleinerziehend).
 */
export function isRequiredTile(tile: TileDefinition, path: FunnelPath, facts?: TileFacts): boolean {
  if (tile.id === 'lstb' && facts !== undefined && crossBorderWithGermanJob(facts)) return true
  return tile.id === 'kinder' || tile.id === 'alleinerziehend' || NEXT_STEP_ORDER[path].includes(tile.id)
}

/**
 * The cockpit's tiles by what the user has to do with them. A done tile moves to the end unless
 * `needsAttention` says a finding points at it; a tile whose data is still loading stays where it is.
 */
export function groupTiles(facts: TileFacts, needsAttention: (id: TileId) => boolean = () => false): GroupedTiles {
  const { main, more } = partitionTiles(facts)
  const required: TileDefinition[] = []
  const optional: TileDefinition[] = []
  const done: TileDefinition[] = []
  for (const tile of main) {
    const settled = !facts.pendingTiles?.has(tile.id) && tile.status(facts) === 'erledigt' && !needsAttention(tile.id)
    if (settled) done.push(tile)
    else if (isRequiredTile(tile, facts.path, facts)) required.push(tile)
    else optional.push(tile)
  }
  return { required, optional, done, more }
}

export function visibleTiles(facts: TileFacts): readonly TileDefinition[] {
  return partitionTiles(facts).main
}

export const NEXT_STEP_ORDER: Readonly<Record<FunnelPath, readonly TileId[]>> = {
  angestellte: ['lstb', 'lebenslagen', 'einkuenfte', 'sonderausgaben', 'arbeitsweg'],
  ch: ['ch', 'einkuenfte', 'sonderausgaben', 'arbeitsweg'],
  rente: ['rente', 'einkuenfte', 'sonderausgaben'],
}

function isSequenceStepDone(tile: TileDefinition, facts: TileFacts): boolean {
  if (tile.route.screen === 'Catalog') {
    return nextStepFor(ENTRIES[tile.route.entry], facts.answers).kind === 'done'
  }
  return tile.status(facts) === 'erledigt'
}

export type NextStep =
  | { readonly kind: 'tile'; readonly tile: TileDefinition }
  | { readonly kind: 'done' }
  /** A tile earlier in the order is still loading or failed: no step is suggested rather than a wrong one. */
  | { readonly kind: 'unknown' }

export function nextStep(facts: TileFacts): NextStep {
  for (const id of NEXT_STEP_ORDER[facts.path]) {
    const tile = tileById(id)
    if (!tile.isVisible(facts)) continue
    if (facts.pendingTiles?.has(id)) return { kind: 'unknown' }
    if (!isSequenceStepDone(tile, facts)) return { kind: 'tile', tile }
  }
  return { kind: 'done' }
}

export function nextStepTile(facts: TileFacts): TileDefinition | null {
  const step = nextStep(facts)
  return step.kind === 'tile' ? step.tile : null
}

export function hasAnswersForEntry(entry: CatalogEntryParam, answers: Answers): boolean {
  return (Object.keys(answers) as EntryStepId[]).some(
    (step) => answers[step] !== undefined && entryForStep(step) === entry,
  )
}

export type FindingTileTarget = TileId | 'abgabe'
export type TileHintSeverity = 'blocker' | 'warnung'

export const FINDING_TILE: Record<Conflict['kind'] | Notice['kind'], FindingTileTarget> = {
  'lstb-offen': 'lstb',
  'lstb-unklar': 'lstb',
  'lstb-widerspruch': 'lstb',
  'werktage-widerspruch': 'arbeitsweg',
  'gated-einkunftsart': 'einkuenfte',
  'erfasst-nicht-gerechnet': 'lebenslagen',
  'werbungskosten-uebersteigt-einnahmen': 'abgabe',
  'betrag-spaeter': 'abgabe',
}

export function tilesForFinding(finding: Conflict | Notice): readonly FindingTileTarget[] {
  if (finding.kind === 'betrag-spaeter') {
    const resolved: TileId[] = []
    for (const step of finding.steps) {
      const entry = entryForStep(step)
      if (entry && entry in TILES_BY_ID) {
        const tileId = entry as TileId
        if (!resolved.includes(tileId)) resolved.push(tileId)
      }
    }
    return resolved.length > 0 ? resolved : [FINDING_TILE['betrag-spaeter']]
  }
  if (finding.kind === 'gated-einkunftsart' && finding.incomeType === 'Gewerbe') {
    return ['abgabe']
  }
  return [FINDING_TILE[finding.kind]]
}

export function tileHintSeverity(
  tileId: TileId,
  conflicts: readonly Conflict[],
  notices: readonly Notice[],
): TileHintSeverity | null {
  if (conflicts.some((c) => tilesForFinding(c).includes(tileId))) return 'blocker'
  if (notices.some((n) => tilesForFinding(n).includes(tileId))) return 'warnung'
  return null
}
