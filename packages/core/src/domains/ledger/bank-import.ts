import { createHash } from 'node:crypto'
import type { BookingTaxKey } from './accounts'
import type { EntryDraft, IsoDate } from './journal'
import { at, childrenNamed, parseXml, textAt, XmlError, type XmlElement } from './xml'

/**
 * Bank statements as files (ADR-0101 §14): CAMT.053 and CSV. No bank credentials, no network. The
 * app suggests bookings from rules and matches open invoices; nothing is booked until the user takes
 * a suggestion over (ADR-0066).
 */

export interface BankTransaction {
  readonly accountIban: string | null
  readonly bookingDate: IsoDate
  readonly valueDate: IsoDate | null
  /** Signed cents: positive is money in. */
  readonly amount: number
  readonly currency: string
  readonly counterpartyName: string | null
  readonly counterpartyIban: string | null
  readonly reference: string
  readonly endToEndId: string | null
  readonly bankReference: string | null
}

export interface ImportedTransaction extends BankTransaction {
  /** Stable across re-imports of the same statement, also of overlapping date ranges. */
  readonly fingerprint: string
}

export class BankImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BankImportError'
  }
}

// ---------------------------------------------------------------------------------------------------
// Amounts and dates

/** Parses a decimal string to cents without floating point, so 0.1 + 0.2 never matters. */
export function parseAmountToCents(raw: string, decimal: ',' | '.'): number {
  let s = raw.replaceAll(/[\s €]|EUR/g, '')
  let negative = false
  if (s.startsWith('-')) { negative = true; s = s.slice(1) } else if (s.endsWith('-')) { negative = true; s = s.slice(0, -1) } else if (s.startsWith('+')) s = s.slice(1)
  const thousands = decimal === ',' ? '.' : ','
  s = s.replaceAll(thousands, '')
  const [whole = '', fraction = '', ...rest] = s.split(decimal)
  if (rest.length > 0 || !/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) throw new BankImportError(`Betrag nicht lesbar: ${raw}`)
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -cents : cents
}

export type CsvDateFormat = 'DD.MM.YYYY' | 'DD.MM.YY' | 'YYYY-MM-DD'

