// In-memory BusinessRepository (ADR-0101): the book is append-only by construction — entries and
// log records are only ever pushed, and `tamper` is the one test seam that changes stored data, so a
// test can prove that the chain check notices it.
import type { BookkeepingMode, ChartOfAccounts, JournalEntry, LogRecord } from '@steuereule/core'
import type {
  BankTransactionRecord,
  BookAppend,
  BookingRuleRecord,
  BusinessPerson,
  BusinessRef,
  BusinessProfilePatch,
  BusinessProfileRecord,
  BusinessRepository,
  FixedAssetRecord,
  LoadedBook,
  NewFixedAsset,
  PayrollRunRecord,
} from '../../src/business/business.repository.js'

interface StoredBook {
  id: string
  chart: ChartOfAccounts
  mode: BookkeepingMode
  lockedThrough: string | null
  entries: { entry: JournalEntry; source: string; draft?: string }[]
  log: LogRecord[]
  bank: BankTransactionRecord[]
}

const key = (userId: string, year: number, ref: BusinessRef) => `${userId}|${year}|${ref.person}|${ref.business}`

export class FakeBusinessRepository implements BusinessRepository {
  readonly profiles = new Map<string, BusinessProfileRecord>()
  readonly books = new Map<string, StoredBook>()
  readonly assets: (FixedAssetRecord & { userId: string })[] = []
  readonly rules: (BookingRuleRecord & { userId: string })[] = []
  private seq = 0
  /** Test seam: the next asset insert of a book change fails, as a database error would. */
  failAssetInsert = false

  async findProfile(userId: string, taxYear: number, ref: BusinessRef) {
    return this.profiles.get(key(userId, taxYear, ref)) ?? null
  }

  async saveProfile(userId: string, taxYear: number, ref: BusinessRef, patch: BusinessProfilePatch) {
    const current = this.profiles.get(key(userId, taxYear, ref)) ?? {
      id: `p${++this.seq}`, userId, taxYear, person: ref.person, business: ref.business, kind: null, professionAnswers: null, suggestion: null, name: null, mode: 'euer', chart: 'SKR03',
      smallBusiness: false, vatMethod: 'ist', municipalityAgs: null, multiplierOverride: null, startDate: null, vatPrepayments: null, vatPeriodFacts: null, disposalFacts: null, retainedFacts: null, tradeTaxInputs: null,
      lossFacts: null, partnershipShares: null, procedureDoc: null,
    } satisfies BusinessProfileRecord
    const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as BusinessProfileRecord
    this.profiles.set(key(userId, taxYear, ref), next)
    return next
  }

  async listProfiles(userId: string, taxYear: number, person: BusinessPerson) {
    return [...this.profiles.values()].filter((p) => p.userId === userId && p.taxYear === taxYear && p.person === person).sort((a, b) => a.business - b.business)
  }

  async deleteProfile(userId: string, taxYear: number, ref: BusinessRef) {
    this.profiles.delete(key(userId, taxYear, ref))
    const book = this.books.get(key(userId, taxYear, ref))
    if (book && book.entries.length === 0) this.books.delete(key(userId, taxYear, ref))
  }

  private loaded(book: StoredBook): LoadedBook {
    return {
      book: { id: book.id, chart: book.chart, mode: book.mode, lockedThrough: book.lockedThrough },
      ledger: { chart: book.chart, mode: book.mode, entries: book.entries.map((e) => structuredClone(e.entry)), lockedThrough: book.lockedThrough },
      log: book.log.map((r) => structuredClone(r)),
      sources: new Map(book.entries.map((e) => [e.entry.number, e.source])),
      drafts: new Map(book.entries.filter((e) => e.draft !== undefined).map((e) => [e.entry.number, e.draft!])),
    }
  }

  async loadBook(userId: string, taxYear: number, ref: BusinessRef) {
    const book = this.books.get(key(userId, taxYear, ref))
    return book ? this.loaded(book) : null
  }

  private ensure(userId: string, taxYear: number, ref: BusinessRef, frame: { chart: ChartOfAccounts; mode: BookkeepingMode }): StoredBook {
    const k = key(userId, taxYear, ref)
    let book = this.books.get(k)
    if (!book) {
      book = { id: `b${++this.seq}`, chart: frame.chart, mode: frame.mode, lockedThrough: null, entries: [], log: [], bank: [] }
      this.books.set(k, book)
    }
    return book
  }

