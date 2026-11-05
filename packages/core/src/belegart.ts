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

export function isReceiptType(value: string): value is ReceiptType {
  return (RECEIPT_TYPES as readonly string[]).includes(value)
}
