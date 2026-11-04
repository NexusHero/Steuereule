import { berechne, type Berechnungsstand, type Posten } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'

export type KapDepotAntwort = 'Deutscher Broker' | 'Ausländischer Broker' | 'Krypto'

export const KAP_DEPOT_ANTWORTEN: readonly KapDepotAntwort[] = [
  'Deutscher Broker',
  'Ausländischer Broker',
  'Krypto',
]

export function istKapDepotAntwort(value: string): value is KapDepotAntwort {
  return (KAP_DEPOT_ANTWORTEN as readonly string[]).includes(value)
}

export type KapitalDepotEinordnung =
  | { readonly kind: 'deutscher-broker' }
  | { readonly kind: 'auslaendischer-broker' }
  | { readonly kind: 'krypto' }
  | { readonly kind: 'unbekannt' }

export function ordneKapDepotEin(kapDepot: string | undefined): KapitalDepotEinordnung {
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

export function istGuenstigerpruefungAnwendbar(einordnung: KapitalDepotEinordnung): boolean {
  return einordnung.kind === 'deutscher-broker'
}

export type KapitalFeldId =
  | 'kapitalertraege'
  | 'sparerPauschbetrag'
  | 'kapitalertragsteuer'
  | 'solidaritaetszuschlag'
  | 'kirchensteuer'

export const KAPITAL_FELDER: readonly KapitalFeldId[] = [
  'kapitalertraege',
  'sparerPauschbetrag',
  'kapitalertragsteuer',
  'solidaritaetszuschlag',
  'kirchensteuer',
]

export function kapitalPflichtfelder(depot: KapitalDepotEinordnung['kind']): readonly KapitalFeldId[] {
  if (depot === 'deutscher-broker') return KAPITAL_FELDER
  if (depot === 'auslaendischer-broker') return ['kapitalertraege', 'sparerPauschbetrag']
  return ['kapitalertraege']
}

export type KapitalFeldZustand =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

export type KapitalDaten = { readonly [feld in KapitalFeldId]: KapitalFeldZustand }

export const LEERES_KAPITAL: KapitalDaten = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
}

export function istGueltigerKapitalBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function setzeKapitalFeld(daten: KapitalDaten, feld: KapitalFeldId, zustand: KapitalFeldZustand): KapitalDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerKapitalBetrag(zustand.wert)) {
    throw new RangeError(`kapital: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

export const KAPITAL_UNKLAR = 'unklar'

export function serialisiereKapitalFeld(zustand: KapitalFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return KAPITAL_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

export function deserialisiereKapitalFeld(value: string | null): KapitalFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === KAPITAL_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerKapitalBetrag(wert)) {
    throw new Error(`kapital: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

export function kapitalAlsKernposten(kapital: KapitalDaten): Posten | null {
  if (kapital.kapitalertraege.kind !== 'erfasst') return null
  return {
    id: 'kapital',
    einkunftsart: 'Kapital',
    betrag: kapital.kapitalertraege.wert,
    quelle: { art: 'eingabe' },
  }
}

export function kapitalStand(kapital: KapitalDaten, gegated: readonly Einkunftsart[]): Berechnungsstand {
  const kernposten = kapitalAlsKernposten(kapital)
  const posten: Posten[] = kernposten === null ? [] : [kernposten]
  const offenePosten = kernposten === null ? 1 : 0
  return berechne({ posten, offenePosten, konflikte: [], gegated })
}
