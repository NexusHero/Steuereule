// Kinder & Anlage Kind (§ 32 EStG, product ADR-031). Pure, deterministic, no I/O.
import { istGueltigesDatum } from './stammdaten.js'

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
  switch (jahr) {
    case 2024:
      return 6384 + 2928 // 9.312 €
    case 2025:
      return 6612 + 2928 // 9.540 €
    case 2026:
      return 6828 + 2928 // 9.756 €
    default:
      return 9540
  }
}

/** Gesetzlicher monatlicher Kindergeldanspruch (§ 66 EStG). */
export function kindergeldAnspruchMonat(jahr: number): number {
  if (jahr >= 2023) return 250
  return 219
}

export interface KinderStand {
  readonly anzahl: number
  readonly kindergeldSumme: number
  readonly freibetragGesamt: number
}

export function kinderStand(kinder: readonly KindDaten[], jahr: number): KinderStand {
  let kindergeldSumme = 0
  for (const k of kinder) {
    kindergeldSumme += k.kindergeld ?? kindergeldAnspruchMonat(jahr) * 12
  }
  return {
    anzahl: kinder.length,
    kindergeldSumme,
    freibetragGesamt: kinder.length * kinderfreibetrag(jahr),
  }
}
