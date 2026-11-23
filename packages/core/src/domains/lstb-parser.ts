import {
  EMPTY_WAGE_TAX_CERTIFICATE,
  isValidAmount,
  setWageTaxCertificateField,
  wageTaxCertificateStatus,
  type WageTaxCertificateData,
  type WageTaxCertificateFieldId,
} from './lstb'

export type LstbExtractedFieldStatus = 'ok' | 'pruefen'

export type LstbFieldReason =
  | 'missing'
  | 'unreadable'
  | 'plausibility_conflict'
  | 'partial_sv_lines'
  /** Suggested by the text fallback: never green, always needs the user's confirmation. */
  | 'llm_suggested'
  /** Read from a photo or scanned page via OCR, which confuses digits (8/3, 1/7) — never green. */
  | 'ocr_source'
  /** The row is empty on the certificate and proposed as 0 where the mask needs an answer (Zeile 24, ADR-0093). */
  | 'empty_line'

/** One summand of a field's calculation, e.g. line 23a with its printed amount. Formatting is the UI's job. */
export interface LstbCalculationTerm {
  readonly line: string
  readonly amount: number
}

export interface LstbExtractedField {
  readonly value: number | null
  readonly status: LstbExtractedFieldStatus
  readonly sourceLines: readonly string[]
  /** Summands that make up `value` (empty when nothing was read). */
  readonly calculation: readonly LstbCalculationTerm[]
  readonly reason: LstbFieldReason | null
}

export interface LstbSvBreakdown {
  readonly line23: number | null
  readonly line23a: number | null
  readonly line23b: number | null
  readonly line25: number | null
  readonly line26: number | null
  readonly line27: number | null
}

/**
 * The further lines of the certificate the LStB mask has a field for (catalogue screen `lstb`): Soli (Zeile 5,
 * euros with cents), church tax (6, 7), the pension shares (22 a/b, 23 a/b), the tax-free subsidies (24 a–c and
 * 24c alone) and the employee's insurance contributions (25–27). Whole euros, rounded as the mask rounds.
 */
export const LSTB_SCAN_LINES = [
  'solidaritaetszuschlag',
  'kirchensteuer',
  'kirchensteuerEhegatte',
  'rvArbeitgeber',
  'rvArbeitnehmer',
  'zuschuesseKvPv',
  'zuschussPv',
  'kvArbeitnehmer',
  'pvArbeitnehmer',
  'avArbeitnehmer',
] as const
export type LstbScanLine = (typeof LSTB_SCAN_LINES)[number]

/** Printed amounts of the rows beside 3, 4 and 23–27, by their number on the form. */
export type LstbExtraRow = '5' | '6' | '7' | '22a' | '22b' | '24a' | '24b' | '24c'
export type LstbExtraRowAmounts = Readonly<Partial<Record<LstbExtraRow, number | null>>>

export interface LstbExtractionResult {
  readonly taxYear: number | null
  readonly fields: {
    readonly bruttoarbeitslohn: LstbExtractedField
    readonly lohnsteuer: LstbExtractedField
    readonly sozialversicherung: LstbExtractedField
  }
  readonly svBreakdown: LstbSvBreakdown
  /** Every further line of the mask; `value: null` with reason `missing` where the certificate prints none. */
  readonly lines: Readonly<Record<LstbScanLine, LstbExtractedField>>
  /** Fields that are missing or need a check (`pruefen`); empty when the certificate read cleanly. */
  readonly unresolvedFields: readonly WageTaxCertificateFieldId[]
}

export interface LstbExtractionInput {
  readonly taxYear: number | null
  readonly line3Brutto: number | null
  readonly line4Lohnsteuer: number | null
  readonly svBreakdown: LstbSvBreakdown
  readonly unreadableFields?: readonly WageTaxCertificateFieldId[] | undefined
  readonly hasAmbiguity?: readonly WageTaxCertificateFieldId[] | undefined
  /** Rows 5–7, 22 and 24 as printed; absent ones are not on the certificate. */
  readonly extraRows?: LstbExtraRowAmounts | undefined
  /** Lines read twice with different amounts, or whose row is not certain. */
  readonly ambiguousLines?: readonly LstbScanLine[] | undefined
}

const MIN_LSTB_YEAR = 2020
const MAX_LSTB_YEAR = 2030
const MAX_REASONABLE_EUR = 10_000_000

function isSupportedLstbYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_LSTB_YEAR && year <= MAX_LSTB_YEAR
}

/**
 * Parses a German or OCR-noisy Euro amount string (e.g. "54.320,00", "5.051.76",
 * "48 000,50 EUR", "48000") into a non-negative finite number (up to 2 decimal places).
 * Returns null for dates, line ordinals ("9."), percentages, or unreadable noise.
 */
export function parseGermanOcrAmount(raw: string): number | null {
  if (!raw) return null
  const trimmed = raw
    .trim()
    .replace(/[€]/g, '')
    .replace(/\b(?:EUR|Euro)\b/gi, '')
    .trim()

  if (!trimmed || /%/.test(trimmed)) return null
  // Reject German dates DD.MM.YYYY or DD.MM.YY
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(trimmed)) return null

  const compact = trimmed.replace(/\s+/g, '')

  // Standard German decimal comma: "54.320,00" or "54320,5" or "0,00"
  if (/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(compact) || /^\d+,\d{1,2}$/.test(compact)) {
    const num = Number.parseFloat(compact.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(num) && num >= 0 && num <= MAX_REASONABLE_EUR ? num : null
  }

  // Standard German thousands without decimal comma: "54.320" or "1.200.000"
  if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) {
    const num = Number.parseInt(compact.replace(/\./g, ''), 10)
    return Number.isFinite(num) && num >= 0 && num <= MAX_REASONABLE_EUR ? num : null
  }

  // OCR dot-decimal artifact: "5.051.76" or "48.000.00" or "5051.76"
  const dotDecimalMatch = /^(\d{1,3}(?:\.\d{3})*|\d+)\.(\d{2})$/.exec(compact)
  if (dotDecimalMatch && dotDecimalMatch[1] && dotDecimalMatch[2]) {
    const intPart = dotDecimalMatch[1].replace(/\./g, '')
    const num = Number.parseFloat(`${intPart}.${dotDecimalMatch[2]}`)
    return Number.isFinite(num) && num >= 0 && num <= MAX_REASONABLE_EUR ? num : null
  }

  // Plain integer: "48000" or "0"
  if (/^\d{1,7}$/.test(compact)) {
    const num = Number.parseInt(compact, 10)
    return Number.isFinite(num) && num >= 0 && num <= MAX_REASONABLE_EUR ? num : null
  }

  return null
}

