import type { PickedAddress } from '../shared/AddressSearch'

/** The postal code at the start of a „PLZ Ort“ line, or empty when there is none. */
export function postalCodeFrom(plzOrt: string): string {
  const plzMatch = /^(\d{4,5})/.exec(plzOrt.trim())
  return plzMatch ? plzMatch[1]! : ''
}

/** The street and city lines of an address picked from the search. */
export function addressLines(address: PickedAddress): { readonly streetLine: string; readonly cityLine: string } {
  const streetLine = `${address.street}${address.houseNumber ? ` ${address.houseNumber}${address.houseNumberSuffix ?? ''}` : ''}`
  const cityLine = `${address.postalCode} ${address.city}`
  return { streetLine, cityLine }
}
