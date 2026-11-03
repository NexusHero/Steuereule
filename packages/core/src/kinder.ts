// Kinder & Anlage Kind (§ 32 EStG, product ADR-031). Pure, deterministic, no I/O.
import { istGueltigesDatum } from './stammdaten.js'

/** Anlage Kind Zeile 10: 1 = leibliches Kind / Adoptivkind, 2 = Pflegekind, 3 = Enkelkind / Stiefkind. */
export const KINDSCHAFTSVERHAELTNISSE = ['1', '2', '3'] as const
export type Kindschaftsverhaeltnis = (typeof KINDSCHAFTSVERHAELTNISSE)[number]

export interface KindDaten {
  readonly id: string
  readonly vorname: string
  readonly nachname: string
  readonly geburtsdatum: string
  readonly steuerId: string | null
  readonly kindergeld: number | null
}

export function istGueltigesKindGeburtsdatum(datum: string, steuerjahr: number): boolean {
  if (!istGueltigesDatum(datum)) return false
  const jahr = Number(datum.split('-')[0])
  return !Number.isNaN(jahr) && jahr <= steuerjahr
}

/**
 * Kinderfreibetrag inkl. Freibetrag für Betreuungs-, Erziehungs- und Ausbildungsbedarf (BEA)
 * gemäß § 32 Abs. 6 EStG (Zusammenveranlagung bzw. beide Elternteile zusammen).
 */
export function kinderfreibetrag(jahr: number): number {
  const bea = 2928
  if (jahr <= 2023) return 6024 + bea
  if (jahr === 2024) return 6612 + bea
  if (jahr === 2025) return 6672 + bea
  return 6828 + bea
}

/** Gesetzlicher monatlicher Kindergeldanspruch (§ 66 Abs. 1 EStG). */
export function kindergeldAnspruchMonat(jahr: number): number {
  if (jahr <= 2022) return 219
  if (jahr <= 2024) return 250
  if (jahr === 2025) return 255
  return 259
}

/** Months of the year the child counts for: from the birth month on (§ 32 Abs. 6 Satz 5, § 66 Abs. 2). */
export function anspruchsMonate(geburtsdatum: string, jahr: number): number {
  const [geburtsjahr, monat] = geburtsdatum.split('-').map(Number)
  if (geburtsjahr! < jahr) return 12
  if (geburtsjahr! > jahr) return 0
  return 13 - monat!
}

export interface KinderStand {
  readonly anzahl: number
  readonly kindergeldSumme: number
  readonly freibetragGesamt: number
}

export function kinderStand(kinder: readonly KindDaten[], jahr: number): KinderStand {
  let kindergeldSumme = 0
  let freibetragGesamt = 0
  for (const k of kinder) {
    const monate = anspruchsMonate(k.geburtsdatum, jahr)
    kindergeldSumme += k.kindergeld ?? kindergeldAnspruchMonat(jahr) * monate
    freibetragGesamt += Math.round((kinderfreibetrag(jahr) * monate) / 12)
  }
  return { anzahl: kinder.length, kindergeldSumme, freibetragGesamt }
}
