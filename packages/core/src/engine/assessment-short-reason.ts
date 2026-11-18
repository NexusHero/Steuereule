import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

/**
 * The receipt's short reason under a changed position (ADR-0098 §8): a few words taken from the
 * Finanzamt's Erläuterung by fixed patterns, deterministic, no free text. Null when no pattern fits;
 * the full quote stays one tap away either way. The reason is German like the quote it comes from.
 */
export function shortAssessmentReason(position: string, explanation: string | null, declared: number | null, assessed: number | null): string | null {
  const text = explanation?.replace(/\s+/g, ' ').trim() ?? ''
  if (text === '') return null
  return daysReason(text) ?? kmReason(text) ?? percentReason(position, text) ?? capReason(text) ?? proofReason(text, declared, assessed) ?? burdenReason(text)
}

const NUMBER = String.raw`(\d+(?:,\d+)?)`
// „180 statt 210 Tagen“, „150 statt 210 Homeoffice-Tage“: the unit is the word after the second number.
const A_INSTEAD_OF_B = new RegExp(String.raw`${NUMBER}\s(?:statt|anstatt|anstelle von)\s${NUMBER}\s(\S+)`, 'gi')
// „18 km statt 25 km“: the unit after each number.
const KM_INSTEAD_OF_KM = new RegExp(String.raw`${NUMBER}\s?(?:km|kilometer)\s(?:statt|anstatt)\s${NUMBER}\s?(?:km|kilometer)\b`, 'i')

function insteadOf(text: string, unit: RegExp): [string, string] | null {
  for (const m of text.matchAll(A_INSTEAD_OF_B)) if (unit.test(m[3]!)) return [m[1]!, m[2]!]
  return null
}

function daysReason(text: string): string | null {
  const days = insteadOf(text, /^(?:\p{L}+-)?(?:arbeits|homeoffice|kalender)?tag(?:e|en)?\b/iu)
  return days ? `${days[0]} statt ${days[1]} Tage` : null
}

function kmReason(text: string): string | null {
  const km = KM_INSTEAD_OF_KM.exec(text)
  if (km) return `${km[1]} statt ${km[2]} km`
  const words = insteadOf(text, /^(?:km|kilometer|entfernungskilometer)\b/i)
  return words ? `${words[0]} statt ${words[1]} km` : null
}

const PERCENT = /(?:zu|mit|nur)\s(?:nur\s)?(\d{1,3})\s?%/i
const DEVICES: ReadonlyArray<{ readonly match: RegExp; readonly name: string }> = [
  { match: /mobiltelefon|handy|smartphone|telefon/i, name: 'Handy' },
  { match: /laptop|notebook|computer|\bpc\b|tablet/i, name: 'Computer' },
]

function percentReason(position: string, text: string): string | null {
  const m = PERCENT.exec(text)
  if (!m) return null
  // A device is named only for Arbeitsmittel; „Telefonkosten“ under sonstige Werbungskosten stay generic.
  const device = position.startsWith('arbeitsmittel') ? DEVICES.find((d) => d.match.test(text)) : undefined
  return device ? `${device.name} nur zu ${m[1]} %` : `nur zu ${m[1]} % anerkannt`
}

function capReason(text: string): string | null {
  return /h(?:ö|oe)chstbetrag/i.test(text) ? 'auf Höchstbetrag gekürzt' : null
}

const NO_PROOF = /nicht\s(?:nach)?gewiesen|nicht\sbelegt|ohne\s(?:\S+\s)?(?:nachweis|beleg)|keine[nr]?\s(?:\S+\s)?(?:nachweis|beleg)|mangels\s\S*(?:nachweis|best(?:ä|ae)tigung|beleg)|fehlende[nr]?\s\S*(?:nachweis|beleg)/i

function proofReason(text: string, declared: number | null, assessed: number | null): string | null {
  if (!NO_PROOF.test(text)) return null
  const struck = assessed === 0 || (assessed === null && declared !== null)
  return struck ? 'ohne Nachweis gestrichen' : 'ohne Nachweis gekürzt'
}

function burdenReason(text: string): string | null {
  return /zumutbare[nr]?\sbelastung/i.test(text) ? 'zumutbare Belastung abgezogen' : null
}

/** The next year's counterpart on the receipt: days where the position counts days, else the amount. */
export type NextYearRepeat = { readonly year: number; readonly days: number } | { readonly year: number; readonly amount: number }

/**
 * „2025 wieder 210 erklärt“ (ADR-0098 §8): only when the next year again declares more than this
 * Bescheid recognised. A Homeoffice amount turns into days at that year's daily rate when it divides
 * evenly; otherwise, and for every other position, the amount stays.
 */
export function nextYearRepeat(
  position: string,
  nextYear: { readonly year: number; readonly declared: number | null; readonly declaredAboveRecognised: boolean | null } | null,
): NextYearRepeat | null {
  if (nextYear === null || nextYear.declared === null || nextYear.declaredAboveRecognised !== true) return null
  const { year, declared } = nextYear
  if (position.startsWith('homeoffice') && isSupportedIncomeTaxYear(year)) {
    const rate = getTaxYearParameters(year).homeOffice.dailyRateEur
    if (declared % rate === 0) return { year, days: declared / rate }
  }
  return { year, amount: declared }
}
