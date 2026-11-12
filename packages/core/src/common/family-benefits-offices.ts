import type { GermanState } from './postal-codes'

/**
 * Regional Familienkassen of the Bundesagentur für Arbeit, as named on arbeitsagentur.de
 * (checked 11.11.2026; Bayern Süd via its Wikipedia entry). The BA counts fifteen; the fifteenth
 * name could not be confirmed, and employees of some public employers have a Familienkasse of
 * their own — so this list only ever feeds suggestions, the field stays free text.
 *
 * `states` follows from the office's name. Which office of a state with several (BW, BY, NW) is
 * responsible depends on the Agentur district, which the app does not know: all are offered.
 */
export interface FamilyBenefitsOffice {
  readonly name: string
  readonly states: readonly GermanState[]
}

export const FAMILY_BENEFITS_OFFICES: readonly FamilyBenefitsOffice[] = [
  { name: 'Familienkasse Baden-Württemberg Ost', states: ['BW'] },
  { name: 'Familienkasse Baden-Württemberg West', states: ['BW'] },
  { name: 'Familienkasse Bayern Nord', states: ['BY'] },
  { name: 'Familienkasse Bayern Süd', states: ['BY'] },
  { name: 'Familienkasse Berlin-Brandenburg', states: ['BE', 'BB'] },
  { name: 'Familienkasse Hessen', states: ['HE'] },
  { name: 'Familienkasse Niedersachsen-Bremen', states: ['NI', 'HB'] },
  { name: 'Familienkasse Nord', states: ['HH', 'SH', 'MV'] },
  { name: 'Familienkasse Nordrhein-Westfalen Nord', states: ['NW'] },
  { name: 'Familienkasse Nordrhein-Westfalen Ost', states: ['NW'] },
  { name: 'Familienkasse Nordrhein-Westfalen West', states: ['NW'] },
  { name: 'Familienkasse Rheinland-Pfalz-Saarland', states: ['RP', 'SL'] },
  { name: 'Familienkasse Sachsen', states: ['SN'] },
  { name: 'Familienkasse Sachsen-Anhalt-Thüringen', states: ['ST', 'TH'] },
]

/** The offices to suggest for an address: those of its Bundesland, or all when the state is unknown. */
export function familyBenefitsOfficesForState(state: GermanState | null): readonly string[] {
  const matching = state === null ? FAMILY_BENEFITS_OFFICES : FAMILY_BENEFITS_OFFICES.filter((office) => office.states.includes(state))
  return matching.map((office) => office.name)
}
