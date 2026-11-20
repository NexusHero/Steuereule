import { accountFor, findAccount, type AccountConceptId, type BookingTaxKey, type ChartOfAccounts } from './accounts'

/**
 * The journal (ADR-0101 §11): one book for every self-employed user, from which EÜR, Bilanz, VAT and
 * trade tax are derived. Amounts are integer cents, always positive; the side says debit or credit.
 * An entry is never edited: a correction is a Storno entry that mirrors the original (GoBD Rz. 58 ff.).
 */

export type BookkeepingMode = 'euer' | 'bilanz'
export type Side = 'debit' | 'credit'
/** Calendar date `YYYY-MM-DD`. */
export type IsoDate = string

/** A payment that recurs (rent, VAT prepayment, insurance): § 11 Abs. 1 S. 2, Abs. 2 S. 2 EStG may move it. */
export interface RegularPayment {
  /** The due date after any § 108 AO weekend shift: BFH VIII R 25/20 counts the shifted date. */
  readonly dueDate: IsoDate
  /** The year the payment belongs to economically (December rent, the December VAT prepayment). */
  readonly periodYear: number
}

export interface EntryDraftLine {
  readonly account: string
  readonly side: Side
  readonly amount: number
  /** Splits or adds VAT; omitted means `none`, the account's default is a hint for the UI only. */
  readonly taxKey?: BookingTaxKey
  /** Gross for `ust*`/`vst*` unless `net`; reverse-charge keys always take the net amount. */
  readonly amountIs?: 'gross' | 'net'
}

export interface EntryDraft {
  readonly date: IsoDate
  readonly documentNumber: string
  readonly receiptRef?: string | null
  readonly text: string
  readonly lines: readonly EntryDraftLine[]
  readonly regularPayment?: RegularPayment
  /** The customer's or supplier's foreign VAT id, for the Zusammenfassende Meldung (§ 18a Abs. 7 UStG). */
  readonly counterpartyVatId?: string
}

export interface JournalLine {
  readonly account: string
  readonly side: Side
  readonly amount: number
  readonly taxKey: BookingTaxKey
  /** `base` is the net amount a tax key applies to, `tax` the VAT line it produced. */
  readonly taxPart: 'base' | 'tax' | null
}

export interface JournalEntry {
  /** Gapless, starting at 1 (GoBD Rz. 94: a complete, sequential record). */
  readonly number: number
  readonly date: IsoDate
  readonly documentNumber: string
  readonly receiptRef: string | null
  readonly text: string
  readonly lines: readonly JournalLine[]
  readonly regularPayment: RegularPayment | null
  /** The number of the entry this Storno reverses. */
  readonly reversalOf: number | null
  /**
   * The counterparty's foreign VAT id (ADR-0101 §22, § 18a UStG). Absent, not null, when there is none:
   * the canonical JSON leaves it out, so the hash of every older entry stays as it was.
   */
  readonly counterpartyVatId?: string
}

export interface Ledger {
  readonly chart: ChartOfAccounts
  readonly mode: BookkeepingMode
  readonly entries: readonly JournalEntry[]
  /** Festschreibung: no entry may be dated on or before this day (gobd.ts moves it). */
  readonly lockedThrough: IsoDate | null
}

export type LedgerErrorCode =
  | 'invalid_date'
  | 'missing_document_number'
  | 'too_few_lines'
  | 'invalid_amount'
  | 'unknown_account'
  | 'unbalanced'
  | 'period_locked'
  | 'entry_not_found'
  | 'already_reversed'
  | 'reversal_of_reversal'

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode, message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}

interface TaxKeySpec {
  readonly rate: number
  /** Concept of the output VAT account (Umsatzsteuer), if the key creates one. */
  readonly output: AccountConceptId | null
  /** Concept of the input VAT account (Vorsteuer), if the key creates one. */
  readonly input: AccountConceptId | null
}

export const TAX_KEYS: Readonly<Record<BookingTaxKey, TaxKeySpec>> = {
  none: { rate: 0, output: null, input: null },
  ust0: { rate: 0, output: null, input: null },
  steuerfrei: { rate: 0, output: null, input: null },
  kleinunternehmer: { rate: 0, output: null, input: null },
  igLieferung: { rate: 0, output: null, input: null },
  ust19: { rate: 19, output: 'vat_19', input: null },
  ust7: { rate: 7, output: 'vat_7', input: null },
  vst19: { rate: 19, output: null, input: 'input_vat_19' },
  vst7: { rate: 7, output: null, input: 'input_vat_7' },
  // Reverse charge: the recipient owes the tax and deducts it at once, so both lines arise together.
  rc13b19: { rate: 19, output: 'vat_13b_19', input: 'input_vat_13b_19' },
  rcEu19: { rate: 19, output: 'vat_13b_19', input: 'input_vat_13b_19' },
  euLeistung: { rate: 0, output: null, input: null },
  igErwerb19: { rate: 19, output: 'vat_ig_19', input: 'input_vat_ig_19' },
  igErwerb7: { rate: 7, output: 'vat_ig_7', input: 'input_vat_ig_7' },
}

