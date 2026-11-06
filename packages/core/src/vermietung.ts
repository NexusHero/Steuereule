import { calculate, type Item } from './berechnung'
import type { IncomeType } from './einkunftsarten'
export type RentalClassification =
  | { readonly kind: 'einfach' }
  | { readonly kind: 'mehrere' }
  | { readonly kind: 'verkauf-oder-moebliert' }
  | { readonly kind: 'unbekannt' }

export function classifyRental(rentalKind: string | undefined): RentalClassification {
  switch (rentalKind) {
    case 'Einfach':
      return { kind: 'einfach' }
    case 'Mehrere':
      return { kind: 'mehrere' }
    case 'Verkauf oder möbliert':
      return { kind: 'verkauf-oder-moebliert' }
    default:
      return { kind: 'unbekannt' }
  }
}

export function isRentalCalculable(classification: RentalClassification): boolean {
  return classification.kind === 'einfach' || classification.kind === 'mehrere'
}

export function depreciationRatePercent(baujahr: number): number | null {
  if (!Number.isInteger(baujahr) || baujahr < 0) return null
  if (baujahr <= 1924) return 2.5
  if (baujahr <= 2022) return 2
  return 3
}

export type RentalFieldId = 'mieteinnahmen' | 'anschaffungskosten' | 'baujahr' | 'werbungskosten'
export const RENTAL_FIELDS: readonly RentalFieldId[] = ['mieteinnahmen', 'anschaffungskosten', 'baujahr', 'werbungskosten']
export type RentalFieldState =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly value: number }

/** One object's guided-mask data. */
export interface RentalObjectData {
  readonly id: string
  readonly mieteinnahmen: RentalFieldState
  readonly anschaffungskosten: RentalFieldState
  readonly baujahr: RentalFieldState
  readonly werbungskosten: RentalFieldState
}

export function emptyRentalObject(id: string): RentalObjectData {
  return {
    id,
    mieteinnahmen: { kind: 'offen' },
    anschaffungskosten: { kind: 'offen' },
    baujahr: { kind: 'offen' },
    werbungskosten: { kind: 'offen' },
  }
}

export function isValidRentalAmount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function setRentalField(property: RentalObjectData, field: RentalFieldId, state: RentalFieldState): RentalObjectData {
  if (state.kind === 'erfasst' && !isValidRentalAmount(state.value)) {
    throw new RangeError(`vermietung: "${field}" erfasst value must be a non-negative integer`)
  }
  return { ...property, [field]: state }
}

export const RENTAL_UNCLEAR = 'unklar'

export function serializeRentalField(state: RentalFieldState): string | null {
  switch (state.kind) {
    case 'offen':
      return null
    case 'unklar':
      return RENTAL_UNCLEAR
    case 'erfasst':
      return String(state.value)
  }
}

export function deserializeRentalField(value: string | null): RentalFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === RENTAL_UNCLEAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!isValidRentalAmount(wert)) {
    throw new Error(`vermietung: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', value: wert }
}

export function depreciationSource(baujahr: number, percent: number): string {
  return `§ 7 Abs. 4 Satz 1 EStG — lineare AfA ${percent} % bei Baujahr ${baujahr}`
}

/** One object's honest facts. */
export interface RentalObjectFacts {
  readonly einnahmen: number | null
  readonly werbungskosten: number | null
  readonly depreciation: { readonly amount: number; readonly provenance: string } | null
  readonly openItems: number
}

export function rentalPropertyFacts(property: RentalObjectData): RentalObjectFacts {
  let openItems = 0

  const einnahmen = property.mieteinnahmen.kind === 'erfasst' ? property.mieteinnahmen.value : null
  if (property.mieteinnahmen.kind !== 'erfasst') openItems += 1

  const werbungskosten = property.werbungskosten.kind === 'erfasst' ? property.werbungskosten.value : null
  if (property.werbungskosten.kind !== 'erfasst') openItems += 1

  let depreciation: RentalObjectFacts['depreciation'] = null
  if (property.anschaffungskosten.kind === 'erfasst' && property.baujahr.kind === 'erfasst') {
    const percent = depreciationRatePercent(property.baujahr.value)
    if (percent !== null) {
      const amount = Math.round(property.anschaffungskosten.value * (percent / 100))
      depreciation = { amount, provenance: depreciationSource(property.baujahr.value, percent) }
    }
  }
  if (depreciation === null) openItems += 1

  return { einnahmen, werbungskosten, depreciation, openItems }
}

export function rentalPropertyAsIncomeItem(property: RentalObjectData): Item | null {
  if (property.mieteinnahmen.kind !== 'erfasst') return null
  return {
    id: `vermietung-${property.id}`,
    incomeType: 'Vermietung',
    amount: property.mieteinnahmen.value,
    source: { kind: 'eingabe' },
  }
}

/** The fold over ALL objects. */
export interface RentalStatus {
  readonly kind: 'bestimmt' | 'offen'
  readonly einnahmen: number
  readonly vorsorgeaufwand: number
  readonly anrechnung: number
  readonly werbungskosten: number
  readonly depreciation: number
  readonly openItems: number
  readonly conflicts: number
  readonly gated: readonly IncomeType[]
}

export function rentalStatus(properties: readonly RentalObjectData[], gated: readonly IncomeType[]): RentalStatus {
  const items: Item[] = []
  let openItems = 0
  let werbungskosten = 0
  let depreciation = 0
  for (const property of properties) {
    const coreItems = rentalPropertyAsIncomeItem(property)
    if (coreItems !== null) items.push(coreItems)
    const facts = rentalPropertyFacts(property)
    openItems += facts.openItems
    if (facts.werbungskosten !== null) werbungskosten += facts.werbungskosten
    if (facts.depreciation !== null) depreciation += facts.depreciation.amount
  }

  const fold = calculate({ items, openItems, conflicts: [], gated })

  if (fold.kind === 'bestimmt') {
    return {
      kind: 'bestimmt',
      einnahmen: fold.einnahmen,
      vorsorgeaufwand: fold.vorsorgeaufwand,
      anrechnung: fold.anrechnung,
      werbungskosten,
      depreciation,
      openItems,
      conflicts: 0,
      gated: [],
    }
  }
  return {
    kind: 'offen',
    einnahmen: fold.einnahmen,
    vorsorgeaufwand: fold.vorsorgeaufwand,
    anrechnung: fold.anrechnung,
    werbungskosten,
    depreciation,
    openItems,
    conflicts: 0,
    gated: fold.gated,
  }
}
