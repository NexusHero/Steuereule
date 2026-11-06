import { calculate, type CalculationStatus, type Item } from './berechnung'
import type { IncomeType } from './income-types'
export type CapitalDepotClassification =
  | { readonly kind: 'deutscher-broker' }
  | { readonly kind: 'auslaendischer-broker' }
  | { readonly kind: 'krypto' }
  | { readonly kind: 'unbekannt' }

export function classifyCapitalDepot(kapDepot: string | undefined): CapitalDepotClassification {
  switch (kapDepot) {
    case 'Deutscher Broker':
      return { kind: 'deutscher-broker' }
    case 'Ausländischer Broker':
      return { kind: 'auslaendischer-broker' }
    case 'Krypto':
      return { kind: 'krypto' }
    default:
      return { kind: 'unbekannt' }
  }
}

export function isFavorableTaxTestApplicable(classification: CapitalDepotClassification): boolean {
  return classification.kind === 'deutscher-broker'
}

export type CapitalFieldId =
  | 'kapitalertraege'
  | 'sparerPauschbetrag'
  | 'kapitalertragsteuer'
  | 'solidaritaetszuschlag'
  | 'kirchensteuer'
export const CAPITAL_FIELDS: readonly CapitalFieldId[] = [
  'kapitalertraege',
  'sparerPauschbetrag',
  'kapitalertragsteuer',
  'solidaritaetszuschlag',
  'kirchensteuer',
]

export function mandatoryCapitalFields(depot: CapitalDepotClassification['kind']): readonly CapitalFieldId[] {
  if (depot === 'deutscher-broker') return CAPITAL_FIELDS
  if (depot === 'auslaendischer-broker') return ['kapitalertraege', 'sparerPauschbetrag']
  return ['kapitalertraege']
}

export type CapitalFieldState =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly value: number }
export type CapitalData = { readonly [feld in CapitalFieldId]: CapitalFieldState }
export const EMPTY_CAPITAL: CapitalData = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
}

export function isValidCapitalAmount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function setCapitalField(data: CapitalData, field: CapitalFieldId, state: CapitalFieldState): CapitalData {
  if (state.kind === 'erfasst' && !isValidCapitalAmount(state.value)) {
    throw new RangeError(`kapital: "${field}" erfasst value must be a non-negative integer`)
  }
  return { ...data, [field]: state }
}

export const CAPITAL_UNCLEAR = 'unklar'

export function serializeCapitalField(state: CapitalFieldState): string | null {
  switch (state.kind) {
    case 'offen':
      return null
    case 'unklar':
      return CAPITAL_UNCLEAR
    case 'erfasst':
      return String(state.value)
  }
}

export function deserializeCapitalField(value: string | null): CapitalFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === CAPITAL_UNCLEAR) return { kind: 'unklar' }
  const rawValue = Number(value)
  if (!isValidCapitalAmount(rawValue)) {
    throw new Error(`kapital: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', value: rawValue }
}

export function capitalAsCoreLineItem(capital: CapitalData): Item | null {
  if (capital.kapitalertraege.kind !== 'erfasst') return null
  return {
    id: 'kapital',
    incomeType: 'Kapital',
    amount: capital.kapitalertraege.value,
    source: { kind: 'eingabe' },
  }
}

export function capitalStatus(capital: CapitalData, gated: readonly (IncomeType | IncomeType)[]): CalculationStatus {
  const coreItems = capitalAsCoreLineItem(capital)
  const items: Item[] = coreItems === null ? [] : [coreItems]
  const openItems = coreItems === null ? 1 : 0
  return calculate({ items, openItems, conflicts: [], gated: gated as readonly IncomeType[] })
}