export function parseBankDate(raw: string, format: CsvDateFormat): IsoDate {
  const s = raw.trim()
  let m: RegExpExecArray | null
  if (format === 'YYYY-MM-DD') m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  else if (format === 'DD.MM.YYYY') m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s)
  else m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s)
  if (m === null) throw new BankImportError(`Datum nicht lesbar: ${raw}`)
  // Two-digit years in bank exports are this century: statements are not older than 2000.
  const iso = format === 'YYYY-MM-DD' ? `${m[1]}-${m[2]}-${m[3]}` : `${format === 'DD.MM.YY' ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new BankImportError(`Datum nicht lesbar: ${raw}`)
  return iso
}

// ---------------------------------------------------------------------------------------------------
// CAMT.053

function camtDate(element: XmlElement | null): IsoDate | null {
  const raw = textAt(element, 'Dt') ?? textAt(element, 'DtTm')
  return raw === null ? null : raw.slice(0, 10)
}

function partyName(party: XmlElement | null): string | null {
  return textAt(party, 'Nm') ?? textAt(party, 'Pty/Nm')
}

function cleanRef(value: string | null): string | null {
  return value === null || value === '' || value === 'NOTPROVIDED' ? null : value
}

/** Reads the booked entries of a CAMT.053 statement (camt.053.001.02 to .08). Pending entries are skipped. */
export function parseCamt053(xml: string): readonly BankTransaction[] {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (e) {
    throw new BankImportError(e instanceof XmlError ? `CAMT-Datei nicht lesbar: ${e.message}` : 'CAMT-Datei nicht lesbar')
  }
  const statementRoot = at(root, 'BkToCstmrStmt')
  if (root.name !== 'Document' || statementRoot === null) throw new BankImportError('Keine CAMT.053-Datei (BkToCstmrStmt fehlt)')
  const result: BankTransaction[] = []
  for (const stmt of childrenNamed(statementRoot, 'Stmt')) {
    const accountIban = textAt(stmt, 'Acct/Id/IBAN')
    for (const ntry of childrenNamed(stmt, 'Ntry')) {
      const status = textAt(ntry, 'Sts/Cd') ?? textAt(ntry, 'Sts')
      if (status !== null && status !== 'BOOK') continue
      const credit = textAt(ntry, 'CdtDbtInd') === 'CRDT'
      const sign = credit ? 1 : -1
      const bookingDate = camtDate(at(ntry, 'BookgDt'))
      if (bookingDate === null) throw new BankImportError('Buchungsdatum fehlt in einem Umsatz')
      const entryAmount = parseAmountToCents(textAt(ntry, 'Amt') ?? '', '.')
      const currency = at(ntry, 'Amt')?.attrs.Ccy ?? 'EUR'
      const details = childrenNamed(at(ntry, 'NtryDtls') ?? ntry, 'TxDtls')
      const detailAmounts = details.map((d) => textAt(d, 'Amt') ?? textAt(d, 'AmtDtls/TxAmt/Amt'))
      // A batch entry is split into its transactions only when they carry amounts that add up.
      const split = details.length > 1 && detailAmounts.every((a) => a !== null) &&
        detailAmounts.reduce((acc, a) => acc + parseAmountToCents(a!, '.'), 0) === entryAmount
      const parts = details.length === 0 ? [null] : split ? details : [details[0]!]
      for (const [i, tx] of parts.entries()) {
        const counterparty = credit ? 'Dbtr' : 'Cdtr'
        const amount = split ? parseAmountToCents(detailAmounts[i]!, '.') : entryAmount
        result.push({
          accountIban,
          bookingDate,
          valueDate: camtDate(at(ntry, 'ValDt')),
          amount: sign * amount,
          currency,
          counterpartyName: partyName(at(tx, `RltdPties/${counterparty}`)),
          counterpartyIban: textAt(tx, `RltdPties/${counterparty}Acct/Id/IBAN`),
          reference: tx === null ? (textAt(ntry, 'AddtlNtryInf') ?? '') : childrenNamed(at(tx, 'RmtInf') ?? tx, 'Ustrd').map((u) => u.text).join(' ').trim(),
          endToEndId: cleanRef(textAt(tx, 'Refs/EndToEndId')),
          bankReference: cleanRef(textAt(ntry, 'AcctSvcrRef')),
        })
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------------------------------
// CSV

/** A column by header name; `nth` picks a repeated header (ING has „Währung“ twice). */
export type CsvColumn = string | { readonly name: string; readonly nth: number }

export interface CsvMapping {
  readonly delimiter: ';' | ',' | '\t'
  readonly decimal: ',' | '.'
  readonly dateFormat: CsvDateFormat
  readonly bookingDate: CsvColumn
  readonly valueDate?: CsvColumn
  /** One signed column, or separate debit and credit columns (both unsigned). */
  readonly amount: CsvColumn | { readonly debit: CsvColumn; readonly credit: CsvColumn }
  /** One column, or one per direction (DKB names payer and payee separately). */
  readonly counterpartyName?: CsvColumn | { readonly incoming: CsvColumn; readonly outgoing: CsvColumn }
  readonly counterpartyIban?: CsvColumn
  /** Several columns are joined with a space. */
  readonly reference: CsvColumn | readonly CsvColumn[]
  readonly currency?: CsvColumn
  readonly endToEndId?: CsvColumn
  readonly accountIban?: CsvColumn
  readonly defaultCurrency?: string
}

export type BankCsvPreset = 'sparkasse' | 'ing' | 'dkb' | 'commerzbank'

/** Column layouts of common German exports (the CSV the bank's online banking offers). */
export const BANK_CSV_PRESETS: Readonly<Record<BankCsvPreset, CsvMapping>> = {
  // Sparkasse „CSV-CAMT V2“.
  sparkasse: {
    delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YY',
    bookingDate: 'Buchungstag', valueDate: 'Valutadatum', amount: 'Betrag',
    counterpartyName: 'Beguenstigter/Zahlungspflichtiger', counterpartyIban: 'Kontonummer/IBAN',
    reference: 'Verwendungszweck', currency: 'Waehrung', endToEndId: 'Kundenreferenz (End-to-End)', accountIban: 'Auftragskonto',
  },
  // ING: a preamble with account data, then the table; the second „Währung“ belongs to „Betrag“.
  ing: {
    delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YYYY',
    bookingDate: 'Buchung', valueDate: 'Valuta', amount: 'Betrag', counterpartyName: 'Auftraggeber/Empfänger',
    reference: 'Verwendungszweck', currency: { name: 'Währung', nth: 2 },
  },
  // DKB since 2023: payer and payee in two columns, the amount header carries the currency.
  dkb: {
    delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YY',
    bookingDate: 'Buchungsdatum', valueDate: 'Wertstellung', amount: 'Betrag (€)',
    counterpartyName: { incoming: 'Zahlungspflichtige*r', outgoing: 'Zahlungsempfänger*in' }, counterpartyIban: 'IBAN',
    reference: 'Verwendungszweck', endToEndId: 'Kundenreferenz', defaultCurrency: 'EUR',
  },
  commerzbank: {
    delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YYYY',
    bookingDate: 'Buchungstag', valueDate: 'Wertstellung', amount: 'Betrag',
    reference: 'Buchungstext', currency: 'Währung', accountIban: 'IBAN Kontoinhaber',
  },
}

/** RFC 4180 rows: quoted fields may hold the delimiter, doubled quotes and line breaks. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++ } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) { row.push(field); field = '' } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const colName = (c: CsvColumn): string => (typeof c === 'string' ? c : c.name)

function columnIndex(header: readonly string[], column: CsvColumn): number {
  const name = colName(column)
  const nth = typeof column === 'string' ? 1 : column.nth
  let seen = 0
  for (let i = 0; i < header.length; i++) {
    if (header[i]!.trim() === name && ++seen === nth) return i
  }
  throw new BankImportError(`Spalte „${name}“ fehlt in der Datei`)
}

/** Reads a CSV export with a mapping; the header row is found by the booking date column, after any preamble. */
export function parseBankCsv(text: string, mapping: CsvMapping): readonly BankTransaction[] {
  const rows = parseCsvRows(text, mapping.delimiter)
  const headerAt = rows.findIndex((r) => r.some((f) => f.trim() === colName(mapping.bookingDate)))
  if (headerAt === -1) throw new BankImportError(`Kopfzeile mit „${colName(mapping.bookingDate)}“ nicht gefunden`)
  const header = rows[headerAt]!
  const idx = (c: CsvColumn | undefined): number | null => (c === undefined ? null : columnIndex(header, c))
  const amountCols = typeof mapping.amount === 'object' && 'debit' in mapping.amount
    ? { debit: idx(mapping.amount.debit)!, credit: idx(mapping.amount.credit)! }
    : { signed: idx(mapping.amount as CsvColumn)! }
  const nameCols = mapping.counterpartyName === undefined ? null
    : typeof mapping.counterpartyName === 'object' && 'incoming' in mapping.counterpartyName
      ? { incoming: idx(mapping.counterpartyName.incoming)!, outgoing: idx(mapping.counterpartyName.outgoing)! }
      : { both: idx(mapping.counterpartyName as CsvColumn)! }
  const refCols = (Array.isArray(mapping.reference) ? mapping.reference : [mapping.reference as CsvColumn]).map((c) => idx(c)!)
  const cols = {
    bookingDate: idx(mapping.bookingDate)!, valueDate: idx(mapping.valueDate), iban: idx(mapping.counterpartyIban),
    currency: idx(mapping.currency), endToEnd: idx(mapping.endToEndId), account: idx(mapping.accountIban),
  }
  const cell = (row: readonly string[], i: number | null): string | null => {
    if (i === null) return null
    const v = row[i]?.trim() ?? ''
    return v === '' ? null : v
  }
  const result: BankTransaction[] = []
  for (const row of rows.slice(headerAt + 1)) {
    const booking = cell(row, cols.bookingDate)
    if (booking === null) continue
    let amount: number
    if ('signed' in amountCols) amount = parseAmountToCents(cell(row, amountCols.signed) ?? '', mapping.decimal)
    else {
      const debit = cell(row, amountCols.debit)
      const credit = cell(row, amountCols.credit)
      amount = credit === null ? -Math.abs(parseAmountToCents(debit ?? '', mapping.decimal)) : Math.abs(parseAmountToCents(credit, mapping.decimal))
    }
    const name = nameCols === null ? null : 'both' in nameCols ? cell(row, nameCols.both) : cell(row, amount >= 0 ? nameCols.incoming : nameCols.outgoing)
    const valueDate = cell(row, cols.valueDate)
    result.push({
      accountIban: cell(row, cols.account)?.replaceAll(' ', '') ?? null,
      bookingDate: parseBankDate(booking, mapping.dateFormat),
      valueDate: valueDate === null ? null : parseBankDate(valueDate, mapping.dateFormat),
      amount,
      currency: cell(row, cols.currency) ?? mapping.defaultCurrency ?? 'EUR',
      counterpartyName: name,
      counterpartyIban: cell(row, cols.iban)?.replaceAll(' ', '') ?? null,
      reference: refCols.map((i) => cell(row, i)).filter((v) => v !== null).join(' '),
      endToEndId: cleanRef(cell(row, cols.endToEnd)),
      bankReference: null,
    })
  }
  return result
}

// ---------------------------------------------------------------------------------------------------
// Fingerprint and dedupe

const normalize = (s: string | null): string => (s ?? '').toUpperCase().replaceAll(/\s+/g, ' ').trim()

/**
 * The fingerprint covers what a bank does not change between two exports of the same booking. Two
 * identical bookings on one day (two equal coffees) get their running number within that day, so
 * they stay two; a re-import of the same day yields the same numbers again.
 */
export function withFingerprints(transactions: readonly BankTransaction[]): readonly ImportedTransaction[] {
  const occurrences = new Map<string, number>()
  return transactions.map((tx) => {
    const basis = [normalize(tx.accountIban), tx.bookingDate, String(tx.amount), tx.currency, normalize(tx.counterpartyIban), normalize(tx.counterpartyName), normalize(tx.reference), normalize(tx.endToEndId)].join('|')
    const n = (occurrences.get(basis) ?? 0) + 1
    occurrences.set(basis, n)
    return { ...tx, fingerprint: createHash('sha256').update(`${basis}|${n}`).digest('hex') }
  })
}

export function dedupeTransactions(known: ReadonlySet<string>, incoming: readonly ImportedTransaction[]): { readonly fresh: readonly ImportedTransaction[]; readonly duplicates: readonly ImportedTransaction[] } {
  const fresh: ImportedTransaction[] = []
  const duplicates: ImportedTransaction[] = []
  for (const tx of incoming) (known.has(tx.fingerprint) ? duplicates : fresh).push(tx)
  return { fresh, duplicates }
}

// ---------------------------------------------------------------------------------------------------
// Booking suggestions

export interface BookingRule {
  readonly id: string
  readonly counterpartyIban?: string
  readonly counterpartyNameContains?: string
  readonly referenceContains?: string
  readonly direction?: 'in' | 'out'
  readonly account: string
  readonly taxKey: BookingTaxKey
  readonly text?: string
}

export interface BookingSuggestion {
  readonly ruleId: string
  readonly account: string
  readonly taxKey: BookingTaxKey
  readonly text: string
}

function ruleScore(rule: BookingRule, tx: BankTransaction): number | null {
  let score = 0
  let criteria = 0
  if (rule.direction !== undefined) {
    if ((rule.direction === 'in') !== (tx.amount > 0)) return null
    score += 1
  }
  if (rule.counterpartyIban !== undefined) {
    criteria++
    if (normalize(rule.counterpartyIban).replaceAll(' ', '') !== normalize(tx.counterpartyIban).replaceAll(' ', '')) return null
    score += 8
  }
  if (rule.counterpartyNameContains !== undefined) {
    criteria++
    if (!normalize(tx.counterpartyName).includes(normalize(rule.counterpartyNameContains))) return null
    score += 4
  }
  if (rule.referenceContains !== undefined) {
    criteria++
    if (!normalize(tx.reference).includes(normalize(rule.referenceContains))) return null
    score += 2
  }
  // A rule without any criterion would match every transaction; it is a misconfiguration, not a fallback.
  return criteria === 0 ? null : score
}

/** The most specific matching rule wins (IBAN over name over reference); ties go to the earlier rule. */
export function suggestBooking(tx: BankTransaction, rules: readonly BookingRule[]): BookingSuggestion | null {
  let best: { rule: BookingRule; score: number } | null = null
  for (const rule of rules) {
    const score = ruleScore(rule, tx)
    if (score !== null && (best === null || score > best.score)) best = { rule, score }
  }
  if (best === null) return null
  return { ruleId: best.rule.id, account: best.rule.account, taxKey: best.rule.taxKey, text: best.rule.text ?? (tx.counterpartyName ?? tx.reference) }
}

/** The draft a suggestion becomes when the user takes it: bank against the suggested account. */
export function draftFromTransaction(tx: BankTransaction, bankAccount: string, suggestion: BookingSuggestion, documentNumber: string, receiptRef: string | null = null): EntryDraft {
  const amount = Math.abs(tx.amount)
  const incoming = tx.amount > 0
  return {
    date: tx.bookingDate,
    documentNumber,
    receiptRef,
    text: suggestion.text,
    lines: incoming
      ? [{ account: bankAccount, side: 'debit', amount }, { account: suggestion.account, side: 'credit', amount, taxKey: suggestion.taxKey }]
      : [{ account: suggestion.account, side: 'debit', amount, taxKey: suggestion.taxKey }, { account: bankAccount, side: 'credit', amount }],
  }
}

// ---------------------------------------------------------------------------------------------------
// Matching to open receipts and invoices

export interface OpenItem {
  readonly id: string
  /** Signed cents the bank should show: positive for an invoice we wrote, negative for one we owe. */
  readonly amount: number
  readonly date: IsoDate
  readonly dueDate?: IsoDate
  /** Invoice number or similar the payer is expected to quote. */
  readonly reference?: string
  readonly counterpartyName?: string
}

export interface OpenItemMatch {
  readonly item: OpenItem
  readonly score: number
  readonly reasons: readonly ('amount' | 'reference' | 'counterparty' | 'date')[]
}

const DAY = 86_400_000
const dayNumber = (d: IsoDate): number => Date.parse(`${d}T00:00:00Z`) / DAY
const compact = (s: string | null | undefined): string => normalize(s ?? null).replaceAll(/[^A-Z0-9]/g, '')

/**
 * Candidates for a transaction: the amount must be exact, the payment not earlier than a few days
 * before the invoice and not later than `windowDays` after its due date. Best match first.
 */
export function matchOpenItems(tx: BankTransaction, items: readonly OpenItem[], windowDays = 30): readonly OpenItemMatch[] {
  const paid = dayNumber(tx.bookingDate)
  const matches: OpenItemMatch[] = []
  for (const item of items) {
    if (item.amount !== tx.amount) continue
    const from = dayNumber(item.date) - 3
    const to = dayNumber(item.dueDate ?? item.date) + windowDays
    if (paid < from || paid > to) continue
    const reasons: OpenItemMatch['reasons'][number][] = ['amount', 'date']
    let score = 50 + Math.round(10 * (1 - Math.abs(paid - dayNumber(item.dueDate ?? item.date)) / (windowDays + 3)))
    const ref = compact(item.reference)
    if (ref !== '' && compact(tx.reference).includes(ref)) { score += 40; reasons.push('reference') }
    if (item.counterpartyName !== undefined && compact(tx.counterpartyName).includes(compact(item.counterpartyName))) { score += 10; reasons.push('counterparty') }
    matches.push({ item, score, reasons })
  }
  return matches.sort((a, b) => b.score - a.score)
}
