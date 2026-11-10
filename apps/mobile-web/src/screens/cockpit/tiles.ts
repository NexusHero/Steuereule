import {
  ENTRIES,
  entryForStep,
  laterAmountSteps,
  nextStepFor,
  wageTaxCertificateStatus,
  type Answers,
  type EntryStepId,
  type WageTaxCertificateFieldState,
} from '@steuereule/core'
import type {
  ChSalaryCertificateResponseDto,
  ChildrenResponseDto,
  CommuteResponseDto,
  KapitalResponseDto,
  LstbFieldDto,
  LstbResponseDto,
  PensionResponseDto,
  RentalResponseDto,
} from '@steuereule/api-client'
import type { CatalogEntryParam } from '../../navigation/routes'
import type { FunnelPath } from '../funnel/KontoWandScreen'

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

export interface TileFacts {
  readonly path: FunnelPath
  readonly answers: Answers
  readonly lstb?: LstbResponseDto | null | undefined
  readonly ch?: ChSalaryCertificateResponseDto | null | undefined
  readonly pension?: PensionResponseDto | null | undefined
  readonly commute?: CommuteResponseDto | null | undefined
  readonly capital?: KapitalResponseDto | null | undefined
  readonly rental?: RentalResponseDto | null | undefined
  readonly children?: ChildrenResponseDto | null | undefined
}

export interface TileDefinition {
  readonly id: TileId
  readonly titleKey: `cockpit.kachel.${TileId}.titel`
  readonly route: TileRoute
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
    isVisible: (f) => f.path === 'angestellte',
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
    isVisible: (f) => f.path === 'ch',
    status: (f) => (f.ch?.foldStatus?.kind === 'bestimmt' && f.ch.exchangeRate !== null ? 'erledigt' : 'offen'),
  },
  {
    id: 'rente',
    titleKey: 'cockpit.kachel.rente.titel',
    route: { screen: 'Pension' },
    isVisible: (f) => f.path === 'rente',
    status: (f) => (f.pension?.status.kind === 'bestimmt' ? 'erledigt' : 'offen'),
  },
  {
    id: 'lebenslagen',
    titleKey: 'cockpit.kachel.lebenslagen.titel',
    route: { screen: 'Catalog', entry: 'lebenslagen' },
    isVisible: () => true,
    status: (f) => catalogStatus('lebenslagen', f.answers),
  },
  {
    id: 'einkuenfte',
    titleKey: 'cockpit.kachel.einkuenfte.titel',
    route: { screen: 'Catalog', entry: 'einkuenfte' },
    isVisible: () => true,
    status: (f) => catalogStatus('einkuenfte', f.answers),
  },
  {
    id: 'sonderausgaben',
    titleKey: 'cockpit.kachel.sonderausgaben.titel',
    route: { screen: 'Catalog', entry: 'sonderausgaben' },
    isVisible: () => true,
    status: (f) => catalogStatus('sonderausgaben', f.answers),
  },
  {
    id: 'arbeitsweg',
    titleKey: 'cockpit.kachel.arbeitsweg.titel',
    route: { screen: 'Workdays' },
    isVisible: (f) => f.path !== 'rente',
    status: (f) => (f.commute?.inputs != null && f.commute.workdays != null ? 'erledigt' : 'offen'),
  },
  {
    id: 'kapital',
    titleKey: 'cockpit.kachel.kapital.titel',
    route: { screen: 'Capital' },
    isVisible: () => true,
    status: (f) => (f.capital?.status.kind === 'bestimmt' ? 'erledigt' : 'offen'),
  },
  {
    id: 'vermietung',
    titleKey: 'cockpit.kachel.vermietung.titel',
    route: { screen: 'Rental' },
    isVisible: () => true,
    status: (f) => (f.rental?.status.kind === 'bestimmt' ? 'erledigt' : 'offen'),
  },
  {
    id: 'kinder',
    titleKey: 'cockpit.kachel.kinder.titel',
    route: { screen: 'Children' },
    isVisible: (f) => f.answers.kinder !== undefined && f.answers.kinder !== 'Nein',
    status: (f) => (f.children !== undefined && f.children !== null && f.children.kinder.length > 0 ? 'erledigt' : 'offen'),
  },
]

const TILES_BY_ID: Readonly<Record<TileId, TileDefinition>> = Object.fromEntries(
  TILES.map((tile) => [tile.id, tile]),
) as Readonly<Record<TileId, TileDefinition>>

export function tileById(id: TileId): TileDefinition {
  return TILES_BY_ID[id]
}

export function visibleTiles(facts: TileFacts): readonly TileDefinition[] {
  return TILES.filter((tile) => tile.isVisible(facts))
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

export function nextStepTile(facts: TileFacts): TileDefinition | null {
  for (const id of NEXT_STEP_ORDER[facts.path]) {
    const tile = tileById(id)
    if (!tile.isVisible(facts)) continue
    if (!isSequenceStepDone(tile, facts)) return tile
  }
  return null
}

export function hasAnswersForEntry(entry: CatalogEntryParam, answers: Answers): boolean {
  return (Object.keys(answers) as EntryStepId[]).some(
    (step) => answers[step] !== undefined && entryForStep(step) === entry,
  )
}
