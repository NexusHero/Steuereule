import { Inject, Injectable } from '@nestjs/common'
import {
  chartAccounts,
  USEFUL_LIVES,
  appendLogRecord,
  checkBookingDraft,
  parseBookingDraft,
  isEuerKey,
  lockPeriod,
  postEntry,
  reverseEntry,
  isIncomeKey,
  type BookingDraft,
  type ChartOfAccounts,
  type BookkeepingMode,
  type JournalEntry,
  type Ledger,
  type LogRecord,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { BUSINESS_REPOSITORY, type BookAppend, type BusinessRef, type BusinessProfileRecord, type BusinessRepository, type NewFixedAsset, type LoadedBook } from './business.repository.js'
import { accountForEuerKey, bankAccountOf, bookIntegrity, registerAssetOf } from './business-ledger.js'
import { BusinessContext } from './business-context.js'
import { LABEL_ONLY_TAX_KEYS, ledgerCall, taxKeyOfAccount } from './business-helpers.js'
import type { BookView } from './views.js'

/** One draft to post, with the source its entry is filed under and, for an accepted draft, its own text. */
export interface PostingDraft {
  readonly draft: BookingDraft
  readonly source: string
  readonly keepDraft?: string
}

/**
 * The book of a business (ADR-0101 §11): reading it, posting, Storno, the quick path and the
 * Festschreibung. Every change of a book passes `assertIntact`, and every entry is posted by `postAll`:
 * the other services book through `postDrafts`.
 */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
  ) {}

  private view(book: LoadedBook | null, chart: ChartOfAccounts, mode: BookkeepingMode): BookView {
    if (book === null) return { chart, mode, lockedThrough: null, integrity: { ok: true, entries: 0, headHash: null }, entries: [] }
    const reversedBy = new Map(book.ledger.entries.filter((e) => e.reversalOf !== null).map((e) => [e.reversalOf!, e.number]))
    return {
      chart: book.book.chart,
      mode: book.book.mode,
      lockedThrough: book.book.lockedThrough,
      integrity: bookIntegrity(book.ledger, book.log),
      entries: book.ledger.entries.map((e) => ({ ...e, source: book.sources.get(e.number) ?? 'nutzer', reversedBy: reversedBy.get(e.number) ?? null })),
    }
  }

  async getBook(userId: string, year: number, ref: BusinessRef): Promise<BookView> {
    await this.context.assertOpen(userId, year)
    const [{ chart, mode }, book] = await Promise.all([this.context.frame(userId, year, ref), this.repository.loadBook(userId, year, ref)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.view(book, chart, mode)
  }

  /** A change of the book refuses to build on a broken chain: the user has to see it first. */
  assertIntact(book: LoadedBook): void {
    const integrity = bookIntegrity(book.ledger, book.log)
    if (!integrity.ok) throw new ConflictError('BOOK_INTEGRITY_BROKEN', integrity.reason)
  }

  /** Posts drafts in order, each with its log record; validation errors come back in German. */
  private postAll(book: LoadedBook, year: number, profile: BusinessProfileRecord | null, drafts: readonly PostingDraft[]): { ledger: Ledger; append: BookAppend; posted: JournalEntry[] } {
    this.assertIntact(book)
    let ledger = book.ledger
    let log: readonly LogRecord[] = book.log
    const posted: JournalEntry[] = []
    const entries: { entry: JournalEntry; source: string; draft?: string }[] = []
    for (const { draft, source, keepDraft } of drafts) {
      const check = checkBookingDraft(draft, { chart: ledger.chart, mode: ledger.mode, year, lockedThrough: ledger.lockedThrough, smallBusiness: profile?.smallBusiness ?? false })
      if (!check.ok) throw new InvalidInputError(`BOOKING_${check.code.toUpperCase()}`, check.reason)
      const { asset: _asset, ...entryDraft } = draft
      const result = postEntry(ledger, entryDraft)
      ledger = result.ledger
      log = appendLogRecord(log, 'entry', result.entry, this.context.now())
      posted.push(result.entry)
      entries.push({ entry: result.entry, source, ...(keepDraft !== undefined ? { draft: keepDraft } : {}) })
    }
    return { ledger, posted, append: { entries, log: log.slice(book.log.length) } }
  }

  /**
   * Posts drafts in one change of the book, for the groups that book through the ledger (assets, payroll,
   * the opening entry). `draftsFor` sees the book as loaded, so it can leave out what is booked already.
   */
  async postDrafts(
    userId: string,
    year: number,
    ref: BusinessRef,
    frame: { readonly chart: ChartOfAccounts; readonly mode: BookkeepingMode },
    profile: BusinessProfileRecord | null,
    draftsFor: (book: LoadedBook) => readonly PostingDraft[],
  ): Promise<JournalEntry[]> {
    return this.repository.changeBook(userId, year, ref, frame, (book) => {
      const result = this.postAll(book, year, profile, draftsFor(book))
      return { result: result.posted, append: result.append }
    })
  }

  /** One booking (ADR-0101 §11); a draft with an asset also enters the asset register. */
  async post(userId: string, year: number, ref: BusinessRef, draft: BookingDraft, source = 'nutzer', keepDraft?: string): Promise<JournalEntry> {
    await this.context.assertOpen(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const entry = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      if (keepDraft !== undefined && [...book.sources.values()].includes(source)) throw new ConflictError('BOOKING_DRAFT_POSTED', 'Dieser Buchungsentwurf ist schon gebucht.')
      const { posted, append } = this.postAll(book, year, profile, [{ draft, source, ...(keepDraft !== undefined ? { keepDraft } : {}) }])
      const asset = draft.asset !== undefined && draft.asset.method !== 'sofort' ? this.assetOf(year, ref, chart, posted[0]!, draft) : null
      return { result: posted[0]!, append: asset === null ? append : { ...append, assets: [asset] } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry
  }

  /** The asset an entry capitalises, checked by the core's schedule before anything is written. */
  private assetOf(year: number, ref: BusinessRef, chart: ChartOfAccounts, entry: JournalEntry, draft: BookingDraft): NewFixedAsset | null {
    const assetLine = entry.lines.find((l) => l.side === 'debit' && l.taxPart !== 'tax' && accountKindIsAsset(chart, l.account))
    if (assetLine === undefined || draft.asset === undefined) return null
    const category = draft.asset.category
    const asset: NewFixedAsset = {
      taxYear: year,
      person: ref.person,
      business: ref.business,
      label: draft.asset.label,
      account: assetLine.account,
      acquisitionDate: entry.date,
      acquisitionCost: assetLine.amount,
      method: draft.asset.method,
      category: category ?? null,
      usefulLifeYears: draft.asset.usefulLifeYears ?? (category ? USEFUL_LIVES[category].years : null),
      specialDepreciation: null,
      disposal: null,
      buildingFacts: null,
      vatCorrection: null,
    }
    ledgerCall(() => registerAssetOf({ ...asset, id: 'neu' }, year))
    return asset
  }

  /** Storno (GoBD Rz. 58 ff.): a mirrored entry, the original stays. */
  async reverse(userId: string, year: number, ref: BusinessRef, number: number, input: { date: string; documentNumber: string; text?: string | undefined }): Promise<JournalEntry> {
    await this.context.assertOpen(userId, year)
    const { chart, mode } = await this.context.frame(userId, year, ref)
    const entry = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      this.assertIntact(book)
      if (Number(input.date.slice(0, 4)) !== year) throw new InvalidInputError('BOOKING_WRONG_YEAR', `Das Datum ${input.date} liegt nicht im Jahr ${year}.`)
      const result = ledgerCall(() => reverseEntry(book.ledger, number, { date: input.date, documentNumber: input.documentNumber, ...(input.text !== undefined ? { text: input.text } : {}) }))
      const log = appendLogRecord(book.log, 'entry', result.entry, this.context.now())
      return { result: result.entry, append: { entries: [{ entry: result.entry, source: 'storno' }], log: log.slice(book.log.length) } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry
  }

  /** The quick path (ADR-0101 §6): a total per EÜR line, booked against the bank like any entry. */
  async quickEntry(userId: string, year: number, ref: BusinessRef, totals: readonly { key: string; amountCents: number; date?: string | undefined }[]): Promise<readonly JournalEntry[]> {
    await this.context.assertOpen(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    if (mode !== 'euer') throw new InvalidInputError('QUICK_ENTRY_EUER_ONLY', 'Summen je EÜR-Zeile gibt es nur bei der Einnahmenüberschussrechnung.')
    const bank = bankAccountOf(chart)
    const drafts = totals.map(({ key, amountCents, date }) => {
      if (!isEuerKey(key)) throw new InvalidInputError('QUICK_ENTRY_UNKNOWN_KEY', `Die EÜR-Position „${key}“ gibt es nicht.`)
      const account = accountForEuerKey(chart, key)
      if (account === null) throw new InvalidInputError('QUICK_ENTRY_NO_ACCOUNT', `Für „${key}“ hat der ${chart} kein Konto.`)
      const income = isIncomeKey(key)
      // A tax key that only labels the line (no VAT in it) keeps the turnover visible to the VAT return
      // and the § 19 test; a key that splits VAT stays off, the EÜR total is net and its VAT has its own line.
      const labelKey = LABEL_ONLY_TAX_KEYS.has(taxKeyOfAccount(chart, account)) ? { taxKey: taxKeyOfAccount(chart, account) } : {}
      const draft: BookingDraft = {
        date: date ?? `${year}-12-31`,
        documentNumber: `Summe-${key}`,
        text: `Summe ${year}: ${key}`,
        lines: income
          ? [{ account: bank, side: 'debit', amount: amountCents }, { account, side: 'credit', amount: amountCents, ...labelKey }]
          : [{ account, side: 'debit', amount: amountCents }, { account: bank, side: 'credit', amount: amountCents }],
      }
      return { draft, source: 'summe' }
    })
    const posted = await this.postDrafts(userId, year, ref, { chart, mode }, profile, () => drafts)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return posted
  }

  /** Festschreibung up to a day; it only moves forward, in the core, the database and the log. */
  async lock(userId: string, year: number, ref: BusinessRef, through: string): Promise<BookView> {
    await this.context.assertOpen(userId, year)
    const { chart, mode } = await this.context.frame(userId, year, ref)
    await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      this.assertIntact(book)
      const ledger = ledgerCall(() => lockPeriod(book.ledger, through))
      const log = appendLogRecord(book.log, 'lock', { through }, this.context.now())
      return { result: ledger, append: { log: log.slice(book.log.length), lockedThrough: through } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.view(await this.repository.loadBook(userId, year, ref), chart, mode)
  }

  // ------------------------------------------------------------------------------------------------
  // Booking drafts (owl, receipts; ADR-0066 Zero-Write): posted only when the user takes them

  /** The accepted draft behind `eule:<ref>`, while its entry stands (not reversed); null otherwise. */
  async acceptedDraft(userId: string, year: number, ref: BusinessRef, draftRef: string): Promise<string | null> {
    const book = await this.repository.loadBook(userId, year, ref)
    if (book === null) return null
    const number = [...book.sources.entries()].find(([, source]) => source === `eule:${draftRef}`)?.[0]
    if (number === undefined) return null
    if (book.ledger.entries.some((e) => e.reversalOf === number)) return null
    return book.drafts.get(number) ?? null
  }

  /** Posts an accepted draft (`value`), or reverses the entry of `ref` when `value` is null (the draft's undo). */
  async applyDraft(userId: string, year: number, ref: BusinessRef, draftRef: string, value: string | null): Promise<void> {
    if (value === null) {
      const book = await this.repository.loadBook(userId, year, ref)
      const number = book ? [...book.sources.entries()].find(([, source]) => source === `eule:${draftRef}`)?.[0] : undefined
      if (number === undefined) throw new NotFoundError('BOOKING_DRAFT_NOT_POSTED', 'Zu diesem Entwurf gibt es keine Buchung.')
      const today = this.context.now().slice(0, 10)
      const date = Number(today.slice(0, 4)) === year ? today : `${year}-12-31`
      await this.reverse(userId, year, ref, number, { date, documentNumber: `Storno-${number}`, text: `Storno von Buchung ${number} (Entwurf zurückgenommen)` })
      return
    }
    const parsed = parseBookingDraft(value)
    if (!parsed.ok) throw new InvalidInputError('BOOKING_DRAFT_INVALID', parsed.reason)
    await this.post(userId, year, ref, parsed.draft, `eule:${draftRef}`, value)
  }
}

function accountKindIsAsset(chart: ChartOfAccounts, number: string): boolean {
  return ledgerAccounts(chart).get(number) === 'asset'
}

const accountKinds = new Map<ChartOfAccounts, Map<string, string>>()
function ledgerAccounts(chart: ChartOfAccounts): Map<string, string> {
  let map = accountKinds.get(chart)
  if (!map) {
    map = new Map(chartAccounts(chart).map((a) => [a.number, a.kind]))
    accountKinds.set(chart, map)
  }
  return map
}
