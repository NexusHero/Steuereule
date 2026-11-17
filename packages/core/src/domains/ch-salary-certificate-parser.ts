import type { SalaryCertificateAmountFieldId } from './cross-border'

/**
 * Reads the Swiss salary certificate (Lohnausweis, Form 11) from the text a device produced: a PDF
 * text layer or OCR of a scan. The form is the same for every employer, so a fixed rule reads it;
 * a model only fills what the rule could not find (`applyChCertificateTextFallback`).
 *
 * The rule checks itself with the form's own sums: Ziffer 8 = 1 to 7, Ziffer 11 = 8 − 9 − 10.
 * Name, address, AHV number, birth date and employer are never part of an amount and never reach the
 * model (`selectChCertificateRelevantLines`); the holder's name is read only to find out whose
 * certificate it is (`certificateHolderPerson`).
 */

export type ChCertificateFieldStatus = 'ok' | 'pruefen'
export type ChCertificateFieldReason = 'negative' | 'plausibility_conflict' | 'llm_suggested' | null

export interface ChCertificateField {
  readonly value: number
  readonly status: ChCertificateFieldStatus
  readonly reason: ChCertificateFieldReason
}

export type ChCertificateCheck = 'ok' | 'conflict' | 'unknown'

export interface ChCertificateRead {
  readonly taxYear: number | null
  readonly period: { readonly from: string; readonly to: string } | null
  /** Box G: canteen or lunch cheques. */
  readonly canteen: boolean
  /** Box F: free transport between home and work. */
  readonly freeTransport: boolean
  /** The name line of box H, only to find out whose certificate it is; never stored or sent. */
  readonly holder: string | null
  /** CHF as printed, whole francs; negative where the certificate prints a negative figure. */
  readonly amounts: Partial<Record<SalaryCertificateAmountFieldId, number>>
  readonly fields: Partial<Record<SalaryCertificateAmountFieldId, ChCertificateField>>
  /** Kinder-, Ausbildungs- or Familienzulagen the remarks (Ziffer 15) name, CHF: Anlage N-Gre Z. 8 (ADR-0088). */
  readonly familyAllowancesChf: number | null
  /** Ziffer 10.1 and 10.2; `berufliche-vorsorge` is their sum. */
  readonly pension: { readonly ordinary: number | null; readonly buyIn: number | null }
  readonly checks: { readonly gross: ChCertificateCheck; readonly net: ChCertificateCheck }
  /** The Ziffern every certificate carries that the text did not give. */
  readonly missing: readonly SalaryCertificateAmountFieldId[]
}

const DIGIT_IDS: Readonly<Record<number, SalaryCertificateAmountFieldId>> = {
  1: 'lohn',
  2: 'gehaltsnebenleistungen',
  3: 'unregelmaessige-leistungen',
  4: 'kapitalleistungen',
  5: 'beteiligungsrechte',
  6: 'sitzungsgelder',
  7: 'andere-leistungen',
  8: 'bruttolohn-total',
  9: 'ahv-beitraege',
  10: 'berufliche-vorsorge',
  11: 'nettolohn',
  12: 'quellensteuer',
  13: 'spesen',
  14: 'weitere-nebenleistungen',
}

/** Every certificate prints these; one that is missing makes the read incomplete. */
const EXPECTED: readonly SalaryCertificateAmountFieldId[] = ['lohn', 'bruttolohn-total', 'ahv-beitraege', 'berufliche-vorsorge', 'nettolohn', 'quellensteuer']

/**
 * Deductions are printed with a "−": Ziffer 9 and 10 in their sign column, Ziffer 12 (withholding tax)
 * often right against the figure ("-896"). A minus there is no negative figure.
 */
const DEDUCTIONS: ReadonlySet<number> = new Set([9, 10, 12])

const GROSS_PARTS: readonly SalaryCertificateAmountFieldId[] = [
  'lohn',
  'gehaltsnebenleistungen',
  'unregelmaessige-leistungen',
  'kapitalleistungen',
  'beteiligungsrechte',
  'sitzungsgelder',
  'andere-leistungen',
]

