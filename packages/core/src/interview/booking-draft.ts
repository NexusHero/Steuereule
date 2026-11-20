// A booking the owl or a receipt proposes (ADR-0101 §18): an entry draft of the ledger plus, for
// a fixed asset, how it is depreciated. Nothing is posted here; the draft is checked against the
// book it is meant for before it is shown, and posted only when the user takes it (ADR-0066).
import { USEFUL_LIVES, type AssetCategory, type DepreciationMethod } from '../domains/business/depreciation'
import { findAccount, type BookingTaxKey, type ChartOfAccounts } from '../domains/ledger/accounts'
import { TAX_KEYS, isBookingDate, validateDraft, yearOf, type BookkeepingMode, type EntryDraft, type EntryDraftLine, type IsoDate } from '../domains/ledger/journal'

/** The tax years a book can be kept for (ADR-0101 §4). */
export const BOOKING_YEARS = [2022, 2023, 2024, 2025, 2026] as const

/** What a fixed asset needs beside its entry: the depreciation the core computes from it. */
export interface BookingDraftAsset {
  readonly label: string
  readonly category?: AssetCategory | undefined
  readonly method: Extract<DepreciationMethod, 'linear' | 'degressive' | 'gwg' | 'sofort'>
  /** Years of the official table (USEFUL_LIVES); for gwg and sofort ignored. */
  readonly usefulLifeYears?: number | undefined
}

export interface BookingDraft extends EntryDraft {
  readonly asset?: BookingDraftAsset | undefined
}

/** The book a draft is checked against. */
export interface BookingTarget {
  readonly chart: ChartOfAccounts
  readonly mode: BookkeepingMode
  readonly year: number
  readonly lockedThrough: IsoDate | null
  /** § 19 UStG: a Kleinunternehmer charges no VAT and deducts none. */
  readonly smallBusiness: boolean
}

export type BookingDraftCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: BookingDraftErrorCode; readonly reason: string }

export type BookingDraftErrorCode =
  | 'year_not_offered'
  | 'wrong_year'
  | 'tax_key_not_allowed'
  | 'invalid_asset'
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

const SIDES = new Set(['debit', 'credit'])
const ASSET_METHODS = new Set(['linear', 'degressive', 'gwg', 'sofort'])
const MAX_TEXT = 200
const MAX_LINES = 20

/** Keys a Kleinunternehmer may book: no VAT of its own; § 13b tax he still owes is not modelled here. */
const SMALL_BUSINESS_KEYS: ReadonlySet<BookingTaxKey> = new Set(['none', 'kleinunternehmer', 'steuerfrei', 'ust0'])

const isTaxKey = (value: unknown): value is BookingTaxKey => typeof value === 'string' && Object.hasOwn(TAX_KEYS, value)

/** The stored form of a draft: canonical JSON, the value the confirmation path carries. */
export function serializeBookingDraft(draft: BookingDraft): string {
  return JSON.stringify(draft)
}

function parseLine(raw: unknown): EntryDraftLine | string {
  if (raw === null || typeof raw !== 'object') return 'Eine Zeile ist kein Objekt.'
  const line = raw as Record<string, unknown>
  if (typeof line.account !== 'string' || !/^\d{4,8}$/.test(line.account)) return 'Jede Zeile braucht eine Kontonummer aus Ziffern.'
  if (typeof line.side !== 'string' || !SIDES.has(line.side)) return 'Die Seite ist „debit“ (Soll) oder „credit“ (Haben).'
  if (typeof line.amount !== 'number' || !Number.isSafeInteger(line.amount) || line.amount <= 0) return 'Beträge sind ganze Cent über 0.'
  if (line.taxKey !== undefined && !isTaxKey(line.taxKey)) return `Den Steuerschlüssel „${String(line.taxKey)}“ gibt es nicht.`
  if (line.amountIs !== undefined && line.amountIs !== 'gross' && line.amountIs !== 'net') return '„amountIs“ ist „gross“ oder „net“.'
  return {
    account: line.account,
    side: line.side as EntryDraftLine['side'],
    amount: line.amount,
    ...(line.taxKey !== undefined ? { taxKey: line.taxKey as BookingTaxKey } : {}),
    ...(line.amountIs !== undefined ? { amountIs: line.amountIs as 'gross' | 'net' } : {}),
  }
}

function parseAsset(raw: unknown): BookingDraftAsset | string {
  if (raw === null || typeof raw !== 'object') return 'Die Angaben zum Anlagegut sind kein Objekt.'
  const asset = raw as Record<string, unknown>
  if (typeof asset.label !== 'string' || asset.label.trim() === '' || asset.label.length > MAX_TEXT) return 'Das Anlagegut braucht eine Bezeichnung.'
  if (typeof asset.method !== 'string' || !ASSET_METHODS.has(asset.method)) return 'Die Abschreibung ist linear, degressiv, GWG oder sofort.'
  if (asset.category !== undefined && (typeof asset.category !== 'string' || !Object.hasOwn(USEFUL_LIVES, asset.category))) return `Die Anlagenart „${String(asset.category)}“ steht nicht in der AfA-Tabelle.`
  const life = asset.usefulLifeYears
  if (life !== undefined && (typeof life !== 'number' || !Number.isInteger(life) || life < 1 || life > 50)) return 'Die Nutzungsdauer ist eine ganze Zahl von 1 bis 50 Jahren.'
  const method = asset.method as BookingDraftAsset['method']
  if ((method === 'linear' || method === 'degressive') && life === undefined && asset.category === undefined) return 'Für die lineare oder degressive AfA braucht es die Nutzungsdauer oder die Anlagenart.'
  return {
    label: asset.label.trim(),
    method,
    ...(asset.category !== undefined ? { category: asset.category as AssetCategory } : {}),
    ...(life !== undefined ? { usefulLifeYears: life as number } : {}),
  }
}