/**
 * Extracts the tax year printed on a Lohnsteuerbescheinigung from its explicit header or
 * certification period only; anything else returns null.
 */
export function extractLstbTaxYear(rawText: string): number | null {
  if (!rawText) return null

  const highPriorityPatterns = [
    /Lohnsteuerbescheinigung\s+(?:f(?:ü|ue|u|ii|i)r\s+(?:das\s+)?)?(?:Kalenderjahr\s+)?(20\d{2})\b/i,
    /(?:für\s+das\s+Kalenderjahr|Kalenderjahr)\s*(?:[:-]\s*)?(20\d{2})\b/i,
    /Bescheinigungszeitraum[^\n]*?(20\d{2})\b/i,
    /Zeitraum\s*(?:[:-]\s*)?\d{2}\.\d{2}\.(20\d{2})\s*(?:-|bis)\s*\d{2}\.\d{2}\.(20\d{2})\b/i,
  ]

  for (const rx of highPriorityPatterns) {
    const match = rx.exec(rawText)
    if (match?.[1]) {
      const year = Number.parseInt(match[1], 10)
      if (isSupportedLstbYear(year)) return year
    }
  }

  // No generic "first year on the page" fallback: form versions, print dates and birth years
  // look alike. Without an explicit header the year stays unknown and the UI asks (ADR-0008).
  return null
}

function normalizeNonNegNum(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(val) || val < 0 || val > MAX_REASONABLE_EUR) {
    return null
  }
  return val
}

/**
 * Deterministically sums employee SV contributions (lines 23/23a/23b, 25, 26, 27), checks
 * statutory plausibility (LSt <= Brutto, SV <= Brutto), and assigns 'ok' vs 'pruefen' per field.
 * Shared by the deterministic parser and any text fallback, so both are judged by the same rules.
 */
