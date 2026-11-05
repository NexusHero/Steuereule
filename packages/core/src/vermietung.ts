import { berechne, type Posten } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'

export type RentalTypeAnswer = 'Einfach' | 'Mehrere' | 'Verkauf oder möbliert'
export type VermietungArtAntwort = RentalTypeAnswer

export const RENTAL_TYPE_ANSWERS: readonly RentalTypeAnswer[] = [
  'Einfach',
  'Mehrere',
  'Verkauf oder möbliert',
]
export const VERMIETUNG_ART_ANTWORTEN = RENTAL_TYPE_ANSWERS

export function isRentalTypeAnswer(value: string): value is RentalTypeAnswer {
  return (RENTAL_TYPE_ANSWERS as readonly string[]).includes(value)
}

export type RentalClassification =
  | { readonly kind: 'einfach' }
  | { readonly kind: 'mehrere' }
  | { readonly kind: 'verkauf-oder-moebliert' }
  | { readonly kind: 'unbekannt' }

export type VermietungEinordnung = RentalClassification

export function classifyRental(vermietungArt: string | undefined): RentalClassification {
  switch (vermietungArt) {
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

export function isRentalCalculable(einordnung: RentalClassification): boolean {
  return einordnung.kind === 'einfach' || einordnung.kind === 'mehrere'
}

export function depreciationRatePercent(baujahr: number): number | null {
  if (!Number.isInteger(baujahr) || baujahr < 0) return null
  if (baujahr <= 1924) return 2.5
  if (baujahr <= 2022) return 2
  return 3
}

export type RentalFieldId = 'mieteinnahmen' | 'anschaffungskosten' | 'baujahr' | 'werbungskosten'
export type VermietungFeldId = RentalFieldId

export const RENTAL_FIELDS: readonly RentalFieldId[] = ['mieteinnahmen', 'anschaffungskosten', 'baujahr', 'werbungskosten']
export const VERMIETUNG_FELDER = RENTAL_FIELDS

export type RentalFieldState =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

export type VermietungFeldZustand = RentalFieldState

/** One object's guided-mask data. */
export interface RentalObjectData {
  readonly id: string
  readonly mieteinnahmen: RentalFieldState
  readonly anschaffungskosten: RentalFieldState
  readonly baujahr: RentalFieldState
  readonly werbungskosten: RentalFieldState
}

export type VermietungsobjektDaten = RentalObjectData

export function emptyRentalObject(id: string): RentalObjectData {
  return {
    id,
    mieteinnahmen: { kind: 'offen' },
    anschaffungskosten: { kind: 'offen' },
    baujahr: { kind: 'offen' },
    werbungskosten: { kind: 'offen' },
  }
}

export function isValidRentalAmount(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function setRentalField(objekt: RentalObjectData, feld: RentalFieldId, zustand: RentalFieldState): RentalObjectData {
  if (zustand.kind === 'erfasst' && !isValidRentalAmount(zustand.wert)) {
    throw new RangeError(`vermietung: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...objekt, [feld]: zustand }
}

export const RENTAL_UNCLEAR = 'unklar'
export const VERMIETUNG_UNKLAR = RENTAL_UNCLEAR

export function serializeRentalField(zustand: RentalFieldState): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return RENTAL_UNCLEAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

export function deserializeRentalField(value: string | null): RentalFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === RENTAL_UNCLEAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!isValidRentalAmount(wert)) {
    throw new Error(`vermietung: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

export function afaHerkunft(baujahr: number, prozent: number): string {
  return `§ 7 Abs. 4 Satz 1 EStG — lineare AfA ${prozent} % bei Baujahr ${baujahr}`
}

/** One object's honest facts. */
export interface RentalObjectFacts {
  readonly einnahmen: number | null
  readonly werbungskosten: number | null
  readonly afa: { readonly betrag: number; readonly herkunft: string } | null
  readonly offenePosten: number
}

export type VermietungsobjektFakten = RentalObjectFacts

export function vermietungsobjektFakten(objekt: RentalObjectData): RentalObjectFacts {
  let offenePosten = 0

  const einnahmen = objekt.mieteinnahmen.kind === 'erfasst' ? objekt.mieteinnahmen.wert : null
  if (objekt.mieteinnahmen.kind !== 'erfasst') offenePosten += 1

  const werbungskosten = objekt.werbungskosten.kind === 'erfasst' ? objekt.werbungskosten.wert : null
  if (objekt.werbungskosten.kind !== 'erfasst') offenePosten += 1

  let afa: RentalObjectFacts['afa'] = null
  if (objekt.anschaffungskosten.kind === 'erfasst' && objekt.baujahr.kind === 'erfasst') {
    const prozent = depreciationRatePercent(objekt.baujahr.wert)
    if (prozent !== null) {
      const betrag = Math.round(objekt.anschaffungskosten.wert * (prozent / 100))
      afa = { betrag, herkunft: afaHerkunft(objekt.baujahr.wert, prozent) }
    }
  }
  if (afa === null) offenePosten += 1

  return { einnahmen, werbungskosten, afa, offenePosten }
}

export function vermietungsobjektAlsEinnahmePosten(objekt: RentalObjectData): Posten | null {
  if (objekt.mieteinnahmen.kind !== 'erfasst') return null
  return {
    id: `vermietung-${objekt.id}`,
    einkunftsart: 'Vermietung',
    betrag: objekt.mieteinnahmen.wert,
    quelle: { art: 'eingabe' },
  }
}

/** The fold over ALL objects. */
export interface RentalStatus {
  readonly kind: 'bestimmt' | 'offen'
  readonly einnahmen: number
  readonly vorsorgeaufwand: number
  readonly anrechnung: number
  readonly werbungskosten: number
  readonly afa: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly Einkunftsart[]
}

export type VermietungStand = RentalStatus

export function vermietungStand(objekte: readonly RentalObjectData[], gegated: readonly Einkunftsart[]): RentalStatus {
  const posten: Posten[] = []
  let offenePosten = 0
  let werbungskosten = 0
  let afa = 0
  for (const objekt of objekte) {
    const kernposten = vermietungsobjektAlsEinnahmePosten(objekt)
    if (kernposten !== null) posten.push(kernposten)
    const fakten = vermietungsobjektFakten(objekt)
    offenePosten += fakten.offenePosten
    if (fakten.werbungskosten !== null) werbungskosten += fakten.werbungskosten
    if (fakten.afa !== null) afa += fakten.afa.betrag
  }

  const fold = berechne({ posten, offenePosten, konflikte: [], gegated })

  if (fold.kind === 'bestimmt') {
    return {
      kind: 'bestimmt',
      einnahmen: fold.einnahmen,
      vorsorgeaufwand: fold.vorsorgeaufwand,
      anrechnung: fold.anrechnung,
      werbungskosten,
      afa,
      offenePosten,
      konflikte: 0,
      gegated: [],
    }
  }
  return {
    kind: 'offen',
    einnahmen: fold.einnahmen,
    vorsorgeaufwand: fold.vorsorgeaufwand,
    anrechnung: fold.anrechnung,
    werbungskosten,
    afa,
    offenePosten,
    konflikte: 0,
    gegated: fold.gegated,
  }
}

// Backward-compatibility aliases
export {
  isRentalTypeAnswer as istVermietungArtAntwort,
  classifyRental as ordneVermietungEin,
  isRentalCalculable as istVermietungBerechenbar,
  depreciationRatePercent as afaSatzProzent,
  emptyRentalObject as leeresVermietungsobjekt,
  isValidRentalAmount as istGueltigerVermietungBetrag,
  setRentalField as setzeVermietungFeld,
  serializeRentalField as serialisiereVermietungFeld,
  deserializeRentalField as deserialisiereVermietungFeld,
}
