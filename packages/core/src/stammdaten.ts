// The Erklärungs-Stammdaten the Hauptvordruck ESt 1 A asks for beyond name and Steuer-ID
// (ADR-0050: the paper return must be complete, the user only signs). Pure rules, one
// source for the API's validation and the web form, so they cannot drift.

/** Religionsschlüssel per Anleitung zum Hauptvordruck ESt 1 A 2025; "VD" = none / not
 *  subject to church tax. Only the key is stored, never the long name. */
export const RELIGIONSSCHLUESSEL = [
  'VD',
  'EV',
  'RK',
  'AK',
  'FA',
  'FB',
  'FG',
  'FM',
  'FS',
  'IB',
  'IL',
  'IS',
  'IW',
  'JD',
  'JH',
] as const

export type Religionsschluessel = (typeof RELIGIONSSCHLUESSEL)[number]

/** ESt 1 A Zeile 18: the marital states it distinguishes (with a "seit" date except ledig). */
export const FAMILIENSTAENDE = ['ledig', 'verheiratet', 'verwitwet', 'geschieden', 'dauernd-getrennt'] as const

export type Familienstand = (typeof FAMILIENSTAENDE)[number]

export function normalisiereIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** ISO 13616: country code, two check digits, BBAN; mod-97 of the rearranged number is 1.
 *  German IBANs are exactly 22 characters. */
export function istGueltigeIban(value: string): boolean {
  const iban = normalisiereIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if (iban.startsWith('DE') && iban.length !== 22) return false
  const umgestellt = iban.slice(4) + iban.slice(0, 4)
  let rest = 0
  for (const zeichen of umgestellt) {
    const ziffern = /\d/.test(zeichen) ? zeichen : String(zeichen.charCodeAt(0) - 55)
    for (const ziffer of ziffern) rest = (rest * 10 + Number(ziffer)) % 97
  }
  return rest === 1
}

export function istGueltigePlz(value: string): boolean {
  return /^\d{5}$/.test(value)
}

/** A real calendar date as YYYY-MM-DD (rejects 30 February and other non-dates). */
export function istGueltigesDatum(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [jahr, monat, tag] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const datum = new Date(Date.UTC(jahr, monat - 1, tag))
  return datum.getUTCFullYear() === jahr && datum.getUTCMonth() === monat - 1 && datum.getUTCDate() === tag
}