export function evaluateLstbExtraction(input: LstbExtractionInput): LstbExtractionResult {
  const taxYear = input.taxYear !== null && isSupportedLstbYear(input.taxYear) ? input.taxYear : null
  const unreadableSet = new Set(input.unreadableFields ?? [])
  const ambiguousSet = new Set(input.hasAmbiguity ?? [])

  const line3 = normalizeNonNegNum(input.line3Brutto)
  const line4 = normalizeNonNegNum(input.line4Lohnsteuer)

  const sv23a = normalizeNonNegNum(input.svBreakdown.line23a)
  const sv23b = normalizeNonNegNum(input.svBreakdown.line23b)
  const sv23 = normalizeNonNegNum(input.svBreakdown.line23)
  const sv25 = normalizeNonNegNum(input.svBreakdown.line25)
  const sv26 = normalizeNonNegNum(input.svBreakdown.line26)
  const sv27 = normalizeNonNegNum(input.svBreakdown.line27)

  const svBreakdown: LstbSvBreakdown = {
    line23: sv23,
    line23a: sv23a,
    line23b: sv23b,
    line25: sv25,
    line26: sv26,
    line27: sv27,
  }

  // Employee SV sum: lines (23a + 23b) OR (23), plus 25 (KV), 26 (PV), 27 (ALV).
  // Never includes lines 22a/22b (employer share).
  const svEntries: { line: string; amount: number; category: 'rv' | 'kv' | 'pv' | 'alv' }[] = []
  if (sv23a !== null || sv23b !== null) {
    if (sv23a !== null) svEntries.push({ line: '23a', amount: sv23a, category: 'rv' })
    if (sv23b !== null) svEntries.push({ line: '23b', amount: sv23b, category: 'rv' })
  } else if (sv23 !== null) {
    svEntries.push({ line: '23', amount: sv23, category: 'rv' })
  }
  if (sv25 !== null) svEntries.push({ line: '25', amount: sv25, category: 'kv' })
  if (sv26 !== null) svEntries.push({ line: '26', amount: sv26, category: 'pv' })
  if (sv27 !== null) svEntries.push({ line: '27', amount: sv27, category: 'alv' })

  const svCategoriesPresent = new Set(svEntries.map((e) => e.category))
  // The app's sum (ADR-0093): each line in whole euros as the mask holds it, then added. The lines are
  // drafted beside the sum, and taking them over stores exactly this sum.
  const svRounded =
    svEntries.length > 0
      ? (['rv', 'kv', 'pv', 'alv'] as const).reduce((acc, category) => {
          const amounts = svEntries.filter((e) => e.category === category).map((e) => e.amount)
          return acc + (amounts.length > 0 ? wholeEurosOf(amounts) : 0)
        }, 0)
      : null
  const bruttoRounded = line3 !== null ? Math.round(line3) : null
  const lohnsteuerRounded = line4 !== null ? Math.round(line4) : null

  // Plausibility check via shared domain rule wageTaxCertificateStatus
  let certData: WageTaxCertificateData = EMPTY_WAGE_TAX_CERTIFICATE
  if (bruttoRounded !== null && isValidAmount(bruttoRounded)) {
    certData = setWageTaxCertificateField(certData, 'bruttoarbeitslohn', { kind: 'erfasst', value: bruttoRounded })
  }
  if (lohnsteuerRounded !== null && isValidAmount(lohnsteuerRounded)) {
    certData = setWageTaxCertificateField(certData, 'lohnsteuer', { kind: 'erfasst', value: lohnsteuerRounded })
  }
  if (svRounded !== null && isValidAmount(svRounded)) {
    certData = setWageTaxCertificateField(certData, 'sozialversicherung', { kind: 'erfasst', value: svRounded })
  }
  const certStatus = wageTaxCertificateStatus(certData)
  const lstExceedsBrutto =
    bruttoRounded !== null &&
    lohnsteuerRounded !== null &&
    (lohnsteuerRounded > bruttoRounded ||
      (certStatus.kind === 'widerspruch' &&
        certStatus.conflicts.some((c) => c.kind === 'lohnsteuer-uebersteigt-brutto')))
  const svExceedsBrutto =
    bruttoRounded !== null &&
    svRounded !== null &&
    (svRounded > bruttoRounded ||
      (certStatus.kind === 'widerspruch' &&
        certStatus.conflicts.some((c) => c.kind === 'sozialversicherung-uebersteigt-brutto')))

  let bruttoField: LstbExtractedField
  if (bruttoRounded === null) {
    bruttoField = {
      value: null,
      status: 'pruefen',
      sourceLines: ['3'],
      calculation: [],
      reason: unreadableSet.has('bruttoarbeitslohn') ? 'unreadable' : 'missing',
    }
  } else if (unreadableSet.has('bruttoarbeitslohn') || ambiguousSet.has('bruttoarbeitslohn')) {
    bruttoField = {
      value: bruttoRounded,
      status: 'pruefen',
      sourceLines: ['3'],
      calculation: [{ line: '3', amount: line3! }],
      reason: 'unreadable',
    }
  } else {
    bruttoField = {
      value: bruttoRounded,
      status: lstExceedsBrutto || svExceedsBrutto ? 'pruefen' : 'ok',
      sourceLines: ['3'],
      calculation: [{ line: '3', amount: line3! }],
      reason: lstExceedsBrutto || svExceedsBrutto ? 'plausibility_conflict' : null,
    }
  }

  let lohnsteuerField: LstbExtractedField
  if (lohnsteuerRounded === null) {
    lohnsteuerField = {
      value: null,
      status: 'pruefen',
      sourceLines: ['4'],
      calculation: [],
      reason: unreadableSet.has('lohnsteuer') ? 'unreadable' : 'missing',
    }
  } else if (lstExceedsBrutto) {
    lohnsteuerField = {
      value: lohnsteuerRounded,
      status: 'pruefen',
      sourceLines: ['4'],
      calculation: [{ line: '4', amount: line4! }],
      reason: 'plausibility_conflict',
    }
  } else if (unreadableSet.has('lohnsteuer') || ambiguousSet.has('lohnsteuer')) {
    lohnsteuerField = {
      value: lohnsteuerRounded,
      status: 'pruefen',
      sourceLines: ['4'],
      calculation: [{ line: '4', amount: line4! }],
      reason: 'unreadable',
    }
  } else {
    lohnsteuerField = {
      value: lohnsteuerRounded,
      status: 'ok',
      sourceLines: ['4'],
      calculation: [{ line: '4', amount: line4! }],
      reason: null,
    }
  }

  let svField: LstbExtractedField
  if (svRounded === null) {
    svField = {
      value: null,
      status: 'pruefen',
      sourceLines: [],
      calculation: [],
      reason: unreadableSet.has('sozialversicherung') ? 'unreadable' : 'missing',
    }
  } else {
    const sourceLines = svEntries.map((e) => e.line)
    const calculation = svEntries.map((e) => ({ line: e.line, amount: e.amount }))

    if (svExceedsBrutto) {
      svField = {
        value: svRounded,
        status: 'pruefen',
        sourceLines,
        calculation,
        reason: 'plausibility_conflict',
      }
    } else if (unreadableSet.has('sozialversicherung') || ambiguousSet.has('sozialversicherung')) {
      svField = {
        value: svRounded,
        status: 'pruefen',
        sourceLines,
        calculation,
        reason: 'unreadable',
      }
    } else if ((svCategoriesPresent.size < 2 && svRounded > 0) || svCategoriesPresent.has('kv') !== svCategoriesPresent.has('pv') || (svRounded > 0 && !svCategoriesPresent.has('rv'))) {
      // One category alone, health without nursing care (they are withheld together), or no pension line
      // beside the others: a line is missing. A scan that read lines 25 and 26 only gave about half the
      // sum as if it were complete (real-data run); whoever truly pays no pension insurance confirms it.
      svField = {
        value: svRounded,
        status: 'pruefen',
        sourceLines,
        calculation,
        reason: 'partial_sv_lines',
      }
    } else {
      svField = {
        value: svRounded,
        status: 'ok',
        sourceLines,
        calculation,
        reason: null,
      }
    }
  }

  const unresolvedFields = (
    [
      ['bruttoarbeitslohn', bruttoField],
      ['lohnsteuer', lohnsteuerField],
      ['sozialversicherung', svField],
    ] as const
  )
    .filter(([, field]) => field.status === 'pruefen')
    .map(([id]) => id)

  const extra = (row: LstbExtraRow): number | null => normalizeNonNegNum(input.extraRows?.[row])
  const rows = (...pairs: readonly (readonly [string, number | null])[]) => pairs.filter((pair): pair is readonly [string, number] => pair[1] !== null)
  const rvEmployee = svEntries.filter((e) => e.category === 'rv').map((e) => [e.line, e.amount] as const)
  const ambiguousLines = new Set(input.ambiguousLines ?? [])
  const lineOf = (line: LstbScanLine, printed: readonly (readonly [string, number])[]): LstbExtractedField =>
    lineField(printed, line === 'solidaritaetszuschlag', ambiguousLines.has(line))
  const lines: Record<LstbScanLine, LstbExtractedField> = {
    solidaritaetszuschlag: lineOf('solidaritaetszuschlag', rows(['5', extra('5')])),
    kirchensteuer: lineOf('kirchensteuer', rows(['6', extra('6')])),
    kirchensteuerEhegatte: lineOf('kirchensteuerEhegatte', rows(['7', extra('7')])),
    rvArbeitgeber: lineOf('rvArbeitgeber', rows(['22a', extra('22a')], ['22b', extra('22b')])),
    rvArbeitnehmer: lineOf('rvArbeitnehmer', rvEmployee),
    zuschuesseKvPv: subsidiesField(lineOf('zuschuesseKvPv', rows(['24a', extra('24a')], ['24b', extra('24b')], ['24c', extra('24c')])), sv25 !== null || sv26 !== null),
    zuschussPv: lineOf('zuschussPv', rows(['24c', extra('24c')])),
    kvArbeitnehmer: lineOf('kvArbeitnehmer', rows(['25', sv25])),
    pvArbeitnehmer: lineOf('pvArbeitnehmer', rows(['26', sv26])),
    avArbeitnehmer: lineOf('avArbeitnehmer', rows(['27', sv27])),
  }

  return {
    taxYear,
    fields: {
      bruttoarbeitslohn: bruttoField,
      lohnsteuer: lohnsteuerField,
      sozialversicherung: svField,
    },
    svBreakdown,
    lines,
    unresolvedFields,
  }
}

