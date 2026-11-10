import { lookupPostalCode, type GermanState } from '@steuereule/core'

/**
 * PLZ → Ort prefill rules (#451 slice 3, decision 9): a postal code with exactly one place fills an
 * empty Ort and marks it as "aus deiner PLZ"; it may replace an Ort it filled itself, never one the
 * user typed. Several places are offered as a choice instead.
 */
export interface CityPrefillInput {
  readonly plz: string
  readonly city: string
  /** The Ort this helper filled last time, or null if the user owns the field. */
  readonly lastPrefill: string | null
}

export interface CityPrefill {
  readonly city: string
  readonly prefill: string | null
}

export function prefillCity({ plz, city, lastPrefill }: CityPrefillInput): CityPrefill {
  const userOwnsCity = city.trim() !== '' && city !== lastPrefill
  const result = lookupPostalCode(plz)
  if (userOwnsCity || result.kind !== 'found' || result.places.length !== 1) {
    return { city, prefill: userOwnsCity ? null : city === lastPrefill ? lastPrefill : null }
  }
  const only = result.places[0]!.city
  return { city: only, prefill: only }
}

/** The Bundesland of an address: the chosen place's, or the only one the postal code touches. */
export function stateForAddress(plz: string, city: string): GermanState | null {
  const result = lookupPostalCode(plz)
  if (result.kind !== 'found') return null
  const wanted = city.trim().toLocaleLowerCase('de')
  const match = result.places.find((p) => p.city.toLocaleLowerCase('de') === wanted)
  if (match) return match.state
  const states = new Set(result.places.map((p) => p.state))
  return states.size === 1 ? result.places[0]!.state : null
}