  async changeBook<T>(
    userId: string,
    taxYear: number,
    ref: BusinessRef,
    frame: { chart: ChartOfAccounts; mode: BookkeepingMode },
    work: (book: LoadedBook) => { result: T; append: BookAppend } | Promise<{ result: T; append: BookAppend }>,
  ): Promise<T> {
    const book = this.ensure(userId, taxYear, ref, frame)
    const { result, append } = await work(this.loaded(book))
    // One transaction: a failing asset insert leaves the book untouched, as the database rolls back.
    if ((append.assets ?? []).length > 0 && this.failAssetInsert) throw new Error('asset insert failed')
    for (const asset of append.assets ?? []) this.assets.push({ ...asset, id: `a${++this.seq}`, userId })
    for (const e of append.entries ?? []) book.entries.push({ entry: structuredClone(e.entry), source: e.source, ...(e.draft !== undefined ? { draft: e.draft } : {}) })
    for (const r of append.log ?? []) book.log.push(structuredClone(r))
    if (append.lockedThrough !== undefined) {
      if (book.lockedThrough !== null && append.lockedThrough < book.lockedThrough) throw new Error('append-only: the Festschreibung only moves forward')
      book.lockedThrough = append.lockedThrough
    }
    return result
  }

  /** Test seam: changes a stored entry behind the log's back, as a raw UPDATE would. */
  tamper(userId: string, taxYear: number, ref: BusinessRef, number: number, change: (entry: JournalEntry) => JournalEntry): void {
    const book = this.books.get(key(userId, taxYear, ref))!
    const stored = book.entries.find((e) => e.entry.number === number)!
    stored.entry = change(stored.entry)
  }

  async listAssets(userId: string, ref: BusinessRef, throughYear: number) {
    return this.assets.filter((a) => a.userId === userId && a.person === ref.person && a.business === ref.business && a.taxYear <= throughYear)
  }

  async createAsset(userId: string, asset: NewFixedAsset) {
    const record = { ...asset, id: `a${++this.seq}`, userId }
    this.assets.push(record)
    return record
  }

  async setAssetDisposal(userId: string, assetId: string, disposal: string) {
    const asset = this.assets.find((a) => a.id === assetId && a.userId === userId)
    if (!asset) return null
    Object.assign(asset, { disposal })
    return asset
  }

  async listBankTransactions(userId: string, taxYear: number, ref: BusinessRef) {
    return [...(this.books.get(key(userId, taxYear, ref))?.bank ?? [])]
  }

  async addBankTransactions(userId: string, taxYear: number, ref: BusinessRef, frame: { chart: ChartOfAccounts; mode: BookkeepingMode }, transactions: readonly { fingerprint: string; amount: number; details: string }[]) {
    const book = this.ensure(userId, taxYear, ref, frame)
    let added = 0
    for (const tx of transactions) {
      if (book.bank.some((b) => b.fingerprint === tx.fingerprint)) continue
      book.bank.push({ id: `t${++this.seq}`, ...tx, status: 'offen', entryNumber: null })
      added++
    }
    return added
  }

  async setBankTransactionStatus(userId: string, id: string, status: BankTransactionRecord['status'], entryNumber: number | null) {
    for (const [k, book] of this.books) {
      if (!k.startsWith(`${userId}|`)) continue
      const tx = book.bank.find((b) => b.id === id)
      if (tx) Object.assign(tx, { status, entryNumber })
    }
  }

  readonly payroll: (PayrollRunRecord & { userId: string })[] = []

  async listPayrollRuns(userId: string, taxYear: number, ref: BusinessRef) {
    return this.payroll.filter((r) => r.userId === userId && r.taxYear === taxYear && r.person === ref.person && r.business === ref.business).sort((a, b) => a.month - b.month)
  }

  async addPayrollRun(userId: string, run: Omit<PayrollRunRecord, 'id'>) {
    const record = { ...run, id: `l${++this.seq}`, userId }
    this.payroll.push(record)
    return record
  }

  async listRules(userId: string, person: BusinessPerson) {
    return this.rules.filter((r) => r.userId === userId && r.person === person)
  }

  async createRule(userId: string, rule: Omit<BookingRuleRecord, 'id'>) {
    const record = { ...rule, id: `r${++this.seq}`, userId }
    this.rules.push(record)
    return record
  }
}