/** Whole euros of printed amounts added in cents, half up — the rounding of the mask (`wholeEurosFrom`). */
function wholeEurosOf(amounts: readonly number[]): number {
  const cents = amounts.reduce((acc, amount) => acc + Math.round(amount * 100), 0)
  return Math.floor((cents + 50) / 100)
}

/**
 * Zeile 24 has to be answered once 25 or 26 holds a contribution, „0, wenn die Zeile leer ist“ (ADR-0093):
 * a certificate that prints them without a row 24 proposes that 0, to be checked (OCR may have lost the row).
 */
function subsidiesField(read: LstbExtractedField, healthOrCareRead: boolean): LstbExtractedField {
  if (read.value !== null || !healthOrCareRead) return read
  return { value: 0, status: 'pruefen', sourceLines: ['24'], calculation: [], reason: 'empty_line' }
}

/** One further line of the mask from its printed rows: whole euros (Soli: euros with cents). */
function lineField(printed: readonly (readonly [string, number])[], withCents: boolean, ambiguous: boolean): LstbExtractedField {
  const sourceLines = printed.map(([line]) => line)
  if (printed.length === 0) return { value: null, status: 'pruefen', sourceLines, calculation: [], reason: 'missing' }
  const amounts = printed.map(([, amount]) => amount)
  const value = withCents ? amounts.reduce((acc, amount) => acc + Math.round(amount * 100), 0) / 100 : wholeEurosOf(amounts)
  return {
    value,
    status: ambiguous ? 'pruefen' : 'ok',
    sourceLines,
    calculation: printed.map(([line, amount]) => ({ line, amount })),
    reason: ambiguous ? 'unreadable' : null,
  }
}

type SocialRowKey = '23a' | '23b' | '23' | '25' | '26' | '27'
type TargetRowKey = '3' | '4' | SocialRowKey | LstbExtraRow
type MatchedRowKey = TargetRowKey | 'other'

/** The rows the text fallback may see (ADR-0058): 3, 4 and 23–27 only, as before the further lines were read. */
const FALLBACK_ROWS: ReadonlySet<MatchedRowKey> = new Set(['3', '4', '23a', '23b', '23', '25', '26', '27'])

/** The line of the mask each further row goes to (24c counts in both subsidy fields). */
const LINES_OF_ROW: Readonly<Record<Exclude<TargetRowKey, '3' | '4'>, readonly LstbScanLine[]>> = {
  '5': ['solidaritaetszuschlag'],
  '6': ['kirchensteuer'],
  '7': ['kirchensteuerEhegatte'],
  '22a': ['rvArbeitgeber'],
  '22b': ['rvArbeitgeber'],
  '23': ['rvArbeitnehmer'],
  '23a': ['rvArbeitnehmer'],
  '23b': ['rvArbeitnehmer'],
  '24a': ['zuschuesseKvPv'],
  '24b': ['zuschuesseKvPv'],
  '24c': ['zuschuesseKvPv', 'zuschussPv'],
  '25': ['kvArbeitnehmer'],
  '26': ['pvArbeitnehmer'],
  '27': ['avArbeitnehmer'],
}

/** Lower case without umlauts or "ß", so OCR's "Arbeitnehmerbeitrage" still matches. */
function foldOcr(text: string): string {
  return text.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
}

/** What the heading of a target row starts with, on folded OCR text (letters OCR confuses are loose). */
const ROW_HEADINGS: readonly (readonly [RegExp, RegExp])[] = [
  [/^0?3$/, /^brutto\s*arbeits/],
  [/^0?4$/, /^einbe\S*\s+lohnst/],
  [/^0?5$/, /^einbe\S*\s+solidar/],
  [/^0?[67]$/, /^einbe\S*\s+kirchen/],
  [/^23\s*[ab]?$/, /^(?:arbeitnehmer|[ab]\)\s*zur)/],
  [/^25$/, /^arbeitnehmer\S*\s+zur\s+gesetzlichen\s+kranken/],
  [/^26$/, /^arbeitnehmer\S*\s+zur\s+sozialen\s+pflege/],
  [/^27$/, /^arbeitnehmer\S*\s+zur\s+arbeits.{0,2}osen/],
]

/** How much of a line after a row number is read as its heading; the longest heading is under 60 characters. */
const HEADING_WINDOW = 160

/**
 * A scan of the two-column form puts the left column's text (address, numbers) before the row
 * number: "1,0 25. Arbeitnehmerbeiträge …". Returns the line from the target row's number on,
 * when its heading follows; the line itself otherwise.
 */
