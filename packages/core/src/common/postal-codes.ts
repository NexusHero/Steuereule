import { POSTAL_CODE_TABLE } from './postal-codes.data'
import { GERMAN_STATES } from './public-holidays'

/**
 * PLZ → Ort and Bundesland from the bundled OpenStreetMap table (#451 slice 3). Pure and offline:
 * the postal code never leaves the device (decision 7).
 */
export type GermanState = (typeof GERMAN_STATES)[number]

export interface PostalCodePlace {
  readonly city: string
  readonly state: GermanState
}

export type PostalCodeLookup =
  | { readonly kind: 'found'; readonly places: readonly PostalCodePlace[] }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unknown' }

let index: ReadonlyMap<string, readonly PostalCodePlace[]> | null = null

function isGermanState(value: string): value is GermanState {
  return (GERMAN_STATES as readonly string[]).includes(value)
}

function buildIndex(): ReadonlyMap<string, readonly PostalCodePlace[]> {
  const map = new Map<string, readonly PostalCodePlace[]>()
  for (const line of POSTAL_CODE_TABLE.split('\n')) {
    const [plz, rest] = line.split('=')
    if (!plz || !rest) continue
    const places = rest.split('|').flatMap((entry) => {
      const [city, state] = entry.split('~')
      return city && state && isGermanState(state) ? [{ city, state }] : []
    })
    map.set(plz, places)
  }
  return map
}

export function lookupPostalCode(raw: string): PostalCodeLookup {
  const plz = raw.trim()
  if (!/^\d{5}$/.test(plz)) return { kind: 'invalid' }
  index ??= buildIndex()
  const places = index.get(plz)
  return places && places.length > 0 ? { kind: 'found', places } : { kind: 'unknown' }
}

/** Kirchensteuersatz by Bundesland of residence (§ 51a EStG with the state church tax laws). */
export function churchTaxRateForState(state: GermanState): 0.08 | 0.09 {
  return state === 'BY' || state === 'BW' ? 0.08 : 0.09
}
