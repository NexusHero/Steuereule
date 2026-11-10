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

export interface LstbExtractionResult {
  readonly taxYear: number | null
  readonly fields: {
    readonly bruttoarbeitslohn: LstbExtractedField
    readonly lohnsteuer: LstbExtractedField
    readonly sozialversicherung: LstbExtractedField
  }
  readonly svBreakdown: LstbSvBreakdown
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
    /Lohnsteuerbescheinigung\s+(?:für\s+(?:das\s+)?)?(?:Kalenderjahr\s+)?(20\d{2})\b/i,
    /(?:für\s+das\s+Kalenderjahr|Kalenderjahr)\s*[:-]?\s*(20\d{2})\b/i,
    /Bescheinigungszeitraum[^\n]*?(20\d{2})\b/i,
    /Zeitraum\s*[:-]?\s*\d{2}\.\d{2}\.(20\d{2})\s*(?:-|bis)\s*\d{2}\.\d{2}\.(20\d{2})\b/i,
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
  const svRawSum = svEntries.reduce((acc, item) => acc + item.amount, 0)
  const svRounded = svEntries.length > 0 ? Math.round(svRawSum) : null
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
    } else if (svCategoriesPresent.size < 2 && svRounded > 0) {
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

  return {
    taxYear,
    fields: {
      bruttoarbeitslohn: bruttoField,
      lohnsteuer: lohnsteuerField,
      sozialversicherung: svField,
    },
    svBreakdown,
    unresolvedFields,
  }
}

type TargetRowKey = '3' | '4' | '23a' | '23b' | '23' | '25' | '26' | '27'
type MatchedRowKey = TargetRowKey | 'other'

function classifyLine(rawLine: string): MatchedRowKey | null {
  const line = rawLine.trim()
  if (!line) return null
  // Monetary amounts at start of line (e.g. "3.906,00", "6.450,00 EUR", "25,50") are never row numbers
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?(?:\s*(?:€|EUR|Euro))?\b/i.test(line)) return null
  if (/^\d+[,.]\d{1,2}(?:\s*(?:€|EUR|Euro))?(?:\s|$)/i.test(line)) return null

  // Employer/non-AN lines checked first so they never alias to AN lines
  if (/^(?:Zeile\s+)?22\s*[ab](?:\b|[.)])/i.test(line)) return 'other'
  if (/^(?:Zeile\s+)?24(?![\d,]|\.\d)(?:\b|[a-c.)])/i.test(line)) return 'other'

  if (/^(?:Zeile\s+)?23\s*a(?![\d])(?:\b|[.)])/i.test(line) || /^23\.\s*a\)/i.test(line)) return '23a'
  if (/^(?:Zeile\s+)?23\s*b(?![\d])(?:\b|[.)])/i.test(line) || /^23\.\s*b\)/i.test(line)) return '23b'
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
  if (/Arbeitnehmerbeiträge.*gesetzlichen\s+Krankenversicherung/i.test(line)) return '25'
  if (/Arbeitnehmerbeiträge.*sozialen\s+Pflegeversicherung/i.test(line)) return '26'
  if (/Arbeitnehmerbeiträge.*Arbeitslosenversicherung/i.test(line)) return '27'

  return null
}

/**
 * Extracts the trailing monetary value from an LStB line, ignoring line ordinals such as
 * "ohne 9. und 10." or "von 3." at the middle of official BMF headings.
 */
