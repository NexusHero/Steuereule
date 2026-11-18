// One place to read and write calendar dates (ADR-0097, „Darstellung aus einem Modul“): the app stores
// ISO `YYYY-MM-DD`, people type and read German `TT.MM.JJJJ`. Finding dates inside OCR text is a
// different job and stays with the document parsers.

/** A calendar date that exists; month and day count from 1. */
export interface CalendarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** The shape of a stored ISO date, for DTO decorators and zod schemas. Its source is pinned: the owl's tool schemas carry it byte for byte. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
/** The shape of a German date with two-digit day and month, as the API accepts it, for DTO decorators and zod schemas. */
export const GERMAN_DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/

const ISO_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/
const GERMAN_PARTS = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
const ISO_TIMESTAMP_DATE = /^(\d{4}-\d{2}-\d{2})T/

function existing(year: number, month: number, day: number): CalendarDate | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCFullYear(year)
  const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return exists ? { year, month, day } : null
}

/** Reads `YYYY-MM-DD` or `D.M.YYYY` / `DD.MM.YYYY` (whitespace around is ignored); null unless the date exists. */
export function parseDate(text: string): CalendarDate | null {
  const value = text.trim()
  const iso = ISO_PARTS.exec(value)
  if (iso) return existing(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const german = GERMAN_PARTS.exec(value)
  if (german) return existing(Number(german[3]), Number(german[2]), Number(german[1]))
  return null
}

const two = (n: number): string => String(n).padStart(2, '0')

function readDate(date: string | CalendarDate): CalendarDate | null {
  return typeof date === 'string' ? parseDate(date) : date
}

/** A readable date (either form) or a parsed one as `YYYY-MM-DD`; null when the text is no real date. */
export function toIsoDate(date: string): string | null
export function toIsoDate(date: CalendarDate): string
export function toIsoDate(date: string | CalendarDate): string | null {
  const parsed = readDate(date)
  return parsed === null ? null : `${String(parsed.year).padStart(4, '0')}-${two(parsed.month)}-${two(parsed.day)}`
}

/** A readable date (either form) or a parsed one as `TT.MM.JJJJ`; null when the text is no real date. */
export function toGermanDate(date: string): string | null
export function toGermanDate(date: CalendarDate): string
export function toGermanDate(date: string | CalendarDate): string | null {
  const parsed = readDate(date)
  return parsed === null ? null : `${two(parsed.day)}.${two(parsed.month)}.${String(parsed.year).padStart(4, '0')}`
}

/** Exactly `YYYY-MM-DD`, and the date exists. */
export function isIsoDate(text: string): boolean {
  return ISO_PARTS.test(text) && parseDate(text) !== null
}

/** `D.M.YYYY` or `DD.MM.YYYY` (whitespace around is ignored), and the date exists. */
export function isGermanDate(text: string): boolean {
  return GERMAN_PARTS.test(text.trim()) && parseDate(text) !== null
}

/**
 * The age a person reaches in the tax year (year of the tax year minus year of birth), from an ISO
 * date, the date part of an ISO timestamp or a German date; null when unreadable or not 0–120.
 */
export function ageAtEndOfYear(birthDate: string, taxYear: number): number | null {
  const parsed = parseDate(ISO_TIMESTAMP_DATE.exec(birthDate.trim())?.[1] ?? birthDate)
  if (parsed === null) return null
  const age = taxYear - parsed.year
  return age >= 0 && age <= 120 ? age : null
}

/**
 * Today as `YYYY-MM-DD`. By default the day in Germany (Europe/Berlin), which decides deadlines;
 * `'local'` takes the device's own time zone (the latest day a birth date calendar offers).
 */
export function todayIso(now: Date = new Date(), timeZone: string = 'Europe/Berlin'): string {
  if (timeZone === 'local') return toIsoDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() })
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value)
  return toIsoDate({ year: part('year'), month: part('month'), day: part('day') })
}
