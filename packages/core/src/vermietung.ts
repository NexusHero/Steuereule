import { berechne, type Posten } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'

export type VermietungArtAntwort = 'Einfach' | 'Mehrere' | 'Verkauf oder möbliert'

export const VERMIETUNG_ART_ANTWORTEN: readonly VermietungArtAntwort[] = [
  'Einfach',
  'Mehrere',
  'Verkauf oder möbliert',
]

export function istVermietungArtAntwort(value: string): value is VermietungArtAntwort {
  return (VERMIETUNG_ART_ANTWORTEN as readonly string[]).includes(value)
}

export type VermietungEinordnung =
  | { readonly kind: 'einfach' }
  | { readonly kind: 'mehrere' }
  | { readonly kind: 'verkauf-oder-moebliert' }
  | { readonly kind: 'unbekannt' }

export function ordneVermietungEin(vermietungArt: string | undefined): VermietungEinordnung {
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

export function istVermietungBerechenbar(einordnung: VermietungEinordnung): boolean {
  return einordnung.kind === 'einfach' || einordnung.kind === 'mehrere'
}

export function afaSatzProzent(baujahr: number): number | null {
  if (!Number.isInteger(baujahr) || baujahr < 0) return null
  if (baujahr <= 1924) return 2.5
  if (baujahr <= 2022) return 2
  return 3
}

export type VermietungFeldId = 'mieteinnahmen' | 'anschaffungskosten' | 'baujahr' | 'werbungskosten'

export const VERMIETUNG_FELDER: readonly VermietungFeldId[] = ['mieteinnahmen', 'anschaffungskosten', 'baujahr', 'werbungskosten']

export type VermietungFeldZustand =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly wert: number }

/** One object's guided-mask data. */
export interface VermietungsobjektDaten {
  readonly id: string
  readonly mieteinnahmen: VermietungFeldZustand
  readonly anschaffungskosten: VermietungFeldZustand
  readonly baujahr: VermietungFeldZustand
  readonly werbungskosten: VermietungFeldZustand
}

export function leeresVermietungsobjekt(id: string): VermietungsobjektDaten {
  return {
    id,
    mieteinnahmen: { kind: 'offen' },
    anschaffungskosten: { kind: 'offen' },
    baujahr: { kind: 'offen' },
    werbungskosten: { kind: 'offen' },
  }
}

export function istGueltigerVermietungBetrag(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function setzeVermietungFeld(objekt: VermietungsobjektDaten, feld: VermietungFeldId, zustand: VermietungFeldZustand): VermietungsobjektDaten {
  if (zustand.kind === 'erfasst' && !istGueltigerVermietungBetrag(zustand.wert)) {
    throw new RangeError(`vermietung: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...objekt, [feld]: zustand }
}

export const VERMIETUNG_UNKLAR = 'unklar'

export function serialisiereVermietungFeld(zustand: VermietungFeldZustand): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return VERMIETUNG_UNKLAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

export function deserialisiereVermietungFeld(value: string | null): VermietungFeldZustand {
  if (value === null) return { kind: 'offen' }
  if (value === VERMIETUNG_UNKLAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!istGueltigerVermietungBetrag(wert)) {
    throw new Error(`vermietung: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', wert }
}

export function afaHerkunft(baujahr: number, prozent: number): string {
  return `§ 7 Abs. 4 Satz 1 EStG — lineare AfA ${prozent} % bei Baujahr ${baujahr}`
}

/** One object's honest facts. */
export interface VermietungsobjektFakten {
  readonly einnahmen: number | null
  readonly werbungskosten: number | null
  readonly afa: { readonly betrag: number; readonly herkunft: string } | null
  readonly offenePosten: number
}

export function vermietungsobjektFakten(objekt: VermietungsobjektDaten): VermietungsobjektFakten {
  let offenePosten = 0

  const einnahmen = objekt.mieteinnahmen.kind === 'erfasst' ? objekt.mieteinnahmen.wert : null
  if (objekt.mieteinnahmen.kind !== 'erfasst') offenePosten += 1

  const werbungskosten = objekt.werbungskosten.kind === 'erfasst' ? objekt.werbungskosten.wert : null
  if (objekt.werbungskosten.kind !== 'erfasst') offenePosten += 1

  let afa: VermietungsobjektFakten['afa'] = null
  if (objekt.anschaffungskosten.kind === 'erfasst' && objekt.baujahr.kind === 'erfasst') {
    const prozent = afaSatzProzent(objekt.baujahr.wert)
    if (prozent !== null) {
      const betrag = Math.round(objekt.anschaffungskosten.wert * (prozent / 100))
      afa = { betrag, herkunft: afaHerkunft(objekt.baujahr.wert, prozent) }
    }
  }
  if (afa === null) offenePosten += 1

  return { einnahmen, werbungskosten, afa, offenePosten }
}

export function vermietungsobjektAlsEinnahmePosten(objekt: VermietungsobjektDaten): Posten | null {
  if (objekt.mieteinnahmen.kind !== 'erfasst') return null
  return {
    id: `vermietung-${objekt.id}`,
    einkunftsart: 'Vermietung',
    betrag: objekt.mieteinnahmen.wert,
    quelle: { art: 'eingabe' },
  }
}

/** The fold over ALL objects. */
export interface VermietungStand {
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

export function vermietungStand(objekte: readonly VermietungsobjektDaten[], gegated: readonly Einkunftsart[]): VermietungStand {
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