function extractTrailingAmount(line: string, isRowHeader: boolean): number | null {
  let sanitized = line.replace(
    /\b(?:ohne|nach|von|gemäß|zu|lt\.|Zeile|Nr\.|Abs\.)\s+\d+\.?(?:\s*(?:und|bis|,|\/)\s*\d+\.?)*/gi,
    ' ',
  )
  if (isRowHeader) {
    sanitized = sanitized.replace(/^(?:Zeile\s+)?\d{1,2}\s*[a-c]?[.)]?(?=\s+[A-Za-zÄÖÜäöüß(])\s*/i, '')
  }
  sanitized = sanitized.trim()

  if (!sanitized) return null

  const amountRegex = /(?:^|\s)((?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*(?:€|EUR|Euro)?(?=\s*$|\s+\S*$)/g
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
 * Stage 1 deterministic parser for German Lohnsteuerbescheinigungen.
 * Never extracts PII (Steuer-ID, eTIN, employer, Steuerklasse).
 */
export function parseLstbTextDeterministically(rawText: string): LstbExtractionResult {
  const taxYear = extractLstbTaxYear(rawText)
  const lines = rawText.split(/\r?\n/)

  let line3: number | null = null
  let line4: number | null = null
  let line23: number | null = null
  let line23a: number | null = null
  let line23b: number | null = null
  let line25: number | null = null
  let line26: number | null = null
  let line27: number | null = null

  const ambiguous = new Set<WageTaxCertificateFieldId>()

  const assignLine = (key: TargetRowKey, value: number) => {
    switch (key) {
      case '3':
        if (line3 !== null && Math.round(line3) !== Math.round(value)) ambiguous.add('bruttoarbeitslohn')
        else line3 = value
        break
      case '4':
        if (line4 !== null && Math.round(line4) !== Math.round(value)) ambiguous.add('lohnsteuer')
        else line4 = value
        break
      case '23a':
        if (line23a !== null && Math.round(line23a) !== Math.round(value)) ambiguous.add('sozialversicherung')
        else line23a = value
        break
      case '23b':
        if (line23b !== null && Math.round(line23b) !== Math.round(value)) ambiguous.add('sozialversicherung')
        else line23b = value
        break
      case '23':
        if (line23 !== null && Math.round(line23) !== Math.round(value)) ambiguous.add('sozialversicherung')
        else line23 = value
        break
      case '25':
        if (line25 !== null && Math.round(line25) !== Math.round(value)) ambiguous.add('sozialversicherung')
        else line25 = value
        break
      case '26':
        if (line26 !== null && Math.round(line26) !== Math.round(value)) ambiguous.add('sozialversicherung')
        else line26 = value
        break
      case '27':
        if (line27 !== null && Math.round(line27) !== Math.round(value)) ambiguous.add('sozialversicherung')
        else line27 = value
        break
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const matched = classifyLine(line)
    if (!matched || matched === 'other') {
      continue
    }

    let amount = extractTrailingAmount(line, true)
    // Look ahead up to 2 continuation lines if amount is on the next line (wrapped table cell)
    if (amount === null) {
      for (let offset = 1; offset <= 2 && i + offset < lines.length; offset += 1) {
        const nextLine = lines[i + offset]!.trim()
        if (!nextLine) continue
        if (classifyLine(nextLine) !== null) break
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

  return evaluateLstbExtraction({
    taxYear,
    line3Brutto: line3,
    line4Lohnsteuer: line4,
    svBreakdown: {
      line23,
      line23a,
      line23b,
      line25,
      line26,
      line27,
    },
    hasAmbiguity: [...ambiguous],
  })
}

const AMOUNT_ONLY_LINE = /^\s*\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?\s*(?:€|EUR|Euro)?\s*$/i

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
    if (row === null || row === 'other') continue
    kept.push(line)
    // Same look-ahead as the deterministic parser: up to 2 lines, blank lines skipped,
    // stopping at the next certificate row. Only a pure amount line is ever carried along.
    for (let offset = 1; offset <= 2 && i + offset < lines.length; offset += 1) {
      const next = lines[i + offset]!.trim()
      if (!next) continue
      if (classifyLine(next) !== null) break
      if (AMOUNT_ONLY_LINE.test(next)) {
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
  return {
    ...result,
    fields,
    unresolvedFields: (Object.keys(fields) as WageTaxCertificateFieldId[]).filter((id) => fields[id].status === 'pruefen'),
  }
}
