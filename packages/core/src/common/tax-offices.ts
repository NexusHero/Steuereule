import { TAX_OFFICE_NAMES, TAX_OFFICE_TABLE } from './tax-offices.data'

let index: ReadonlyMap<string, readonly string[]> | null = null

function build(): ReadonlyMap<string, readonly string[]> {
  const names = TAX_OFFICE_NAMES.split('|')
  return new Map(
    TAX_OFFICE_TABLE.split('\n').map((line) => {
      const offices = line.slice(6).split(',').map((code) => `Finanzamt ${names[parseInt(code, 36)]}`)
      return [line.slice(0, 5), offices] as const
    }),
  )
}

/**
 * The Finanzämter the BZSt directory (GemFA) names for a postal code, offline. One name for most
 * postal codes; several where a postal code is split between offices by street — the directory's
 * street ranges are not shipped, so the user picks. Empty for an unknown or incomplete postal code.
 * A suggestion, not a ruling: the name on the last Steuerbescheid is what counts.
 */
export function suggestTaxOffices(postalCode: string): readonly string[] {
  if (!/^\d{5}$/.test(postalCode)) return []
  index ??= build()
  return index.get(postalCode) ?? []
}
