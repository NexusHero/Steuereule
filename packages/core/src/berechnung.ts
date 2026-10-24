// ADR-014/015/048/008/032 — the deterministic computation core. `packages/core` is the
// SOLE source of every number the app shows; the LLM never computes (ADR-048 §1), it only
// SUGGESTS (ADR-014, see ki-port.ts). This module folds Posten into either a determined
// amount or an honest "offen" result — never a guess. What is not yet computable is
// modelled as OFFEN (a required line item without a value), KONFLIKT (ADR-008: conflicting
// sources) or GEGATED (an Einkunftsart 1.0 does not cover, ADR-028/032/033). Pure, no I/O.
//
// The tax FORMULAS (tariff, Günstigerprüfung, Fünftelregelung, zumutbare Belastung) are
// deliberately NOT here — they are the later slices' work. This module supplies the honest
// container they will fill, so "what is computable vs. open vs. gated" is a type, not a
// hope.
import type { Einkunftsart } from './einkunftsarten.js'

/** "Jede Zahl trägt Herkunft" (ADR-014/015) — a Posten amount is never bare. */
export type Quelle =
  | { readonly art: 'eingabe' }
  | { readonly art: 'beleg'; readonly belegId: string }
  | { readonly art: 'ki-vorschlag'; readonly vorschlagId: string; readonly belegId?: string }
  | { readonly art: 'regel'; readonly regel: string }

/**
 * ADR-029/0015-Lehre — which bucket a Posten folds into. `einnahme` is the historical meaning
 * (income), the only role the core had before the Grenzgänger vertical added deductions and
 * credits. `vorsorgeaufwand` (PK/3a/KK) and `anrechnung` (Quellensteuer) are NOT income — they
 * must not be summed into the same figure as Einnahmen. The fold reports each bucket separately,
 * never subtracted here (the aggregation of Vorsorgeaufwand against income is a later
 * tax-formula slice's work, the same "partial truth stated as a partial truth" honesty as
 * `angestellte.ts`'s sonderausgaben).
 */
export type Rolle = 'einnahme' | 'vorsorgeaufwand' | 'anrechnung'

/** A settled line item (one amount, one origin). Whole euros, >= 0. */
export interface Posten {
  readonly id: string
  /** The Anlage/Einkunftsart the line belongs to — kept meaningful even for Vorsorge/Anrechnung. */
  readonly einkunftsart: Einkunftsart
  /** Which bucket the amount folds into. Absent = `einnahme` (income), the pre-CH meaning. */
  readonly rolle?: Rolle
  readonly betrag: number
  readonly quelle: Quelle
}

/**
 * ADR-008 — a Posten with conflicting sources. Both values stay visible (Herkunfts-Chips);
 * the Posten does NOT count into the sum; submission blocks until resolved. It is a
 * distinct type from `Posten`, never a silent overwrite — a conflicting amount cannot be
 * represented as a settled Posten at all.
 */
export interface PostenKonflikt {
  readonly postenId: string
  readonly einkunftsart: Einkunftsart
  readonly quellen: readonly (Quelle & { readonly betrag: number })[]
}

export interface BerechnungsInput {
  /** Settled line items — each with an amount and an origin. */
  readonly posten: readonly Posten[]
  /** Required-but-empty line items (>= 0 integer). */
  readonly offenePosten: number
  /** ADR-008 conflicts — excluded from the sum until resolved. */
  readonly konflikte: readonly PostenKonflikt[]
  /** Declared but not computable Einkunftsarten (ADR-028/032/033), e.g. from `gatedEinkunftsarten`. */
  readonly gegated: readonly Einkunftsart[]
}

/**
 * The honest fold result. `bestimmt` is reachable ONLY when nothing is open, conflicting
 * or gated; otherwise `offen` names exactly what stands in the way. The three buckets
 * (`einnahmen`, `vorsorgeaufwand`, `anrechnung`) are each the sum of SETTLED Posten of that
 * role only — a partial truth stated as a partial truth, never inflated into a point value
 * (ADR-015/032). Vorsorgeaufwand is reported separately, never subtracted here (see `Rolle`).
 */
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
      readonly gegated: readonly Einkunftsart[]
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

function rolleVon(posten: Posten): Rolle {
  return posten.rolle ?? 'einnahme'
}

/** Fold the Posten by role: three determined buckets, or an honest "offen" result naming what blocks it. */
export function berechne(input: BerechnungsInput): Berechnungsstand {
  validate(input)
  let einnahmen = 0
  let vorsorgeaufwand = 0
  let anrechnung = 0
  for (const posten of input.posten) {
    switch (rolleVon(posten)) {
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
  }
  const offen = input.offenePosten > 0 || input.konflikte.length > 0 || input.gegated.length > 0
  if (!offen) return { kind: 'bestimmt', einnahmen, vorsorgeaufwand, anrechnung }
  return {
    kind: 'offen',
    einnahmen,
    vorsorgeaufwand,
    anrechnung,
    offenePosten: input.offenePosten,
    konflikte: input.konflikte.length,
    gegated: input.gegated,
  }
}

export type KonfliktAufloesung =
  | { readonly art: 'quelle-waehlen'; readonly quelle: Quelle; readonly betrag: number }
  | { readonly art: 'wert-korrigieren'; readonly betrag: number }

/**
 * ADR-008 — resolve a conflict into a settled Posten. "Eine Quelle wählen" keeps that
 * source's amount AND its origin; "Wert korrigieren" produces a fresh manual entry (the
 * user typed it, so its origin is 'eingabe'). The discarded source's persistence in the
 * history is the caller's concern (ADR-008: "die verworfene Quelle bleibt im Verlauf") —
 * this function only performs the deterministic resolution.
 */
export function loeseKonflikt(konflikt: PostenKonflikt, aufloesung: KonfliktAufloesung): Posten {
  const quelle: Quelle = aufloesung.art === 'quelle-waehlen' ? aufloesung.quelle : { art: 'eingabe' }
  const betrag = aufloesung.betrag
  if (!Number.isFinite(betrag) || betrag < 0) {
    throw new RangeError('aufloesung.betrag must be a non-negative finite number')
  }
  return { id: konflikt.postenId, einkunftsart: konflikt.einkunftsart, betrag, quelle }
}
