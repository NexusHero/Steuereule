export type Belegart =
  | 'Lohnausweis'
  | 'Quellensteuer'
  | 'Pensionskasse'
  | 'Saeule3a'
  | 'Krankenkasse'
  | 'Familienzulage'
  | 'Rentenbezugsmitteilung'
  | 'Steuerbescheinigung'
  | 'Steuerbescheid'
  | 'Sonstiges'

export const BELEGARTEN: readonly Belegart[] = [
  'Lohnausweis',
  'Quellensteuer',
  'Pensionskasse',
  'Saeule3a',
  'Krankenkasse',
  'Familienzulage',
  'Rentenbezugsmitteilung',
  'Steuerbescheinigung',
  'Steuerbescheid',
  'Sonstiges',
]

export function isBelegart(value: string): value is Belegart {
  return (BELEGARTEN as readonly string[]).includes(value)
}
