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
  'Sonstiges',
] as const

export type ReceiptType = (typeof RECEIPT_TYPES)[number]
export type Belegart = ReceiptType
export const BELEGARTEN = RECEIPT_TYPES

export function isReceiptType(value: string): value is ReceiptType {
  return (RECEIPT_TYPES as readonly string[]).includes(value)
}

// Backward-compatibility aliases
export { isReceiptType as isBelegart }
