import { lookupPostalCode, type FieldSpec } from '@steuereule/core'

/**
 * How the user's assistant reads a field back (ADR-0052 amendment 3): amounts and choices in plain,
 * everything that identifies a person only derived or as "set". It writes exact values and reads
 * derived ones, its own included.
 */
export type ReadMode = 'plain' | 'set' | 'age' | 'state' | 'churchTaxLiable'

/** Personal fields that are tax facts, not identifiers: readable as they are. */
const PLAIN_PERSONAL: ReadonlySet<string> = new Set(['stammdaten.familienstand', 'stammdaten.kirchensteuerpflichtig', 'kopplung.filingType'])

/** Value kinds that can carry a name, an address or an identifier whatever the field is called. */
const NEVER_PLAIN_KINDS: ReadonlySet<FieldSpec['value']['kind']> = new Set(['text', 'iban', 'digits', 'bookingDraft'])

export function readModeOf(spec: FieldSpec): ReadMode {
  const key = `${spec.screen}.${spec.field}`
  if (spec.field === 'geburtsdatum') return 'age'
  if (key === 'stammdaten.plz') return 'state'
  if (key === 'stammdaten.religion') return 'churchTaxLiable'
  if (PLAIN_PERSONAL.has(key)) return 'plain'
  if (spec.personal || NEVER_PLAIN_KINDS.has(spec.value.kind)) return 'set'
  return 'plain'
}

/** Age on 31 December of the tax year, from an ISO or a German date; null when there is none. */
export function ageAtYearEnd(date: string | null | undefined, taxYear: number): number | null {
  const year = date?.match(/^(\d{4})-\d{2}-\d{2}$/)?.[1] ?? date?.match(/^\d{2}\.\d{2}\.(\d{4})$/)?.[1]
  if (year === undefined) return null
  const age = taxYear - Number(year)
  return age >= 0 && age < 130 ? age : null
}

/** The Bundesland of a postal code; null when unknown or when the code spans two Länder. */
export function stateOfPostalCode(plz: string | null | undefined): string | null {
  if (!plz) return null
  const lookup = lookupPostalCode(plz)
  if (lookup.kind !== 'found') return null
  const states = new Set(lookup.places.map((place) => place.state))
  return states.size === 1 ? [...states][0]! : null
}

/** Whether a confession key means church tax: VD is none, any other key a member; empty is unknown. */
export function churchTaxLiableFrom(religion: string | null | undefined): boolean | null {
  if (religion === null || religion === undefined || religion.trim() === '') return null
  return religion !== 'VD'
}

/** One value as the assistant may see it. */
export function readView(spec: FieldSpec, raw: string | null, taxYear: number): Record<string, unknown> {
  const empty = raw === null || raw === ''
  switch (readModeOf(spec)) {
    case 'plain':
      return { wert: empty ? null : raw }
    case 'age':
      return { gesetzt: !empty, alterJahre: ageAtYearEnd(raw, taxYear) }
    case 'state':
      return { gesetzt: !empty, bundesland: stateOfPostalCode(raw) }
    case 'churchTaxLiable':
      return { gesetzt: !empty, kirchensteuerpflichtig: churchTaxLiableFrom(raw) }
    case 'set':
      return { gesetzt: !empty }
  }
}
