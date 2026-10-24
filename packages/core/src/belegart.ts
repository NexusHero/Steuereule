// The Beleg-Posteingang's document-type vocabulary. ADR-029 rules that the CH-Lohnausweis
// is its own Dokumenttyp (neben LStB), and lists the CH sources this vertical ingests:
// Lohnausweis, Quellensteuer-Beleg, PK-Nachweis (2. Säule), Säule-3a-Nachweis, CH-Krankenkasse,
// Familienzulagen. The existing Beleg (ADR-007/008) was generic — a dateiname + dates; this
// adds the discriminator that lets the inbox and the mapping distinguish WHAT landed. The
// German values are the persisted domain vocabulary (ADR-0033 citation form, same as
// Einkunftsart's German terms); German UI labels stay in i18n, never here.
//
// The union is deliberately EXTENSIBLE: the Angestellten vertical (t08) adds its own
// document types (e.g. LStB) alongside these — nothing here is renamed or removed, and the
// set is shared, so the two verticals land on ONE vocabulary rather than two.

export type Belegart =
  | 'Lohnausweis' // CH-Lohnausweis (ADR-029 point 1 — Ziffern 1–15)
  | 'Quellensteuer' // Quellensteuer-Abrechnung / -Beleg
  | 'Pensionskasse' // Nachweis berufliche Vorsorge (2. Säule)
  | 'Saeule3a' // Nachweis gebundene Selbstvorsorge (Säule 3a, Formular 21 EDP)
  | 'Krankenkasse' // CH-Krankenkassen-Nachweis (Basisvorsorge)
  | 'Familienzulage' // Familienzulagen-Nachweis (Kinderzulage)
  | 'Rentenbezugsmitteilung' // Rentenbezugsmitteilung (product ADR-034 — the Rentner vertical's Beleg)
  | 'Steuerbescheid' // der Steuerbescheid (ticket 10.3) — das Bescheid-PDF landet hier; Beträge manuell (ADR-036)
  | 'Sonstiges' // explicitly classified generic receipt — NOT `null`, which is "not yet classified"

/** Canonical order for display — `BELEGARTEN` returned in this order, a deterministic array. */
export const BELEGARTEN: readonly Belegart[] = [
  'Lohnausweis',
  'Quellensteuer',
  'Pensionskasse',
  'Saeule3a',
  'Krankenkasse',
  'Familienzulage',
  'Rentenbezugsmitteilung',
  'Steuerbescheid',
  'Sonstiges',
]

/** Total over `string`: is `value` a declared Belegart? (mirrors isEinkunftsart's totalism). */
export function isBelegart(value: string): value is Belegart {
  return (BELEGARTEN as readonly string[]).includes(value)
}