function rowSegment(rawLine: string): string {
  const line = rawLine.trim()
  for (const m of line.matchAll(/(?<=^|[\s|:;])(?:(\d{1,2}\s*[ab])\.?\s+|(\d{1,2})\s*(?:\.\s+|(?<=\s)))(?=\S)/g)) {
    const start = m.index ?? 0
    const number = (m[1] ?? m[2])!.trim()
    // Only the start of the rest is a heading: folding the whole rest for every number on the line was
    // quadratic in its length (pentest 2026-11-23, ADR-0106 D1). The longest heading fits well within this.
    const headingStart = (m.index ?? 0) + m[0].length
    const heading = foldOcr(line.slice(headingStart, headingStart + HEADING_WINDOW))
    if (ROW_HEADINGS.some(([num, head]) => num.test(number) && head.test(heading))) return line.slice(start).trimStart()
  }
  return line
}

function classifyLine(rawLine: string): MatchedRowKey | null {
  const line = rowSegment(rawLine)
  if (!line) return null
  // Monetary amounts at start of line (e.g. "3.906,00", "6.450,00 EUR", "25,50") are never row numbers
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?(?:\s*(?:€|EUR|Euro))?\b/i.test(line)) return null
  if (/^\d+[,.]\d{1,2}(?:\s*(?:€|EUR|Euro))?(?:\s|$)/i.test(line)) return null

  // Employer/non-AN lines checked first so they never alias to AN lines
  const employerShare = /^(?:Zeile\s+)?22(?:\s*([ab])(?:\b|[.)])|\.\s*([ab])\))/i.exec(line)
  if (employerShare) return (employerShare[1] ?? employerShare[2])!.toLowerCase() === 'a' ? '22a' : '22b'
  if (/^(?:Zeile\s+)?22(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return 'other'
  const subsidy = /^(?:Zeile\s+)?24(?:\s*([abc])(?![\d])(?:\b|[.)])|\.\s*([abc])\))/i.exec(line)
  if (subsidy) return `24${(subsidy[1] ?? subsidy[2])!.toLowerCase() as 'a' | 'b' | 'c'}`
  if (/^(?:Zeile\s+)?24(?![\d,]|\.\d)(?:\b|[a-c.)])/i.test(line)) return 'other'
  // Soli and church tax only with their heading: a bare "5." or "6." may be anything of the left column.
  const foldedRow = foldOcr(line)
  if (/^(?:zeile\s+)?0?5(?![\d,]|\.\d)(?:\b|[.)])/.test(foldedRow) && /solidar/.test(foldedRow)) return '5'
  if (/^(?:zeile\s+)?0?6(?![\d,]|\.\d)(?:\b|[.)])/.test(foldedRow) && /kirchen/.test(foldedRow)) return '6'
  if (/^(?:zeile\s+)?0?7(?![\d,]|\.\d)(?:\b|[.)])/.test(foldedRow) && /kirchen/.test(foldedRow)) return '7'

  if (/^(?:Zeile\s+)?23\s*a(?![\d])(?:\b|[.)])/i.test(line) || /^23\.\s*a\)/i.test(line)) return '23a'
  if (/^(?:Zeile\s+)?23\s*b(?![\d])(?:\b|[.)])/i.test(line) || /^23\.\s*b\)/i.test(line)) return '23b'
  if (/^23\.?\s+(?:\S+\s*)?a\)\s*zur\s+gesetzlichen\s+Rente/i.test(line)) return '23a'
  if (/^23\.?\s+(?:\S+\s*)?b\)/i.test(line)) return '23b'
  if (/^(?:Zeile\s+)?23(?!\s*[ab])(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return '23'
  if (/^(?:Zeile\s+)?25(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return '25'
  if (/^(?:Zeile\s+)?26(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return '26'
  if (/^(?:Zeile\s+)?27(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return '27'
  if (/^(?:Zeile\s+)?0?3(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return '3'
  if (/^(?:Zeile\s+)?0?4(?![\d,]|\.\d)(?:\b|[.)])/i.test(line)) return '4'

  // Other numbered certificate rows act as lookahead stoppers (strictly followed by whitespace/letter/paren, not decimals)
  if (/^(?:Zeile\s+)?(?:[1256789]|1\d|2[0189]|3\d)[a-c]?(?:\.?)(?=\s+[A-Za-zÄÖÜäöüß(]|\s*$)/i.test(line)) {
    return 'other'
  }

  // Keyword fallbacks when OCR dropped the row number
  if (/\bBruttoarbeitslohn\b/i.test(line) && !/\bohnen?\b/i.test(line)) return '3'
  if (/\bEinbehaltene\s+Lohnsteuer\b/i.test(line)) return '4'
  if (/Arbeitnehmeranteil.*Rentenversicherung/i.test(line) && !/Arbeitgeber/i.test(line)) return '23a'
  if (/berufsständische/i.test(line) && /Arbeitnehmer/i.test(line)) return '23b'
  const folded = foldOcr(line)
  if (/arbeitnehmerbeitr.*gesetzlichen\s+krankenvers/.test(folded)) return '25'
  if (/arbeitnehmerbeitr.*sozialen\s+pflegevers/.test(folded)) return '26'
  if (/arbeitnehmerbeitr.*arbeits.{0,2}osenvers/.test(folded)) return '27'
  if (/einbehalten\S*\s+solidaritatszuschlag/.test(folded)) return '5'
  if (/einbehalten\S*\s+kirchensteuer/.test(folded)) return /ehegatte|lebenspartner/.test(folded) ? '7' : '6'

  return null
}

type SubRowKey = '22a' | '22b' | '23a' | '23b' | '24a' | '24b' | '24c'

/** A sub-row of the blocks 22 (employer's share), 23 (employee's share) and 24 (tax-free subsidies), on folded text. */
const SUB_ROW = /(?:^|[\s|:;])([abc2])\)\s*(zur\s+gesetzlichen\s+renten|an\s+berufsst|zur\s+gesetzlichen\s+kranken|zur\s+privaten\s+kranken|zur\s+gesetzlichen\s+pflege)/
/** The number of the block where it stands on the same line: "22. Arbeitgeber-", "23. Arbeiinehmer-", "24. Steuerfreie". */
const BLOCK_NUMBER = /(?:^|[\s|:;])(?:(22)[\s.]*arbeitgeb|(23)[\s.]*arbei\S{0,3}nehm|(24)[\s.]*steuerfr)/

/**
 * Which line of the certificate each sub-row a), b), c) of the blocks 22 to 24 is (real-data run, step
 * 3a). A form read by position has the block's number on another line than its sub-rows, so the
 * number alone does not tell. The subsidies to health and nursing-care insurance are always block 24.
 * The pension rows come twice, employer first: with the number on the row it decides, otherwise the
 * order does. A single pension row without a number is taken as the employee's (both shares are
 * equal by law) but stays ambiguous.
 */
function classifySubRows(lines: readonly string[]): { readonly keys: ReadonlyMap<number, SubRowKey>; readonly ambiguous: boolean } {
  const keys = new Map<number, SubRowKey>()
  const pension: { index: number; letter: 'a' | 'b'; block: '22' | '23' | null }[] = []
  lines.forEach((raw, index) => {
    const line = foldOcr(raw)
    const sub = SUB_ROW.exec(line)
    if (!sub) return
    const topic = sub[2]!
    if (!/renten|berufsst/.test(topic)) {
      // Block 24: a) statutory health, b) private health, c) statutory care insurance.
      keys.set(index, topic.includes('privaten') ? '24b' : topic.includes('pflege') ? '24c' : '24a')
      return
    }
    const number = BLOCK_NUMBER.exec(line.slice(0, sub.index + 1))
    pension.push({ index, letter: topic.includes('renten') ? 'a' : 'b', block: number?.[1] ? '22' : number?.[2] ? '23' : null })
  })
  let ambiguous = false
  for (const letter of ['a', 'b'] as const) {
    const rows = pension.filter((row) => row.letter === letter)
    const unnumbered = rows.filter((row) => row.block === null)
    const has = (block: '22' | '23') => rows.some((row) => row.block === block)
    unnumbered.forEach((row, i) => {
      // Employer first: the unnumbered row is the employee's when the employer's is known or stands before it.
      const employee = has('22') || (!has('23') && (unnumbered.length === 1 || i > 0))
      keys.set(row.index, employee ? `23${letter}` : `22${letter}`)
      if (unnumbered.length === 1 && !has('22') && !has('23') && extractTrailingAmount(lines[row.index]!, false) !== null) ambiguous = true
    })
    for (const row of rows) if (row.block !== null) keys.set(row.index, row.block === '23' ? `23${letter}` : `22${letter}`)
  }
  return { keys, ambiguous }
}

/**
 * Extracts the trailing monetary value from an LStB line, ignoring line ordinals such as
 * "ohne 9. und 10." or "von 3." at the middle of official BMF headings.
 */
function extractTrailingAmount(line: string, isRowHeader: boolean): number | null {
  let sanitized = (isRowHeader ? rowSegment(line) : line).replace(
    /\b(?:ohne|nach|von|gemäß|zu|lt\.|Zeile|Nr\.|Abs\.)\s+\d+\.?(?:\s*(?:und|bis|,|\/)\s*\d+\.?)*/gi,
    ' ',
  )
  if (isRowHeader) {
    sanitized = sanitized.replace(/^(?:Zeile\s+)?\d{1,2}\s*(?:[a-c][.)]?\s+|[.)]\s+|(?<=\s))(?=[A-Za-zÄÖÜäöüß(])/i, '')
  }
  // OCR of a photo turns the decimal comma at the end of the line into a quote, or splits it off
  // with a space ("5.051 ‚76", "4.182 ,64", "977'76"); only the last two digits of the line qualify.
  sanitized = sanitized.trim().replace(/(\d)\s*[,‚'’`´]\s*(\d{2})(\s*(?:€|EUR|Euro)?)$/i, '$1,$2$3')
  // OCR also writes the thousands point as a comma: "61,234,56".
  sanitized = sanitized.replace(/(^|\s)(\d{1,3}),(\d{3}),(\d{2})(?=\s*(?:€|EUR|Euro)?$)/i, '$1$2.$3,$4')

  if (!sanitized) return null

  const amountRegex = /(?:^|\s)((?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.]\d{1,2})?)(?:\s*(?:€|EUR|Euro))?(?=\s*$|\s+\S*$)/g
  let lastValid: number | null = null
  for (const m of sanitized.matchAll(amountRegex)) {
    const candidate = m[1]
    if (!candidate) continue
    const matchEnd = (m.index ?? 0) + m[0].length
    const trailing = sanitized.slice(matchEnd).trim()
    if (trailing && !/^(?:€|EUR|Euro)$/i.test(trailing)) continue
    const parsed = parseGermanOcrAmount(candidate)
    if (parsed !== null) {
      lastValid = parsed
    }
  }

  if (lastValid !== null) return lastValid

  // Standalone amount line fallback
  return parseGermanOcrAmount(sanitized)
}

/**
 * Stage 1 deterministic parser for German Lohnsteuerbescheinigungen: lines 3 and 4, the employee's
 * social security and every further line the mask has a field for (`lines`).
 * Never extracts PII (Steuer-ID, eTIN, Steuerklasse); the employer is read by `extractLstbEmployer`.
 */
export function parseLstbTextDeterministically(rawText: string): LstbExtractionResult {
  const taxYear = extractLstbTaxYear(rawText)
  const lines = rawText.split(/\r?\n/)

  const printed = new Map<TargetRowKey, number>()
  const conflicting = new Set<TargetRowKey>()
  // A row printed twice with different amounts keeps the first and is marked; Soli is compared in cents.
  const assignLine = (key: TargetRowKey, value: number) => {
    const before = printed.get(key)
    const same = (a: number, b: number) => (key === '5' ? Math.round(a * 100) === Math.round(b * 100) : Math.round(a) === Math.round(b))
    if (before === undefined) printed.set(key, value)
    else if (!same(before, value)) conflicting.add(key)
  }

  const subRows = classifySubRows(lines)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const subRow = subRows.keys.get(i)
    const matched = subRow ?? classifyLine(line)
    if (!matched || matched === 'other') {
      continue
    }

    let amount = subRow !== undefined ? extractTrailingAmount(line, false) : extractTrailingAmount(line, true)
    // Look ahead up to 2 continuation lines if amount is on the next line (wrapped table cell)
    if (amount === null) {
      for (let offset = 1; offset <= 2 && i + offset < lines.length; offset += 1) {
        const nextLine = lines[i + offset]!.trim()
        if (!nextLine) continue
        if (classifyLine(nextLine) !== null || subRows.keys.has(i + offset)) break
        const nextAmount = extractTrailingAmount(nextLine, false)
        if (nextAmount !== null) {
          amount = nextAmount
          break
        }
      }
    }

    if (amount !== null) {
      assignLine(matched, amount)
    }
  }

  const ambiguous = new Set<WageTaxCertificateFieldId>()
  if (conflicting.has('3')) ambiguous.add('bruttoarbeitslohn')
  if (conflicting.has('4')) ambiguous.add('lohnsteuer')
  const socialRows: readonly SocialRowKey[] = ['23a', '23b', '23', '25', '26', '27']
  if (subRows.ambiguous || socialRows.some((row) => conflicting.has(row))) ambiguous.add('sozialversicherung')

  const ambiguousLines = new Set<LstbScanLine>()
  for (const row of conflicting) if (row !== '3' && row !== '4') for (const line of LINES_OF_ROW[row]) ambiguousLines.add(line)
  // A single pension row without its block number may be the employer's.
  if (subRows.ambiguous) ambiguousLines.add('rvArbeitnehmer')

  const row = (key: TargetRowKey): number | null => printed.get(key) ?? null
  return evaluateLstbExtraction({
    taxYear,
    line3Brutto: row('3'),
    line4Lohnsteuer: row('4'),
    svBreakdown: {
      line23: row('23'),
      line23a: row('23a'),
      line23b: row('23b'),
      line25: row('25'),
      line26: row('26'),
      line27: row('27'),
    },
    extraRows: {
      '5': row('5'),
      '6': row('6'),
      '7': row('7'),
      '22a': row('22a'),
      '22b': row('22b'),
      '24a': row('24a'),
      '24b': row('24b'),
      '24c': row('24c'),
    },
    hasAmbiguity: [...ambiguous],
    ambiguousLines: [...ambiguousLines],
  })
}

const EMPLOYER_LABEL = /^(?:(?:name\s+(?:und\s+anschrift\s+)?|anschrift\s+(?:und\s+steuernummer\s+)?)des\s+arbeitgebers\s*:?|arbeitgeber\s*:)\s*(.*)$/i

/**
 * The employer as the certificate names it (ADR-0099 §8): the text after „Arbeitgeber:“ or „Anschrift (und
 * Steuernummer) des Arbeitgebers“, or the next line when the label stands alone. Only the name, up to the
 * first comma; never a certificate row or an amount. A photo's OCR is never green (`capOcrSourcedEmployer`).
 */
export function extractLstbEmployer(rawText: string): LstbExtractedEmployer {
  const lines = (rawText ?? '').split(/\r?\n/).map((line) => line.trim())
  for (let i = 0; i < lines.length; i += 1) {
    const label = EMPLOYER_LABEL.exec(lines[i]!)
    if (!label) continue
    const candidate = label[1]!.trim() !== '' ? label[1]! : (lines.slice(i + 1, i + 3).find((line) => line !== '') ?? '')
    const name = candidate.split(/,|\s{2,}|\s\/\s|\s\|\s/)[0]!.trim().slice(0, 100)
    if (name === '' || classifyLine(name) !== null || isAmountOnlyLine(name) || !/[A-Za-zÄÖÜäöüß]{2}/.test(name)) continue
    return { value: name, status: 'ok', reason: null }
  }
  return { value: null, status: 'pruefen', reason: 'missing' }
}

export interface LstbExtractedEmployer {
  readonly value: string | null
  readonly status: LstbExtractedFieldStatus
  readonly reason: 'missing' | 'ocr_source' | null
}

/** An employer read by OCR is never green, like every other value of a photo (ADR-0060). */
export function capOcrSourcedEmployer(employer: LstbExtractedEmployer): LstbExtractedEmployer {
  return employer.status === 'ok' ? { ...employer, status: 'pruefen', reason: 'ocr_source' } : employer
}

const BARE_AMOUNT = /^\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?$/
const AMOUNT_UNITS = ['€', 'euro', 'eur'] as const

/** A line that is nothing but one amount, with or without its currency. */
function isAmountOnlyLine(line: string): boolean {
  const text = line.trim()
  const unit = AMOUNT_UNITS.find((candidate) => text.slice(-candidate.length).toLowerCase() === candidate)
  return BARE_AMOUNT.test(unit === undefined ? text : text.slice(0, -unit.length).trimEnd())
}

/**
 * Allowlist for the text fallback (ADR-0058): keeps only the certificate rows 3, 4, 23–27
 * (plus a wrapped amount-only continuation line, found with the parser's own look-ahead) and a
 * synthetic year header. Everything
 * else — name, address, employer, Steuer-ID, eTIN, Steuerklasse — never leaves the server,
 * whether or not a scrubber would have recognised it.
 */
export function selectLstbRelevantLines(rawText: string): string {
  if (!rawText) return ''
  const lines = rawText.split(/\r?\n/)
  const kept: string[] = []
  const year = extractLstbTaxYear(rawText)
  if (year !== null) kept.push(`Lohnsteuerbescheinigung ${year}`)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim()
    const row = classifyLine(line)
    if (row === null || !FALLBACK_ROWS.has(row)) continue
    // Only from the row number on: a scan's left column (name, street) never leaves the server.
    kept.push(rowSegment(line))
    // Same look-ahead as the deterministic parser: up to 2 lines, blank lines skipped,
    // stopping at the next certificate row. Only a pure amount line is ever carried along.
    for (let offset = 1; offset <= 2 && i + offset < lines.length; offset += 1) {
      const next = lines[i + offset]!.trim()
      if (!next) continue
      if (classifyLine(next) !== null) break
      if (isAmountOnlyLine(next)) {
        kept.push(next)
        i += offset
      }
      break
    }
  }
  return kept.join('\n')
}

/** Raw line values a text fallback suggests; each is checked against the text it was shown. */
export interface LstbTextFallbackSuggestion {
  readonly line3Brutto: number | null
  readonly line4Lohnsteuer: number | null
  readonly svBreakdown: LstbSvBreakdown
}

function amountsPrintedIn(text: string): readonly number[] {
  const amounts: number[] = []
  for (const m of text.matchAll(/\d{1,3}(?:[.\s]\d{3})+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?/g)) {
    const parsed = parseGermanOcrAmount(m[0])
    if (parsed !== null) amounts.push(parsed)
  }
  return amounts
}

function groundedIn(printed: readonly number[], value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return printed.some((p) => Math.abs(p - value) < 0.005) ? value : null
}

/**
 * Merges a text-fallback suggestion into the deterministic result without ever producing
 * a false green (AC 4):
 * - a suggested amount counts only if it is literally printed in `groundingText`
 *   (the allowlisted text the model saw) — invented numbers are dropped;
 * - it only fills fields the deterministic parser left empty, never overrides one;
 * - every filled field is `pruefen` with reason `llm_suggested`;
 * - deterministic fields keep their status unless the merged values now contradict each
 *   other, in which case the shared plausibility rule downgrades them as well.
 */
export function applyLstbTextFallback(
  stage1: LstbExtractionResult,
  suggestion: LstbTextFallbackSuggestion,
  groundingText: string,
): LstbExtractionResult {
  const printed = amountsPrintedIn(groundingText)
  const rawAmount = (field: LstbExtractedField): number | null => field.calculation[0]?.amount ?? null

  const bruttoFromFallback = stage1.fields.bruttoarbeitslohn.value === null
  const lohnsteuerFromFallback = stage1.fields.lohnsteuer.value === null
  const svFromFallback = stage1.fields.sozialversicherung.value === null

  const groundedSv: LstbSvBreakdown = {
    line23: groundedIn(printed, suggestion.svBreakdown.line23),
    line23a: groundedIn(printed, suggestion.svBreakdown.line23a),
    line23b: groundedIn(printed, suggestion.svBreakdown.line23b),
    line25: groundedIn(printed, suggestion.svBreakdown.line25),
    line26: groundedIn(printed, suggestion.svBreakdown.line26),
    line27: groundedIn(printed, suggestion.svBreakdown.line27),
  }

  const merged = evaluateLstbExtraction({
    taxYear: stage1.taxYear,
    line3Brutto: bruttoFromFallback
      ? groundedIn(printed, suggestion.line3Brutto)
      : rawAmount(stage1.fields.bruttoarbeitslohn),
    line4Lohnsteuer: lohnsteuerFromFallback
      ? groundedIn(printed, suggestion.line4Lohnsteuer)
      : rawAmount(stage1.fields.lohnsteuer),
    svBreakdown: svFromFallback ? groundedSv : stage1.svBreakdown,
  })

  const pick = (
    id: WageTaxCertificateFieldId,
    fromFallback: boolean,
  ): LstbExtractedField => {
    const before = stage1.fields[id]
    const after = merged.fields[id]
    if (fromFallback) {
      return after.value === null ? before : { ...after, status: 'pruefen', reason: 'llm_suggested' }
    }
    // Never upgrade: a deterministic `pruefen` stays as it was.
    if (before.status === 'pruefen') return before
    return after.status === 'pruefen' ? { ...before, status: 'pruefen', reason: after.reason } : before
  }

  const fields = {
    bruttoarbeitslohn: pick('bruttoarbeitslohn', bruttoFromFallback),
    lohnsteuer: pick('lohnsteuer', lohnsteuerFromFallback),
    sozialversicherung: pick('sozialversicherung', svFromFallback),
  }
  return {
    taxYear: stage1.taxYear,
    fields,
    svBreakdown: svFromFallback ? merged.svBreakdown : stage1.svBreakdown,
    // The fallback reads only the three fields; the further lines stay as the deterministic parser read them.
    lines: stage1.lines,
    unresolvedFields: (Object.keys(fields) as WageTaxCertificateFieldId[]).filter((id) => fields[id].status === 'pruefen'),
  }
}

/**
 * Text that came from OCR (photo, scanned PDF) is not trusted to be green (ADR-0060, AC 4):
 * every `ok` field becomes `pruefen` with reason `ocr_source`. Only a PDF text layer can be green.
 */
export function capOcrSourcedExtraction(result: LstbExtractionResult): LstbExtractionResult {
  const cap = (field: LstbExtractedField): LstbExtractedField =>
    field.status === 'ok' ? { ...field, status: 'pruefen', reason: 'ocr_source' } : field
  const fields = {
    bruttoarbeitslohn: cap(result.fields.bruttoarbeitslohn),
    lohnsteuer: cap(result.fields.lohnsteuer),
    sozialversicherung: cap(result.fields.sozialversicherung),
  }
  const lines = Object.fromEntries(LSTB_SCAN_LINES.map((line) => [line, cap(result.lines[line])])) as Record<LstbScanLine, LstbExtractedField>
  return {
    ...result,
    fields,
    lines,
    unresolvedFields: (Object.keys(fields) as WageTaxCertificateFieldId[]).filter((id) => fields[id].status === 'pruefen'),
  }
}
