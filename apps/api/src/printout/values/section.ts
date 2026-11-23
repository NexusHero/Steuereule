import type { FieldValues } from '../form-renderer.js'
import type { ChildGapField } from './children.js'
import type { PersonBFacts, PrintoutFacts } from './facts.js'

/** Field values of one form, by field id; built up while a section is assembled. */
export type Fields = Record<string, string | true>

/**
 * What one form section or Anlage contributes to the printout. `printoutValues` merges the sections in
 * a fixed order: values and instances by field id and form, the gaps appended as each section names them.
 */
export interface Section {
  readonly values?: Fields
  readonly instances?: Readonly<Record<string, FieldValues[]>>
  readonly missing?: readonly string[]
  /** Which details of the children stand behind a „kinder“ gap. */
  readonly childFields?: readonly ChildGapField[]
}

/** A whole number as typed, or null (empty, „unklar“, anything else). */
export const integer = (value: string | null): number | null => (value !== null && /^\d+$/.test(value) ? Number(value) : null)

export const optionalNumber = (value: string | null): number | undefined => {
  const number = integer(value)
  return number === null ? undefined : number
}

/** The amount as typed when it is whole euros, else null. */
export const wholeEuros = (value: string | null | undefined): string | null => (value != null && /^\d+$/.test(value) ? value : null)

export const isJoint = (facts: PrintoutFacts): boolean => facts.link?.filingType === 'zusammen'

/** Person B when the couple files jointly; in a separate return B is on no form of A. */
export const jointPersonB = (facts: PrintoutFacts): PersonBFacts | null => (isJoint(facts) ? facts.link?.personB ?? null : null)

/** The German wage of Person A and of a jointly filing Person B, each when it is whole euros. */
export function germanWages(facts: PrintoutFacts): { readonly a: string | null; readonly b: string | null } {
  return { a: wholeEuros(facts.bruttoarbeitslohn), b: wholeEuros(jointPersonB(facts)?.bruttoarbeitslohn) }
}

/** The head of every Anlage: name, first name and Steuernummer, each only when known. */
export function formHeader(
  prefix: string,
  person: { readonly lastName: string | null | undefined; readonly firstName: string | null | undefined },
  steuernummer: string | null,
  firstNameField = 'vorname',
): Fields {
  const values: Fields = {}
  if (person.lastName) values[`${prefix}.name`] = person.lastName
  if (person.firstName) values[`${prefix}.${firstNameField}`] = person.firstName
  if (steuernummer) values[`${prefix}.steuernummer`] = steuernummer
  return values
}