export function createLedger(chart: ChartOfAccounts, mode: BookkeepingMode): Ledger {
  return Object.freeze({ chart, mode, entries: Object.freeze([]), lockedThrough: null })
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isBookingDate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (m === null) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === value
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4))
}

/** VAT contained in a gross amount, rounded half away from zero to the cent. */
export function vatFromGross(gross: number, rate: number): number {
  return Math.round((gross * rate) / (100 + rate))
}

export function vatOnNet(net: number, rate: number): number {
  return Math.round((net * rate) / 100)
}

function expandLine(chart: ChartOfAccounts, line: EntryDraftLine): JournalLine[] {
  const taxKey = line.taxKey ?? 'none'
  const spec = TAX_KEYS[taxKey]
  const plain = (account: string, side: Side, amount: number, taxPart: JournalLine['taxPart']): JournalLine => ({ account, side, amount, taxKey, taxPart })
  if (spec.output === null && spec.input === null) return [plain(line.account, line.side, line.amount, taxKey === 'none' ? null : 'base')]
  if (spec.output !== null && spec.input !== null) {
    const tax = vatOnNet(line.amount, spec.rate)
    return [
      plain(line.account, line.side, line.amount, 'base'),
      plain(accountFor(chart, spec.input).number, 'debit', tax, 'tax'),
      plain(accountFor(chart, spec.output).number, 'credit', tax, 'tax'),
    ]
  }
  const tax = line.amountIs === 'net' ? vatOnNet(line.amount, spec.rate) : vatFromGross(line.amount, spec.rate)
  const net = line.amountIs === 'net' ? line.amount : line.amount - tax
  const taxConcept = (spec.output ?? spec.input)!
  return [plain(line.account, line.side, net, 'base'), plain(accountFor(chart, taxConcept).number, line.side, tax, 'tax')]
}

/** All problems of a draft at once, so the UI can show them together; empty means it can be posted. */
export function validateDraft(ledger: Ledger, draft: EntryDraft): readonly LedgerError[] {
  const errors: LedgerError[] = []
  if (!isBookingDate(draft.date)) errors.push(new LedgerError('invalid_date', `Ungültiges Datum: ${draft.date}`))
  else if (ledger.lockedThrough !== null && draft.date <= ledger.lockedThrough) {
    errors.push(new LedgerError('period_locked', `Der Zeitraum bis ${ledger.lockedThrough} ist festgeschrieben.`))
  }
  if (draft.regularPayment !== undefined && !isBookingDate(draft.regularPayment.dueDate)) {
    errors.push(new LedgerError('invalid_date', `Ungültiges Fälligkeitsdatum: ${draft.regularPayment.dueDate}`))
  }
  if (draft.documentNumber.trim() === '') errors.push(new LedgerError('missing_document_number', 'Jede Buchung braucht eine Belegnummer.'))
  if (draft.lines.length < 2) errors.push(new LedgerError('too_few_lines', 'Eine Buchung braucht mindestens zwei Zeilen.'))
  for (const line of draft.lines) {
    if (!Number.isSafeInteger(line.amount) || line.amount <= 0) errors.push(new LedgerError('invalid_amount', `Betrag muss ganze Cent über 0 sein: ${line.amount}`))
    if (findAccount(ledger.chart, line.account) === null) errors.push(new LedgerError('unknown_account', `Konto ${line.account} gibt es im ${ledger.chart} nicht.`))
  }
  if (errors.length > 0) return errors
  const lines = draft.lines.flatMap((l) => expandLine(ledger.chart, l))
  const debit = sum(lines.filter((l) => l.side === 'debit'))
  const credit = sum(lines.filter((l) => l.side === 'credit'))
  if (debit !== credit) errors.push(new LedgerError('unbalanced', `Soll ${debit} und Haben ${credit} sind nicht gleich.`))
  return errors
}

function sum(lines: readonly JournalLine[]): number {
  return lines.reduce((acc, l) => acc + l.amount, 0)
}

function freezeEntry(entry: JournalEntry): JournalEntry {
  return Object.freeze({ ...entry, lines: Object.freeze(entry.lines.map((l) => Object.freeze({ ...l }))) })
}

function append(ledger: Ledger, entry: JournalEntry): { ledger: Ledger; entry: JournalEntry } {
  const frozen = freezeEntry(entry)
  return { ledger: Object.freeze({ ...ledger, entries: Object.freeze([...ledger.entries, frozen]) }), entry: frozen }
}

