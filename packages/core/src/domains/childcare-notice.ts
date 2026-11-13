/**
 * The care period from a childcare notice or invoice (Kita, Kindertagespflege, Tagesmutter, Hort), for
 * Anlage Kind Zeile 67 (ADR-0086). A notice states when care starts („ab 01.09.2024“) or a period („vom … bis
 * …“); the year's part of it is what the form asks. The amount paid is not read: a notice states a monthly
 * contribution that may change, and what counts is what was paid.
 */

export interface ChildcarePeriod {
  /** DD.MM.YYYY within the tax year. */
  readonly from: string
  readonly to: string
}

const CHILDCARE = /kindertagespflege|kindertagesst(?:ä|a)tte|\bkita\b|kindergarten|kinderkrippe|\bkrippe\b|tagesmutter|tagesvater|\bhort\b|kinderbetreuung/i
const DATE = String.raw`(\d{1,2})\.(\d{1,2})\.(\d{4})`

export function looksLikeChildcareNotice(text: string): boolean {
  return CHILDCARE.test(text ?? '') && /betreuung|kostenbeitrag|elternbeitrag|geb(?:ü|u)hr|beitrag/i.test(text ?? '')
}

const pad = (n: string) => n.padStart(2, '0')
const stamp = (d: string, m: string, y: string) => Number(y) * 10000 + Number(m) * 100 + Number(d)

export function childcarePeriod(text: string, taxYear: number): ChildcarePeriod | null {
  if (!looksLikeChildcareNotice(text)) return null
  const flat = (text ?? '').replace(/\s+/g, ' ')
  const range = new RegExp(`(?:vom|zeitraum|betreuungszeitraum)\\s*:?\\s*${DATE}\\s*(?:bis|-|–)\\s*${DATE}`, 'i').exec(flat)
  const start = range ?? new RegExp(`(?:ab|ab dem|beginn(?:end)?(?: am)?|seit)\\s*:?\\s*${DATE}`, 'i').exec(flat)
  if (!start) return null
  const yearStart = taxYear * 10000 + 101
  const yearEnd = taxYear * 10000 + 1231
  const from = stamp(start[1]!, start[2]!, start[3]!)
  const to = range ? stamp(range[4]!, range[5]!, range[6]!) : yearEnd
  if (from > yearEnd || to < yearStart) return null
  const fromText = from < yearStart ? `01.01.${taxYear}` : `${pad(start[1]!)}.${pad(start[2]!)}.${start[3]}`
  const toText = !range || to > yearEnd ? `31.12.${taxYear}` : `${pad(range[4]!)}.${pad(range[5]!)}.${range[6]}`
  return { from: fromText, to: toText }
}
