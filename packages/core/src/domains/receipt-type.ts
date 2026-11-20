export const RECEIPT_TYPES = [
  'Lohnausweis',
  'Quellensteuer',
  'Pensionskasse',
  'Saeule3a',
  'Krankenkasse',
  'Familienzulage',
  'Rentenbezugsmitteilung',
  'Steuerbescheinigung',
  'Steuerbescheid',
  // A Rechnung or Quittung of the business (ADR-0101 §6): read into a booking draft, never into a field.
  'Geschaeftsbeleg',
  'Sonstiges',
] as const

export type ReceiptType = (typeof RECEIPT_TYPES)[number]

export function isReceiptType(value: string): value is ReceiptType {
  return (RECEIPT_TYPES as readonly string[]).includes(value)
}