/** The shape of a draft, without a book: what the field catalogue checks on every write. */
export function parseBookingDraft(raw: string): { readonly ok: true; readonly draft: BookingDraft } | { readonly ok: false; readonly reason: string } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'Der Buchungsentwurf ist kein gültiges JSON.' }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'Der Buchungsentwurf ist kein Objekt.' }
  const draft = value as Record<string, unknown>
  if (typeof draft.date !== 'string' || !isBookingDate(draft.date)) return { ok: false, reason: 'Das Buchungsdatum ist JJJJ-MM-TT.' }
  if (typeof draft.documentNumber !== 'string' || draft.documentNumber.trim() === '' || draft.documentNumber.length > 40) return { ok: false, reason: 'Die Belegnummer fehlt.' }
  if (typeof draft.text !== 'string' || draft.text.trim() === '' || draft.text.length > MAX_TEXT) return { ok: false, reason: `Der Buchungstext fehlt oder ist länger als ${MAX_TEXT} Zeichen.` }
  if (draft.receiptRef !== undefined && draft.receiptRef !== null && typeof draft.receiptRef !== 'string') return { ok: false, reason: 'Der Belegverweis ist ein Text.' }
  // The ten-day rule (§ 11 Abs. 1 Satz 2, Abs. 2 Satz 2 EStG): a regular payment around the turn of the
  // year is booked in the year it was paid and counts in the EÜR of the year it belongs to; the EÜR of
  // that year reads it from the neighbouring book (ADR-0101 §22).
  let regularPayment: { dueDate: string; periodYear: number } | undefined
  if (draft.regularPayment !== undefined && draft.regularPayment !== null) {
    const rp = draft.regularPayment as { dueDate?: unknown; periodYear?: unknown }
    if (typeof rp.dueDate !== 'string' || !isBookingDate(rp.dueDate) || typeof rp.periodYear !== 'number' || !Number.isInteger(rp.periodYear)) {
      return { ok: false, reason: 'Eine regelmäßig wiederkehrende Zahlung braucht ihr Fälligkeitsdatum und das Jahr, zu dem sie gehört.' }
    }
    regularPayment = { dueDate: rp.dueDate, periodYear: rp.periodYear }
  }
  if (!Array.isArray(draft.lines) || draft.lines.length < 2 || draft.lines.length > MAX_LINES) return { ok: false, reason: `Eine Buchung hat 2 bis ${MAX_LINES} Zeilen.` }
  const lines: EntryDraftLine[] = []
  for (const rawLine of draft.lines) {
    const line = parseLine(rawLine)
    if (typeof line === 'string') return { ok: false, reason: line }
    lines.push(line)
  }
  let asset: BookingDraftAsset | undefined
  if (draft.asset !== undefined && draft.asset !== null) {
    const parsed = parseAsset(draft.asset)
    if (typeof parsed === 'string') return { ok: false, reason: parsed }
    asset = parsed
  }
  return {
    ok: true,
    draft: {
      date: draft.date,
      documentNumber: draft.documentNumber.trim(),
      ...(typeof draft.receiptRef === 'string' ? { receiptRef: draft.receiptRef } : {}),
      text: draft.text.trim(),
      lines,
      ...(asset !== undefined ? { asset } : {}),
      ...(regularPayment !== undefined ? { regularPayment } : {}),
      ...(typeof draft.counterpartyVatId === 'string' && /^[A-Z]{2}[0-9A-Z+*]{2,12}$/.test(draft.counterpartyVatId.replace(/\s/g, '').toUpperCase())
        ? { counterpartyVatId: draft.counterpartyVatId.replace(/\s/g, '').toUpperCase() }
        : {}),
    },
  }
}

/**
 * The check against the book: the year is one the app offers and the draft's own, every tax key
 * fits the business (a Kleinunternehmer books no VAT), and the ledger's own validation passes
 * (accounts of the chart, balanced amounts, no locked period).
 */
export function checkBookingDraft(draft: BookingDraft, target: BookingTarget): BookingDraftCheck {
  if (!(BOOKING_YEARS as readonly number[]).includes(target.year)) {
    return { ok: false, code: 'year_not_offered', reason: `Für ${target.year} führt die App kein Buch (angeboten: ${BOOKING_YEARS.join(', ')}).` }
  }
  if (isBookingDate(draft.date) && yearOf(draft.date) !== target.year) {
    return { ok: false, code: 'wrong_year', reason: `Das Datum ${draft.date} liegt nicht im Jahr ${target.year} dieses Buchs.` }
  }
  if (target.smallBusiness) {
    const vatLine = draft.lines.find((l) => !SMALL_BUSINESS_KEYS.has(l.taxKey ?? 'none'))
    if (vatLine !== undefined) {
      return { ok: false, code: 'tax_key_not_allowed', reason: `Als Kleinunternehmer (§ 19 UStG) gibt es keine Umsatz- oder Vorsteuer; „${vatLine.taxKey}“ passt nicht.` }
    }
  }
  const errors = validateDraft({ chart: target.chart, mode: target.mode, entries: [], lockedThrough: target.lockedThrough }, draft)
  const first = errors[0]
  if (first !== undefined) return { ok: false, code: first.code, reason: first.message }
  if (draft.asset !== undefined) {
    const account = draft.lines.map((l) => findAccount(target.chart, l.account)).find((a) => a?.kind === 'asset' && a.depreciationConcept !== null)
    if (account === undefined && draft.asset.method !== 'sofort') {
      return { ok: false, code: 'invalid_asset', reason: 'Ein Anlagegut wird auf einem Anlagekonto gebucht; keine Zeile nennt eins.' }
    }
  }
  return { ok: true }
}
