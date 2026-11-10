import { BANK_CODE_TABLE } from './bank-codes.data'
import { normalizeIban } from './master-data'

let index: ReadonlyMap<string, string> | null = null

/** Bank name for a Bankleitzahl, offline from the Bundesbank file (#452 decision 12). */
export function bankNameForBlz(blz: string): string | null {
  index ??= new Map(BANK_CODE_TABLE.split('\n').map((line) => [line.slice(0, 8), line.slice(9)] as const))
  return index.get(blz) ?? null
}

/** A German IBAN carries the BLZ in characters 5–12; other countries are not in the file. */
export function bankNameForIban(raw: string): string | null {
  const iban = normalizeIban(raw)
  if (!/^DE\d{20}$/.test(iban)) return null
  return bankNameForBlz(iban.slice(4, 12))
}