/** The last amount of a line: "119.580", "19'900", "-118", "377,55". Whole francs. */
const TRAILING_AMOUNT = /(?:^|\s)(-?\d{1,3}(?:[.'’]\d{3})+(?:,\d{2})?-?|-?\d{1,7}(?:,\d{2})?-?)\s*$/

function parseSwissAmount(token: string): number | null {
  const negative = token.startsWith('-') || token.endsWith('-')
  const body = token.replace(/^-|-$/g, '')
  let value: number
  if (/^\d{1,3}(?:[.'’]\d{3})+(?:,\d{2})?$/.test(body)) value = Number(body.replace(/[.'’]/g, '').replace(',', '.'))
  else if (/^\d+(?:,\d{2})?$/.test(body)) value = Number(body.replace(',', '.'))
  else return null
  if (!Number.isFinite(value) || value > 10_000_000) return null
  const rounded = Math.round(value)
  return negative ? -rounded : rounded
}

function trailingAmount(rawLine: string): number | null {
  // A typographic minus right against the figure („−118“) is a minus; a dash alone marks an empty Ziffer.
  const line = rawLine.replace(/[−–](?=\d)/g, '-')
  if (/\d{1,2}\.\d{1,2}\.\d{2,4}\s*$/.test(line)) return null // a date, not an amount
  const m = TRAILING_AMOUNT.exec(line)
  return m?.[1] ? parseSwissAmount(m[1]) : null
}

/** "1. Lohn", "8 Bruttolohn", "14, Weitere", "15.Bemerkungen": a Ziffer's first line, never "10.1" or "13.1.1". */
const ZIFFER_HEADER = /^\s{0,3}(\d{1,2})\s*(?:[.,]\s*)?(?=[A-Za-zÄÖÜäöü])/

/** A scan's margin (punch holes, a barcode) leaves a few characters before the number: "oO 14. Weitere". */
const NOISY_ZIFFER_HEADER = /^\D{1,8}?\s(\d{1,2})\s*(?:[.,]\s*)?(?=[A-Za-zÄÖÜäöü])/

/** What each Ziffer's heading says, German or French, loose about OCR's umlauts. */
const ZIFFER_HEADINGS: Readonly<Record<number, RegExp>> = {
  1: /\blohn\b|salaire qui/i,
  2: /gehaltsneben|salariales accessoires/i,
  3: /unregelm|non p.riod/i,
  4: /kapitalleist|en capital/i,
  5: /beteiligung|participation/i,
  6: /verwaltungsrat|administration/i,
  7: /andere\s+leist|autres prestations/i,
  8: /bruttolohn|brut total/i,
  9: /ahv|avs/i,
  10: /berufliche|pr.voyance/i,
  11: /nettolohn|salaire net/i,
  12: /quellensteuer|la source/i,
  13: /spesen|frais/i,
  14: /weitere\s+geh|accessoires/i,
  15: /bemerkung|observations/i,
}

interface Block {
  readonly digit: number
  readonly lines: readonly string[]
}

/**
 * The text cut into the Ziffern 1–15, in order. A Ziffer starts where its number and its heading
 * stand together, so noise above the form ("5 oe a 2 …") starts none; OCR that turned "1." into
 * "41." still finds Ziffer 1 by the last digit and the heading.
 */
function zifferBlocks(lines: readonly string[]): Block[] {
  const blocks: { digit: number; lines: string[] }[] = []
  let last = 0
  for (const line of lines) {
    const m = ZIFFER_HEADER.exec(line) ?? NOISY_ZIFFER_HEADER.exec(line)
    const printed = m?.[1] ? Number(m[1]) : Number.NaN
    const digit = [printed, printed % 10].find((n) => Number.isInteger(n) && n > last && n <= 15 && ZIFFER_HEADINGS[n]!.test(line))
    if (digit !== undefined) {
      blocks.push({ digit, lines: [line] })
      last = digit
    } else if (blocks.length > 0) {
      blocks.at(-1)!.lines.push(line)
    }
  }
  return blocks
}

function isoDate(german: string): string {
  const [d, m, y] = german.split('.')
  return `${y}-${m}-${d}`
}

/** Box D (year) and box E (period) share a line: a year, then two dates. OCR loses or misreads the box letters. */
const YEAR_AND_PERIOD = /(?<![\d.])(20\d{2})(?![\d.])\D{0,8}?(\d{2}\.\d{2}\.20\d{2})\D{0,8}?(\d{2}\.\d{2}\.20\d{2})/
const SALUTATION = /^(?:Herr|Frau|Monsieur|Madame|Signora?)$/i
const NOT_A_NAME = /PERS[ÖO]NLICH|VERTRAULICH|CONFIDENTIEL|PERSONNEL|Frankenbetr|montants|import[io]?\s+interi/i

/** A name: two to four words of letters. Scans put a postal barcode line here too („*38267*0004497…“). */
function looksLikeName(line: string): boolean {
  const words = line.trim().split(/\s+/)
  return words.length >= 2 && words.length <= 4 && words.every((w) => /^[\p{L}'’.-]+$/u.test(w) && /\p{L}/u.test(w)) && !NOT_A_NAME.test(line) && !SALUTATION.test(line.trim())
}

/**
 * The name line of the address window (box H). With the „H“ it is the first name below it; a scan that
 * lost the letter still has the window between the head and Ziffer 1: the name follows the salutation,
 * or stands right above the street (a line that ends in a house number).
 */
function readHolder(lines: readonly string[]): string | null {
  const hAt = lines.findIndex((l) => /^\s*H\s*$/.test(l))
  if (hAt >= 0) {
    const below = lines.slice(hAt + 1, hAt + 6).find(looksLikeName)
    if (below !== undefined) return below.trim()
  }
  const firstZiffer = lines.findIndex((l) => ZIFFER_HEADER.test(l) && ZIFFER_HEADINGS[1]!.test(l))
  const window = lines.slice(0, firstZiffer >= 0 ? firstZiffer : Math.min(lines.length, 30))
  for (let i = 0; i < window.length; i++) {
    const line = window[i]!
    if (!looksLikeName(line)) continue
    const afterSalutation = i > 0 && SALUTATION.test(window[i - 1]!.trim())
    const aboveStreet = /^\s*\p{L}[\p{L}\s.'’-]*\s\d{1,4}\s?[a-z]?\s*$/iu.test(window[i + 1] ?? '')
    if (afterSalutation || aboveStreet) return line.trim()
  }
  return null
}

function readHead(lines: readonly string[]) {
  const headAt = lines.findIndex((l) => /^\s*D\s+20\d{2}\b/.test(l) || YEAR_AND_PERIOD.test(l))
  const dLine = headAt >= 0 ? lines[headAt]! : null
  const dates = dLine ? [...dLine.matchAll(/\b(\d{2}\.\d{2}\.20\d{2})\b/g)].map((m) => m[1]!) : []
  const period = dates.length >= 2 ? { from: isoDate(dates[0]!), to: isoDate(dates[1]!) } : null
  const yearOnD = dLine ? Number((YEAR_AND_PERIOD.exec(dLine) ?? /\b(20\d{2})\b/.exec(dLine))![1]) : null
  const taxYear = yearOnD ?? (period ? Number(period.to.slice(0, 4)) : null)
  // The cross of a box stands after its letter, or (read by position) before the text beside the box.
  const canteen =
    (dLine !== null && /\b[GCc6]\s+[Xx]\b/.test(dLine.slice(dLine.lastIndexOf(dates.at(-1) ?? '')))) ||
    lines.some((l) => /^\W*[Xx]\s+(?:Kantinenverpflegung|Repas\s+.\s+la\s+cantine|Pasti\s+alla\s+mensa)/i.test(l))
  const freeTransport = lines.some((l) => /\bF\s+X\b/.test(l) || /^\W*[Xx]\s+(?:Unentgeltl?iche\s+Bef|Transport\s+gratuit|Trasporto\s+gratuito)/i.test(l))
  return { taxYear, period, canteen, freeTransport, holder: readHolder(lines) }
}

function readAmounts(blocks: readonly Block[]) {
  const amounts: Partial<Record<SalaryCertificateAmountFieldId, number>> = {}
  const digitRuns: Partial<Record<SalaryCertificateAmountFieldId, string>> = {}
  let ordinary: number | null = null
  let buyIn: number | null = null
  for (const block of blocks) {
    const id = DIGIT_IDS[block.digit]
    if (!id) continue
    const found = block.lines.map((line) => ({ line, amount: trailingAmount(line) })).filter((x) => x.amount !== null)
    if (found.length === 0) continue
    const abs = (n: number) => (DEDUCTIONS.has(block.digit) ? Math.abs(n) : n)
    if (block.digit === 10) {
      for (const { line, amount } of found) {
        if (/[14]0\.2/.test(line)) buyIn = abs(amount!)
        else ordinary = (ordinary ?? 0) + abs(amount!)
      }
      amounts[id] = (ordinary ?? 0) + (buyIn ?? 0)
    } else if (block.digit === 2) {
      amounts[id] = found.reduce((sum, x) => sum + x.amount!, 0)
    } else {
      amounts[id] = abs(found.at(-1)!.amount!)
      digitRuns[id] = trailingDigitRun(found.at(-1)!.line)
    }
  }
  return { amounts, digitRuns, pension: { ordinary, buyIn } }
}

const DIGIT_RUN_CHAR = /[\d\s.'’]/

/** The digits at a line's end, spaces and separators dropped: OCR's "1 1 1 839" is "111839". */
function trailingDigitRun(line: string): string {
  let text = line.trimEnd()
  if (text.endsWith('-')) text = text.slice(0, -1)
  let start = text.length
  while (start > 0 && DIGIT_RUN_CHAR.test(text[start - 1]!)) start -= 1
  return text.slice(start).replace(/\D/g, '')
}

/**
 * OCR tears a figure apart ("1 1 1 839" read as 839). When one figure breaks a sum of the form and
 * the value the sum asks for is exactly the digits printed on its line, that value is the figure.
 */
function repairBySums(
  amounts: Partial<Record<SalaryCertificateAmountFieldId, number>>,
  digitRuns: Partial<Record<SalaryCertificateAmountFieldId, string>>,
): Partial<Record<SalaryCertificateAmountFieldId, number>> {
  const a = { ...amounts }
  const tryRepair = (id: SalaryCertificateAmountFieldId, wanted: number) => {
    if (a[id] !== wanted && wanted > 0 && digitRuns[id] === String(wanted)) a[id] = wanted
  }
  const gross = a['bruttolohn-total']
  if (gross !== undefined && checksOf(a).gross === 'conflict') {
    tryRepair('lohn', gross - GROSS_PARTS.filter((id) => id !== 'lohn').reduce((s, id) => s + (a[id] ?? 0), 0))
  }
  if (checksOf(a).net === 'conflict') {
    const [b, v, p, n] = [a['bruttolohn-total']!, a['ahv-beitraege']!, a['berufliche-vorsorge']!, a.nettolohn!]
    tryRepair('nettolohn', b - v - p)
    if (checksOf(a).net === 'conflict') tryRepair('bruttolohn-total', n + v + p)
  }
  if (a.lohn !== undefined && a['bruttolohn-total'] !== undefined && checksOf(a).gross === 'conflict') {
    tryRepair('bruttolohn-total', GROSS_PARTS.reduce((s, id) => s + (a[id] ?? 0), 0))
  }
  return a
}

function checksOf(amounts: Partial<Record<SalaryCertificateAmountFieldId, number>>) {
  const a = amounts
  const gross: ChCertificateCheck =
    a.lohn === undefined || a['bruttolohn-total'] === undefined
      ? 'unknown'
      : Math.abs(GROSS_PARTS.reduce((s, id) => s + (a[id] ?? 0), 0) - a['bruttolohn-total']) <= 1
        ? 'ok'
        : 'conflict'
  const net: ChCertificateCheck =
    a['bruttolohn-total'] === undefined || a['ahv-beitraege'] === undefined || a['berufliche-vorsorge'] === undefined || a.nettolohn === undefined
      ? 'unknown'
      : Math.abs(a['bruttolohn-total'] - a['ahv-beitraege'] - a['berufliche-vorsorge'] - a.nettolohn) <= 1
        ? 'ok'
        : 'conflict'
  return { gross, net }
}

function fieldsOf(
  amounts: Partial<Record<SalaryCertificateAmountFieldId, number>>,
  checks: { gross: ChCertificateCheck; net: ChCertificateCheck },
  suggested: ReadonlySet<SalaryCertificateAmountFieldId> = new Set(),
): Partial<Record<SalaryCertificateAmountFieldId, ChCertificateField>> {
  const inConflict = new Set<SalaryCertificateAmountFieldId>([
    ...(checks.gross === 'conflict' ? [...GROSS_PARTS, 'bruttolohn-total' as const] : []),
    ...(checks.net === 'conflict' ? (['bruttolohn-total', 'ahv-beitraege', 'berufliche-vorsorge', 'nettolohn'] as const) : []),
  ])
  const fields: Partial<Record<SalaryCertificateAmountFieldId, ChCertificateField>> = {}
  for (const [id, value] of Object.entries(amounts) as [SalaryCertificateAmountFieldId, number][]) {
    const reason: ChCertificateFieldReason = suggested.has(id) ? 'llm_suggested' : value < 0 ? 'negative' : inConflict.has(id) ? 'plausibility_conflict' : null
    fields[id] = { value, status: reason === null ? 'ok' : 'pruefen', reason }
  }
  return fields
}

export function parseChSalaryCertificateText(rawText: string): ChCertificateRead {
  const lines = (rawText ?? '').split(/\r?\n/)
  const head = readHead(lines)
  const read = readAmounts(zifferBlocks(lines))
  const amounts = repairBySums(read.amounts, read.digitRuns)
  const pension = read.pension
  const checks = checksOf(amounts)
  return {
    ...head,
    amounts,
    fields: fieldsOf(amounts, checks),
    pension,
    checks,
    familyAllowancesChf: familyAllowancesIn(lines),
    missing: EXPECTED.filter((id) => amounts[id] === undefined),
  }
}

/**
 * The family allowances a certificate states in its remarks: „Kinderzulagen CHF 2'580“, „Familienzulagen:
 * 3'870.00“. Several such amounts add up; a „davon …“ part is not counted again. A remark that only says they are
 * included, without an amount, gives null: the user enters it.
 */
export function familyAllowancesIn(lines: readonly string[]): number | null {
  let sum = 0
  let found = false
  for (const line of lines) {
    // „davon …“ is a part of an amount already counted.
    if (/\bdavon\b/i.test(line)) continue
    const m = /(kinder|ausbildungs|familien)zulage[n]?\b[^\d]{0,30}?(\d{1,3}(?:['’.\s]\d{3})*|\d+)(?:[.,]\d{2})?/i.exec(line)
    if (!m) continue
    const chf = Number(m[2]!.replace(/['’.\s]/g, ''))
    if (Number.isFinite(chf) && chf > 0) {
      sum += chf
      found = true
    }
  }
  return found ? sum : null
}

/**
 * What a model may see of the certificate: the lines of the Ziffern 1–12, which hold only the form's
 * labels and the amounts. The head (name, address, AHV number, birth date), the remarks (Ziffer 15)
 * and the employer's signature block never leave the server.
 */
export function selectChCertificateRelevantLines(rawText: string): string {
  const lines = (rawText ?? '').split(/\r?\n/)
  const kept: string[] = []
  const year = readHead(lines).taxYear
  if (year !== null) kept.push(`Lohnausweis ${year}`)
  for (const block of zifferBlocks(lines)) {
    if (block.digit > 12) break
    for (const line of block.lines.slice(0, 6)) {
      const t = line.replace(/\s{2,}/g, ' ').trim()
      if (t) kept.push(t)
    }
  }
  return kept.join('\n')
}

function amountsPrintedIn(text: string): readonly number[] {
  const printed: number[] = []
  for (const m of text.matchAll(/-?\d{1,3}(?:[.'’]\d{3})+(?:,\d{2})?-?|-?\d+(?:,\d{2})?-?/g)) {
    const v = parseSwissAmount(m[0])
    if (v !== null) printed.push(Math.abs(v))
  }
  return printed
}

/**
 * Merges a model's suggestion into the rule's read: only Ziffern the rule left empty, only amounts
 * literally printed in the text the model saw, and never as done (`llm_suggested`).
 */
export function applyChCertificateTextFallback(
  read: ChCertificateRead,
  suggestion: Partial<Record<SalaryCertificateAmountFieldId, number | null>>,
  groundingText: string,
): ChCertificateRead {
  const printed = amountsPrintedIn(groundingText)
  const amounts = { ...read.amounts }
  const suggested = new Set<SalaryCertificateAmountFieldId>()
  for (const [id, value] of Object.entries(suggestion) as [SalaryCertificateAmountFieldId, number | null][]) {
    if (value === null || !Number.isFinite(value) || amounts[id] !== undefined) continue
    if (!printed.some((p) => Math.abs(p - Math.abs(value)) < 0.5)) continue
    amounts[id] = Math.round(value)
    suggested.add(id)
  }
  const checks = checksOf(amounts)
  return { ...read, amounts, fields: fieldsOf(amounts, checks, suggested), checks, missing: EXPECTED.filter((id) => amounts[id] === undefined) }
}

/** Lower case without umlauts, also when written as "ue": "Jürgen" and "Juergen" are one name. */
export function foldName(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ä|ae/g, 'a')
    .replace(/ö|oe/g, 'o')
    .replace(/ü|ue/g, 'u')
    .replace(/ß/g, 'ss')
    .split(/[^a-z]+/)
    .filter(Boolean)
}

export interface CertificatePersonName {
  readonly firstName: string | null
  readonly lastName: string | null
}

/**
 * Whose certificate it is: the person whose first and last name both appear on it. Null when the
 * name fits nobody or more than one person; the app then asks instead of guessing.
 */
export function certificateHolderPerson(
  holder: string | null,
  people: { readonly A: CertificatePersonName; readonly B?: CertificatePersonName | null | undefined },
): 'A' | 'B' | null {
  if (!holder) return null
  const onCertificate = new Set(foldName(holder))
  const fits = (person: CertificatePersonName | null | undefined): boolean => {
    if (!person?.firstName || !person.lastName) return false
    const names = [...foldName(person.firstName), ...foldName(person.lastName)]
    return names.length > 0 && names.every((n) => onCertificate.has(n))
  }
  const matches = (['A', 'B'] as const).filter((p) => fits(p === 'A' ? people.A : people.B))
  return matches.length === 1 ? matches[0]! : null
}
