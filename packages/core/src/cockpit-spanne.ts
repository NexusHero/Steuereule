import { calculate, type BerechnungsInput, type Berechnungsstand } from './berechnung'
import type { IncomeType } from './einkunftsarten'
import { UNCERTAINTY_PER_CONFLICT, UNCERTAINTY_PER_ITEM } from './cockpit'

export type CockpitRange =
  | { readonly kind: 'bestimmt'; readonly wert: number }
  | {
      readonly kind: 'spanne'
      readonly von: number
      readonly bis: number
      readonly offenePosten: number
      readonly konflikte: number
      readonly unbestaetigte: number
      readonly unbestaetigteSumme: number
    }
  | { readonly kind: 'gated'; readonly summe: number; readonly gegated: readonly IncomeType[] }

/** The count-based inputs a caller holds before any Posten objects exist. */
export interface CockpitRangeInputs {
  readonly summe: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly IncomeType[]
  readonly unbestaetigte?: number
  readonly unbestaetigteSumme?: number
}

function spanneAusZahlen(
  summe: number,
  offenePosten: number,
  konflikte: number,
  gegated: readonly IncomeType[],
  unbestaetigte = 0,
  unbestaetigteSumme = 0,
): CockpitRange {
  if (gegated.length > 0) return { kind: 'gated', summe, gegated }
  if (offenePosten === 0 && konflikte === 0 && unbestaetigte === 0) return { kind: 'bestimmt', wert: summe }

  const uncertainty = offenePosten * UNCERTAINTY_PER_ITEM + konflikte * UNCERTAINTY_PER_CONFLICT + unbestaetigteSumme
  return {
    kind: 'spanne',
    von: Math.max(0, summe - uncertainty),
    bis: summe + uncertainty,
    offenePosten,
    konflikte,
    unbestaetigte,
    unbestaetigteSumme,
  }
}

export function calculateCockpitRange(stand: Berechnungsstand): CockpitRange {
  if (stand.kind === 'bestimmt') return { kind: 'bestimmt', wert: stand.einnahmen }
  return spanneAusZahlen(
    stand.einnahmen,
    stand.offenePosten,
    stand.konflikte,
    stand.gegated,
    stand.unbestaetigte,
    stand.unbestaetigteSumme,
  )
}

export function cockpitRangeFromInputs(eingaben: CockpitRangeInputs): CockpitRange {
  return spanneAusZahlen(
    eingaben.summe,
    eingaben.offenePosten,
    eingaben.konflikte,
    eingaben.gegated,
    eingaben.unbestaetigte ?? 0,
    eingaben.unbestaetigteSumme ?? 0,
  )
}

export function rangeFromCalculation(input: BerechnungsInput): CockpitRange {
  return calculateCockpitRange(calculate(input))
}

// Backward-compatibility aliases