/** Posts a draft; throws the first `LedgerError` of `validateDraft`. */
export function postEntry(ledger: Ledger, draft: EntryDraft): { ledger: Ledger; entry: JournalEntry } {
  const errors = validateDraft(ledger, draft)
  if (errors.length > 0) throw errors[0]!
  return append(ledger, {
    number: ledger.entries.length + 1,
    date: draft.date,
    documentNumber: draft.documentNumber.trim(),
    receiptRef: draft.receiptRef ?? null,
    text: draft.text,
    lines: draft.lines.flatMap((l) => expandLine(ledger.chart, l)),
    regularPayment: draft.regularPayment ?? null,
    reversalOf: null,
    ...(draft.counterpartyVatId ? { counterpartyVatId: draft.counterpartyVatId.replace(/\s/g, '').toUpperCase() } : {}),
  })
}

export interface ReversalInput {
  readonly date: IsoDate
  readonly documentNumber: string
  readonly text?: string
}

/**
 * Storno: a new entry with every line on the other side. The original stays as it was; its period
 * may already be festgeschrieben, the Storno is dated in an open one.
 */
export function reverseEntry(ledger: Ledger, number: number, input: ReversalInput): { ledger: Ledger; entry: JournalEntry } {
  const original = ledger.entries.find((e) => e.number === number)
  if (original === undefined) throw new LedgerError('entry_not_found', `Buchung ${number} gibt es nicht.`)
  if (original.reversalOf !== null) throw new LedgerError('reversal_of_reversal', 'Eine Stornobuchung wird nicht storniert; die Buchung neu erfassen.')
  if (ledger.entries.some((e) => e.reversalOf === number)) throw new LedgerError('already_reversed', `Buchung ${number} ist schon storniert.`)
  if (!isBookingDate(input.date)) throw new LedgerError('invalid_date', `Ungültiges Datum: ${input.date}`)
  if (ledger.lockedThrough !== null && input.date <= ledger.lockedThrough) {
    throw new LedgerError('period_locked', `Der Zeitraum bis ${ledger.lockedThrough} ist festgeschrieben.`)
  }
  if (input.documentNumber.trim() === '') throw new LedgerError('missing_document_number', 'Jede Buchung braucht eine Belegnummer.')
  return append(ledger, {
    number: ledger.entries.length + 1,
    date: input.date,
    documentNumber: input.documentNumber.trim(),
    receiptRef: original.receiptRef,
    text: input.text ?? `Storno von Buchung ${number}: ${original.text}`,
    lines: original.lines.map((l) => ({ ...l, side: l.side === 'debit' ? 'credit' : 'debit' })),
    regularPayment: original.regularPayment,
    reversalOf: number,
    ...(original.counterpartyVatId ? { counterpartyVatId: original.counterpartyVatId } : {}),
  })
}

// "Kurze Zeit" is ten days around the turn of the year (H 11 EStH): 22.12. to 10.1. inclusive.
function withinShortTime(date: IsoDate): boolean {
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return (month === 12 && day >= 22) || (month === 1 && day <= 10)
}

/**
 * The year an entry counts in for the EÜR (§ 11 EStG): the payment year, except for a regular payment
 * paid and due within ten days of the turn of the year (22.12. to 10.1., BFH X R 44/16): it counts in
 * the year it belongs to. Non-cash entries (depreciation, quick-path totals) count in their own year.
 */
export function euerYearOf(entry: JournalEntry): number {
  const payment = entry.regularPayment
  if (payment === null) return yearOf(entry.date)
  if (!withinShortTime(entry.date) || !withinShortTime(payment.dueDate)) return yearOf(entry.date)
  // Both dates must sit at the same turn of the year, not one at each end of a year.
  const turn = (d: IsoDate): number => (d.slice(5, 7) === '12' ? yearOf(d) : yearOf(d) - 1)
  if (turn(entry.date) !== turn(payment.dueDate)) return yearOf(entry.date)
  const t = turn(entry.date)
  return payment.periodYear === t || payment.periodYear === t + 1 ? payment.periodYear : yearOf(entry.date)
}

/** The year an entry counts in for this ledger's mode: EÜR by § 11 EStG, Bilanz by its date. */
export function reportingYearOf(ledger: Ledger, entry: JournalEntry): number {
  return ledger.mode === 'euer' ? euerYearOf(entry) : yearOf(entry.date)
}

export interface AccountTotals {
  readonly debit: number
  readonly credit: number
}

/** Debit and credit totals per account over the entries the filter keeps. */
export function accountTotals(entries: readonly JournalEntry[], keep: (entry: JournalEntry) => boolean = () => true): ReadonlyMap<string, AccountTotals> {
  const totals = new Map<string, { debit: number; credit: number }>()
  for (const entry of entries) {
    if (!keep(entry)) continue
    for (const line of entry.lines) {
      const t = totals.get(line.account) ?? { debit: 0, credit: 0 }
      t[line.side] += line.amount
      totals.set(line.account, t)
    }
  }
  return totals
}

export function isBalanced(entry: JournalEntry): boolean {
  return sum(entry.lines.filter((l) => l.side === 'debit')) === sum(entry.lines.filter((l) => l.side === 'credit'))
}
