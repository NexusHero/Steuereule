/**
 * The care period from a childcare notice or invoice (Kita, Kindertagespflege, Tagesmutter, Hort), for
 * Anlage Kind Zeile 67 (ADR-0086). A notice states when care starts („ab 01.09.2024“) or a period („vom … bis
 * …“); the year's part of it is what the form asks. A monthly contribution is not an amount paid (it may
 * change); only a sum the document states as paid for the year is read (`childcarePaidInYear`).
 */
import { foldName } from './ch-salary-certificate-parser'

export interface ChildcarePeriod {
  /** DD.MM.YYYY within the tax year. */
  readonly from: string
  readonly to: string
}

const CHILDCARE = /kindertagespflege|kindertagesst(?:ä|a)tte|\bkita\b|kindergarten|kinderkrippe|\bkrippe\b|tagesmutter|tagesvater|\bhort\b|kinderbetreuung/i
const DATE = String.raw`(\d{1,2})\.(\d{1,2})\.(\d{4})`

export function looksLikeChildcareNotice(text: string): boolean {
  return CHILDCARE.test(text ?? '') && /betreuung|kostenbeitr|elternbeitr|geb(?:ü|u)hr|beitr(?:a|ä)g/i.test(text ?? '')
}

const pad = (n: string) => n.padStart(2, '0')
const stamp = (d: string, m: string, y: string) => Number(y) * 10000 + Number(m) * 100 + Number(d)

export function childcarePeriod(text: string, taxYear: number): ChildcarePeriod | null {
  if (!looksLikeChildcareNotice(text)) return null
  const flat = (text ?? '').replace(/\s+/g, ' ')
  const range = new RegExp(`(?:vom|zeitraum|betreuungszeitraum)\\s*:?\\s*${DATE}\\s*(?:bis|-|–)\\s*${DATE}`, 'i').exec(flat)
  const start = range ?? new RegExp(`(?:ab|ab dem|beginn(?:end)?(?: am)?|seit)\\s*:?\\s*${DATE}`, 'i').exec(flat)
  if (!start) return null
  // A start often comes with a limit further on: „befristet bis 31.05.2025“, „bis zum 31.07.2025“.
  const limit = range ? null : new RegExp(`(?:befristet|längstens|laengstens|endet)?\\s*bis\\s*(?:zum|einschließlich|einschliesslich)?\\s*${DATE}`, 'i').exec(flat.slice(start.index + start[0].length))
  const yearStart = taxYear * 10000 + 101
  const yearEnd = taxYear * 10000 + 1231
  const from = stamp(start[1]!, start[2]!, start[3]!)
  const end = range ? [range[4]!, range[5]!, range[6]!] : limit ? [limit[1]!, limit[2]!, limit[3]!] : null
  const to = end ? stamp(end[0]!, end[1]!, end[2]!) : yearEnd
  if (from > yearEnd || to < yearStart) return null
  const fromText = from < yearStart ? `01.01.${taxYear}` : `${pad(start[1]!)}.${pad(start[2]!)}.${start[3]}`
  const toText = !end || to > yearEnd ? `31.12.${taxYear}` : `${pad(end[0]!)}.${pad(end[1]!)}.${end[2]}`
  return { from: fromText, to: toText }
}

/**
 * Which child a notice is about when there are several: the one whose first name(s) the notice prints; with
 * none or more than one fitting, null (the user is asked). The names stay on the server.
 */
export function childNamedIn(text: string, children: readonly { readonly id: string; readonly firstName: string }[]): string | null {
  if (children.length === 1) return children[0]!.id
  const printed = new Set(foldName(text ?? ''))
  const fits = children.filter((c) => {
    const names = foldName(c.firstName)
    return names.length > 0 && names.every((n) => printed.has(n))
  })
  return fits.length === 1 ? fits[0]!.id : null
}

/** „1.200,00 EUR“, „960 €“ in whole euros. */
const EUROS = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(?:€|eur\b|euro\b)/i

/**
 * What a Kita's annual statement says was paid for the tax year: a line naming the year's total
 * („Gesamt 2025“, „im Jahr 2025 gezahlt“, „Jahresbetrag“, „Summe der Elternbeiträge 2025“). A monthly
 * contribution („monatlich“) is never taken for it. Null when no such line is printed.
 */
export function childcarePaidInYear(text: string, taxYear: number): number | null {
  if (!looksLikeChildcareNotice(text)) return null
  for (const line of (text ?? '').split('\n')) {
    if (/monatlich|pro monat|je monat/i.test(line)) continue
    const total = /gesamt|summe|jahresbetrag|insgesamt|gezahlt|entrichtet/i.test(line)
    if (!total || !(new RegExp(`\\b${taxYear}\\b`).test(line) || /jahresbetrag|im jahr/i.test(line))) continue
    const m = EUROS.exec(line.replace(new RegExp(`\\b${taxYear}\\b`, 'g'), ''))
    if (m) return Math.round(Number(m[1]!.replace(/\./g, '')) + Number(m[2] ?? '0') / 100)
  }
  return null
}
