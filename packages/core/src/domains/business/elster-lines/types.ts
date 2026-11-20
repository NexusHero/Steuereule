import type { EuerKey } from '../euer-keys'

/** The forms of the ELSTER fill-in help for the self-employed (ADR-0101 §16). */
export const ELSTER_FORMS = [
  'anlage-euer',
  'anlage-s',
  'anlage-g',
  'ust-2-a',
  'gewst-1-a',
  'est-1-a',
  'anlage-sonstiges',
] as const
export type ElsterForm = (typeof ELSTER_FORMS)[number]

/** The tax years the app offers (ADR-0101 §4). */
export const ELSTER_YEARS = [2022, 2023, 2024, 2025, 2026] as const
export type ElsterYear = (typeof ELSTER_YEARS)[number]

/** One row as read from the PDF by scripts/elster-lines; `kz` left to right as printed. */
export interface ExtractedLine {
  readonly id: string
  readonly zeile: string | null
  readonly kz: readonly string[]
  readonly label: string
}

/** A line of a form in one tax year: what the user finds in Mein ELSTER. */
export interface ElsterLine {
  /** Stable across years for the same meaning (e.g. `euer.ausgaben.kz280`, `ust.umsatz-19`). */
  readonly id: string
  readonly form: ElsterForm
  readonly year: ElsterYear
  /**
   * The Zeile as printed, a string because some years number "96a". `null` where the only official
   * source names the field but not its Zeile (the ELSTER help of the Gewerbesteuererklärung).
   */
  readonly zeile: string | null
  /** The Kennzahlen of the line, left to right ("nicht abziehbar" before "abziehbar"); empty when the form has none. */
  readonly kennzahlen: readonly string[]
  /** The German label as printed on the official form. */
  readonly label: string
  /** For Anlage EÜR lines: the EÜR keys whose amounts sum into this line. */
  readonly euerKeys: readonly EuerKey[]
}

/** Where a published year's lines were read from: the official PDF, or the ELSTER help page. */
export interface ElsterFormSource {
  readonly url: string
  /** Of the PDF; for an ELSTER help page, of its extracted text (the page itself carries per-request tokens). */
  readonly sha256: string
}

/**
 * Why a form year has no lines. `not_published`: the publisher has not released the year yet.
 * `not_available`: the form exists in ELSTER but no official copy with line numbers is public, so
 * the app cannot show its lines without guessing.
 */
export type ElsterLinesResult =
  | { readonly status: 'published'; readonly lines: readonly ElsterLine[]; readonly source: ElsterFormSource }
  | { readonly status: 'not_published'; readonly latestPublishedYear: ElsterYear | null }
  | { readonly status: 'not_available'; readonly reason: 'electronic_only' }

export type EuerLineResult =
  | { readonly status: 'published'; readonly line: ElsterLine }
  | { readonly status: 'not_published'; readonly latestPublishedYear: ElsterYear | null }
