import { berechne, type Berechnungsstand, type Posten } from './berechnung'
import type { Einkunftsart, IncomeType } from './einkunftsarten'

export type CapitalDepotAnswer = 'Deutscher Broker' | 'Ausländischer Broker' | 'Krypto'
export type KapDepotAntwort = CapitalDepotAnswer

export const CAPITAL_DEPOT_ANSWERS: readonly CapitalDepotAnswer[] = [
  'Deutscher Broker',
  'Ausländischer Broker',
  'Krypto',
]
export const KAP_DEPOT_ANTWORTEN = CAPITAL_DEPOT_ANSWERS

export function isCapitalDepotAnswer(value: string): value is CapitalDepotAnswer {
  return (CAPITAL_DEPOT_ANSWERS as readonly string[]).includes(value)
}

export type CapitalDepotClassification =
  | { readonly kind: 'deutscher-broker' }
  | { readonly kind: 'auslaendischer-broker' }
  | { readonly kind: 'krypto' }
  | { readonly kind: 'unbekannt' }

export type KapitalDepotEinordnung = CapitalDepotClassification

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

export function isFavorableTaxTestApplicable(einordnung: CapitalDepotClassification): boolean {
  return einordnung.kind === 'deutscher-broker'
}

export type CapitalFieldId =
  | 'kapitalertraege'
  | 'sparerPauschbetrag'
  | 'kapitalertragsteuer'
  | 'solidaritaetszuschlag'
  | 'kirchensteuer'

export type KapitalFeldId = CapitalFieldId

export const CAPITAL_FIELDS: readonly CapitalFieldId[] = [
  'kapitalertraege',
  'sparerPauschbetrag',
  'kapitalertragsteuer',
  'solidaritaetszuschlag',
  'kirchensteuer',
]
export const KAPITAL_FELDER = CAPITAL_FIELDS

export function mandatoryCapitalFields(depot: CapitalDepotClassification['kind']): readonly CapitalFieldId[] {
  if (depot === 'deutscher-broker') return CAPITAL_FIELDS
  if (depot === 'auslaendischer-broker') return ['kapitalertraege', 'sparerPauschbetrag']
  return ['kapitalertraege']
}

export type CapitalFieldState =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

export type KapitalFeldZustand = CapitalFieldState

export type CapitalData = { readonly [feld in CapitalFieldId]: CapitalFieldState }
export type KapitalDaten = CapitalData

export const EMPTY_CAPITAL: CapitalData = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
}
export const LEERES_KAPITAL = EMPTY_CAPITAL

export function isValidCapitalAmount(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function setCapitalField(daten: CapitalData, feld: CapitalFieldId, zustand: CapitalFieldState): CapitalData {
  if (zustand.kind === 'erfasst' && !isValidCapitalAmount(zustand.wert)) {
    throw new RangeError(`kapital: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

export const CAPITAL_UNCLEAR = 'unklar'
export const KAPITAL_UNKLAR = CAPITAL_UNCLEAR

export function serializeCapitalField(zustand: CapitalFieldState): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return CAPITAL_UNCLEAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

export function deserializeCapitalField(value: string | null): CapitalFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === CAPITAL_UNCLEAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!isValidCapitalAmount(wert)) {
    throw new Error(`kapital: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

export function capitalAsCoreLineItem(kapital: CapitalData): Posten | null {
  if (kapital.kapitalertraege.kind !== 'erfasst') return null
  return {
    id: 'kapital',
    einkunftsart: 'Kapital',
    betrag: kapital.kapitalertraege.wert,
    quelle: { art: 'eingabe' },
  }
}

export function capitalStatus(kapital: CapitalData, gegated: readonly (IncomeType | Einkunftsart)[]): Berechnungsstand {
  const kernposten = capitalAsCoreLineItem(kapital)
  const posten: Posten[] = kernposten === null ? [] : [kernposten]
  const offenePosten = kernposten === null ? 1 : 0
  return berechne({ posten, offenePosten, konflikte: [], gegated: gegated as readonly Einkunftsart[] })
}

// Backward-compatibility aliases
export {
  isCapitalDepotAnswer as istKapDepotAntwort,
  classifyCapitalDepot as ordneKapDepotEin,
  isFavorableTaxTestApplicable as istGuenstigerpruefungAnwendbar,
  mandatoryCapitalFields as kapitalPflichtfelder,
  isValidCapitalAmount as istGueltigerKapitalBetrag,
  setCapitalField as setzeKapitalFeld,
  serializeCapitalField as serialisiereKapitalFeld,
  deserializeCapitalField as deserialisiereKapitalFeld,
  capitalAsCoreLineItem as kapitalAlsKernposten,
  capitalStatus as kapitalStand,
}
