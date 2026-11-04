import { berechne, type BerechnungsInput, type Berechnungsstand } from './berechnung'
import type { Einkunftsart } from './einkunftsarten'
import { UNCERTAINTY_PER_CONFLICT, UNCERTAINTY_PER_ITEM } from './cockpit'

export type CockpitSpanne =
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
  | { readonly kind: 'gated'; readonly summe: number; readonly gegated: readonly Einkunftsart[] }

/** The count-based inputs a caller holds before any Posten objects exist. */
export interface CockpitSpanneEingaben {
  readonly summe: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly Einkunftsart[]
  readonly unbestaetigte?: number
  readonly unbestaetigteSumme?: number
}

function spanneAusZahlen(
  summe: number,
  offenePosten: number,
  konflikte: number,
  gegated: readonly Einkunftsart[],
  unbestaetigte = 0,
  unbestaetigteSumme = 0,
): CockpitSpanne {
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

export function cockpitSpanne(stand: Berechnungsstand): CockpitSpanne {
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

export function cockpitSpanneAusEingaben(eingaben: CockpitSpanneEingaben): CockpitSpanne {
  return spanneAusZahlen(
    eingaben.summe,
    eingaben.offenePosten,
    eingaben.konflikte,
    eingaben.gegated,
    eingaben.unbestaetigte ?? 0,
    eingaben.unbestaetigteSumme ?? 0,
  )
}

export function spanneAusBerechnung(input: BerechnungsInput): CockpitSpanne {
  return cockpitSpanne(berechne(input))
}
