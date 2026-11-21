import type { ReceiptType } from './receipt-type'

/** The folders of the Belege inbox; `alle` is every Beleg and has no kinds of its own. */
export const RECEIPT_FOLDERS = ['einkuenfte', 'vorsorge', 'bescheide', 'weitere'] as const

export type ReceiptFolder = (typeof RECEIPT_FOLDERS)[number]

/** The document kinds each named folder holds; `weitere` is everything else, a Beleg without a kind included. */
export const RECEIPT_FOLDER_KINDS = {
  einkuenfte: ['Lohnausweis', 'Quellensteuer', 'Rentenbezugsmitteilung', 'Familienzulage'],
  vorsorge: ['Pensionskasse', 'Saeule3a', 'Krankenkasse'],
  bescheide: ['Steuerbescheid', 'Steuerbescheinigung'],
} as const satisfies Readonly<Record<Exclude<ReceiptFolder, 'weitere'>, readonly ReceiptType[]>>

export function isReceiptFolder(value: string): value is ReceiptFolder {
  return (RECEIPT_FOLDERS as readonly string[]).includes(value)
}

export function receiptFolderOfKind(kind: string | null | undefined): ReceiptFolder {
  for (const folder of ['einkuenfte', 'vorsorge', 'bescheide'] as const) {
    if ((RECEIPT_FOLDER_KINDS[folder] as readonly string[]).includes(kind ?? '')) return folder
  }
  return 'weitere'
}
