import type { IncomeType } from './einkunftsarten.js'
export type Quelle =
  | { readonly art: 'eingabe' }
  | { readonly art: 'beleg'; readonly belegId: string }
  | { readonly art: 'ki-vorschlag'; readonly vorschlagId: string; readonly belegId?: string }
  | { readonly art: 'regel'; readonly regel: string }
  | { readonly art: 'uebernahme'; readonly vorjahr: number }
export type Rolle = 'einnahme' | 'vorsorgeaufwand' | 'anrechnung'

export interface Posten {
  readonly id: string
  readonly einkunftsart: IncomeType
  readonly rolle?: Rolle
  readonly betrag: number
  readonly quelle: Quelle
  readonly unbestaetigt?: boolean
}

/** A LineItem / Posten with conflicting sources. */
export interface PostenKonflikt {
  readonly postenId: string
  readonly einkunftsart: IncomeType
  readonly quellen: readonly (Quelle & { readonly betrag: number })[]
}

export interface BerechnungsInput {
  readonly posten: readonly Posten[]
  readonly offenePosten: number
  readonly konflikte: readonly PostenKonflikt[]
  readonly gegated: readonly IncomeType[]
}

export type Berechnungsstand =
  | {
      readonly kind: 'bestimmt'
      readonly einnahmen: number
      readonly vorsorgeaufwand: number
      readonly anrechnung: number
    }
  | {
      readonly kind: 'offen'
      readonly einnahmen: number
      readonly vorsorgeaufwand: number
      readonly anrechnung: number
      readonly offenePosten: number
      readonly konflikte: number
      readonly gegated: readonly IncomeType[]
      readonly unbestaetigte: number
      readonly unbestaetigteSumme: number
    }

function validate(input: BerechnungsInput): void {
  if (!Number.isInteger(input.offenePosten) || input.offenePosten < 0) {
    throw new RangeError('offenePosten must be a non-negative integer')
  }
  for (const posten of input.posten) {
    if (!Number.isFinite(posten.betrag) || posten.betrag < 0) {
      throw new RangeError('posten.betrag must be a non-negative finite number')
    }
  }
}

function roleOf(posten: Posten): Rolle {
  return posten.rolle ?? 'einnahme'
}

export function calculate(input: BerechnungsInput): Berechnungsstand {
  validate(input)
  let einnahmen = 0
  let vorsorgeaufwand = 0
  let anrechnung = 0
  let unbestaetigte = 0
  let unbestaetigteSumme = 0
  for (const posten of input.posten) {
    switch (roleOf(posten)) {
      case 'einnahme':
        einnahmen += posten.betrag
        break
      case 'vorsorgeaufwand':
        vorsorgeaufwand += posten.betrag
        break
      case 'anrechnung':
        anrechnung += posten.betrag
        break
    }
    if (posten.unbestaetigt === true) {
      unbestaetigte += 1
      if (roleOf(posten) === 'einnahme') unbestaetigteSumme += posten.betrag
    }
  }

  const offen =
    input.offenePosten > 0 ||
    input.konflikte.length > 0 ||
    input.gegated.length > 0 ||
    unbestaetigte > 0

  if (!offen) {
    return { kind: 'bestimmt', einnahmen, vorsorgeaufwand, anrechnung }
  }

  return {
    kind: 'offen',
    einnahmen,
    vorsorgeaufwand,
    anrechnung,
    offenePosten: input.offenePosten,
    konflikte: input.konflikte.length,
    gegated: input.gegated,
    unbestaetigte,
    unbestaetigteSumme,
  }
}

export type KonfliktAufloesung =
  | { readonly art: 'quelle-waehlen'; readonly quelle: Quelle; readonly betrag: number }
  | { readonly art: 'wert-korrigieren'; readonly betrag: number }

export function resolveConflict(konflikt: PostenKonflikt, aufloesung: KonfliktAufloesung): Posten {
  const quelle: Quelle = aufloesung.art === 'quelle-waehlen' ? aufloesung.quelle : { art: 'eingabe' }
  const betrag = aufloesung.betrag
  if (!Number.isFinite(betrag) || betrag < 0) {
    throw new RangeError('aufloesung.betrag must be a non-negative finite number')
  }
  return { id: konflikt.postenId, einkunftsart: konflikt.einkunftsart, betrag, quelle }
}
