import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common'
import {
  AssetError,
  ClosingError,
  EBilanzError,
  LedgerError,
  chartAccounts,
  BANK_CSV_PRESETS,
  USEFUL_LIVES,
  appendLogRecord,
  applyLosses,
  balanceSheet,
  carryBackLoss,
  checkBookingDraft,
  parseBookingDraft,
  closingBalances,
  depreciationDrafts,
  disposalDrafts,
  draftFromTransaction,
  eBilanzInstance,
  elsterLinesFor,
  ELSTER_FORMS,
  ELSTER_YEARS,
  euerProfit,
  euerTotals,
  gdpduExport,
  incomeStatement,
  anlagespiegel,
  kontennachweise,
  kontennachweisRequired,
  isEuerKey,
  lockPeriod,
  lossRules,
  openingEntryDraft,
  parseBankCsv,
  parseCamt053,
  postEntry,
  reverseEntry,
  suggestBooking,
  suggestProfessionKind,
  tradeTaxReturn,
  landDeduction,
  vatAnnualReturn,
  verfahrensdokumentation,
  withFingerprints,
  assetRegister,
  cashAccountingAllowed,
  isIncomeKey,
  type BankCsvPreset,
  type BankTransaction,
  type BookingDraft,
  type BookingRule,
  type BookingTaxKey,
  type BusinessIncome,
  type ChartOfAccounts,
  type BookkeepingMode,
  type CsvMapping,
  type ElsterForm,
  type ElsterYear,
  type EntryDraft,
  type EuerKey,
  type FinancingComponents,
  type JournalEntry,
  type Ledger,
  type LogRecord,
  type ProfessionAnswers,
  type ProfessionSuggestion,
  type TradeTaxReturn,
  type VatAnnualResult,
  type VerfahrensdokuPlaceholder,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { selfEmploymentEnabled, declaresSelfEmployment } from '../config/self-employment.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersFrom } from '../interview/answers.js'
import { UnlockService } from '../unlock/unlock.service.js'
import {
  BUSINESS_REPOSITORY,
  type BookAppend,
  type BusinessPerson,
  type BusinessProfilePatch,
  type BusinessProfileRecord,
  type BusinessRepository,
  type FixedAssetRecord,
  type NewFixedAsset,
  type LoadedBook,
} from './business.repository.js'
import { accountForEuerKey, bankAccountOf, bookIntegrity, byKeyInEuros, eur, registerAssetOf, vatFiguresOf, type BookIntegrity, type VatFigures } from './business-ledger.js'
import { HebesatzDirectory, type HebesatzLookup } from './hebesatz.js'
import { zipStored } from './zip.js'

export const HEBESATZ_DIRECTORY = Symbol('HEBESATZ_DIRECTORY')
export const BUSINESS_CLOCK = Symbol('BUSINESS_CLOCK')

/** The facts of the Gewerbesteuer-Erklärung the books do not hold (§ 8 Nr. 1, § 9 Nr. 1, § 10a GewStG), in euros. */
export interface TradeTaxInputs {
  readonly financing?: FinancingComponents
  readonly otherAdditionsEur?: number
  readonly einheitswertEur?: number
  readonly otherDeductionsEur?: number
  readonly lossCarriedForwardEur?: number
}

/** § 10d facts: the Verlustvortrag of the last Feststellungsbescheid, the waiver of the Rücktrag, room in the years before. */
export interface LossFacts {
  readonly carriedForwardEur?: number
  readonly waiveCarryBack?: boolean
  /** What the Gesamtbetrag der Einkünfte of the year before and the second year before still offers. */
  readonly roomEur?: readonly [number, number]
  /** A later year's loss the user carries back into this year. */
  readonly carriedBackEur?: number
}

/** A share of a partnership's profit as its Feststellungsbescheid states it (ADR-0101 §3). */
export interface PartnershipShare {
  readonly name: string
  readonly kind: 'freiberuf' | 'gewerbe'
  readonly profitEur: number
  readonly baseAmountEur?: number
  readonly tradeTaxEur?: number
}

export interface BusinessProfileView {
  readonly person: BusinessPerson
  readonly confirmedKind: 'freiberuf' | 'gewerbe' | null
  readonly professionAnswers: ProfessionAnswers | null
  readonly suggestion: ProfessionSuggestion | null
  readonly name: string | null
  readonly mode: BookkeepingMode
  readonly chart: ChartOfAccounts
  readonly smallBusiness: boolean
  readonly vatMethod: 'ist' | 'soll'
  readonly municipalityAgs: string | null
  readonly multiplierOverride: number | null
  readonly startDate: string | null
  readonly vatPrepaymentsCents: number | null
  readonly tradeTaxInputs: TradeTaxInputs
  readonly lossFacts: LossFacts
  readonly partnershipShares: readonly PartnershipShare[]
  readonly bookExists: boolean
}

export interface ProfileInput {
  readonly confirmedKind?: 'freiberuf' | 'gewerbe' | null | undefined
  readonly professionAnswers?: Partial<ProfessionAnswers> | null | undefined
  readonly name?: string | null | undefined
  readonly mode?: BookkeepingMode | undefined
  readonly chart?: ChartOfAccounts | undefined
  readonly smallBusiness?: boolean | undefined
  readonly vatMethod?: 'ist' | 'soll' | undefined
  readonly municipalityAgs?: string | null | undefined
  readonly multiplierOverride?: number | null | undefined
  readonly startDate?: string | null | undefined
  readonly vatPrepaymentsCents?: number | null | undefined
  readonly tradeTaxInputs?: TradeTaxInputs | null | undefined
  readonly lossFacts?: LossFacts | null | undefined
  readonly partnershipShares?: readonly PartnershipShare[] | null | undefined
}

export interface BookView {
  readonly chart: ChartOfAccounts
  readonly mode: BookkeepingMode
  readonly lockedThrough: string | null
  readonly integrity: BookIntegrity
  readonly entries: readonly (JournalEntry & { readonly source: string; readonly reversedBy: number | null })[]
}

export interface ElsterLineValue {
  readonly id: string
  readonly zeile: string | null
  readonly kennzahlen: readonly string[]
  readonly label: string
  /** Euros, or a word („Ja“) where the line takes one; null where the app has nothing for it. */
  readonly value: number | string | null
}

export interface ElsterHelp {
  readonly form: ElsterForm
  readonly year: number
  readonly status: 'published' | 'not_published' | 'not_available'
  /** German, for the user: why a year or form has no line numbers. */
  readonly note: string | null
  readonly sourceUrl: string | null
  /**
   * Whether the lines carry official Zeile numbers. False for Anlage S/G (electronic only), for an
   * unpublished year and for GewSt 1 A (the ELSTER help names the fields, not their Zeile): the app then
   * names the field by its label („Feld in Mein ELSTER: …“).
   */
  readonly lineNumbersAvailable: boolean
  readonly lines: readonly ElsterLineValue[]
}

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (value === null) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const isoNow = (): string => new Date().toISOString()

/** The self-employment path (ADR-0101): profile, the book, its derivations and the fill-in help. */
@Injectable()
export class BusinessService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(HEBESATZ_DIRECTORY) private readonly hebesaetze: HebesatzDirectory,
    @Optional() @Inject(UnlockService) private readonly unlock?: UnlockService,
    @Optional() @Inject(BUSINESS_CLOCK) private readonly now: () => string = isoNow,
  ) {}

  // ------------------------------------------------------------------------------------------------
  // Gate

  /** The path exists only with the switch on and a job that has a business (REQ-015 as amended). */
  private async assertOpen(userId: string, year: number): Promise<void> {
    if (!selfEmploymentEnabled()) {
      throw new ForbiddenError('SELF_EMPLOYMENT_DISABLED', 'Selbstständige kann SteuerEule noch nicht berechnen.')
    }
    const answers = answersFrom(await this.interview.findAllForUserAndYear(userId, year))
    if (!declaresSelfEmployment(answers.job)) {
      throw new ForbiddenError('SELF_EMPLOYMENT_NOT_DECLARED', 'Im Interview ist für dieses Jahr keine selbstständige Tätigkeit angegeben.')
    }
  }

  /** Whether the path is open for the year (switch on, a business declared), for callers that must not throw. */
  async pathOpen(userId: string, year: number): Promise<boolean> {
    try {
      await this.assertOpen(userId, year)
      return true
    } catch (error) {
      if (error instanceof ForbiddenError) return false
      throw error
    }
  }

  /** The fill-in help and the exports are part of the paid self-employment tier (ADR-0101 §21). */
  private async assertUnlocked(userId: string, year: number): Promise<void> {
    if (!this.unlock) return
    if ((await this.unlock.status(userId, year)) !== 'freigeschaltet') {
      throw new PaymentRequiredError(year)
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Profile

  private async profileRecord(userId: string, year: number, person: BusinessPerson): Promise<BusinessProfileRecord | null> {
    return this.repository.findProfile(userId, year, person)
  }

  private toView(record: BusinessProfileRecord | null, person: BusinessPerson, bookExists: boolean): BusinessProfileView {
    return {
      person,
      confirmedKind: record?.kind ?? null,
      professionAnswers: parseJson<ProfessionAnswers | null>(record?.professionAnswers ?? null, null),
      suggestion: parseJson<ProfessionSuggestion | null>(record?.suggestion ?? null, null),
      name: record?.name ?? null,
      mode: record?.mode ?? 'euer',
      chart: record?.chart ?? 'SKR03',
      smallBusiness: record?.smallBusiness ?? false,
      vatMethod: record?.vatMethod ?? 'ist',
      municipalityAgs: record?.municipalityAgs ?? null,
      multiplierOverride: record?.multiplierOverride ? Number(record.multiplierOverride) : null,
      startDate: record?.startDate ?? null,
      vatPrepaymentsCents: record?.vatPrepayments ? Number(record.vatPrepayments) : null,
      tradeTaxInputs: parseJson<TradeTaxInputs>(record?.tradeTaxInputs ?? null, {}),
      lossFacts: parseJson<LossFacts>(record?.lossFacts ?? null, {}),
      partnershipShares: parseJson<PartnershipShare[]>(record?.partnershipShares ?? null, []),
      bookExists,
    }
  }

  async getProfile(userId: string, year: number, person: BusinessPerson): Promise<BusinessProfileView> {
    await this.assertOpen(userId, year)
    const [record, book] = await Promise.all([this.profileRecord(userId, year, person), this.repository.loadBook(userId, year, person)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.toView(record, person, book !== null)
  }

  async saveProfile(userId: string, year: number, person: BusinessPerson, input: ProfileInput): Promise<BusinessProfileView> {
    await this.assertOpen(userId, year)
    const book = await this.repository.loadBook(userId, year, person)
    // The trigger keeps chart and mode of a book; the service says so before the database refuses.
    if (book && book.ledger.entries.length > 0 && ((input.chart !== undefined && input.chart !== book.book.chart) || (input.mode !== undefined && input.mode !== book.book.mode))) {
      throw new ConflictError('BOOK_FRAME_FIXED', 'Kontenrahmen und Gewinnermittlung stehen fest, sobald im Jahr gebucht wurde.')
    }
    const patch: BusinessProfilePatch = {
      ...(input.confirmedKind !== undefined ? { kind: input.confirmedKind } : {}),
      ...(input.professionAnswers !== undefined
        ? {
            professionAnswers: input.professionAnswers === null ? null : JSON.stringify(input.professionAnswers),
            // The suggestion is kept with the answers it came from, so the reasons stay explainable.
            suggestion: input.professionAnswers === null ? null : JSON.stringify(suggestProfessionKind(withDefaultAnswers(input.professionAnswers))),
          }
        : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.chart !== undefined ? { chart: input.chart } : {}),
      ...(input.smallBusiness !== undefined ? { smallBusiness: input.smallBusiness } : {}),
      ...(input.vatMethod !== undefined ? { vatMethod: input.vatMethod } : {}),
      ...(input.municipalityAgs !== undefined ? { municipalityAgs: input.municipalityAgs } : {}),
      ...(input.multiplierOverride !== undefined ? { multiplierOverride: input.multiplierOverride === null ? null : String(input.multiplierOverride) } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.vatPrepaymentsCents !== undefined ? { vatPrepayments: input.vatPrepaymentsCents === null ? null : String(input.vatPrepaymentsCents) } : {}),
      ...(input.tradeTaxInputs !== undefined ? { tradeTaxInputs: input.tradeTaxInputs === null ? null : JSON.stringify(input.tradeTaxInputs) } : {}),
      ...(input.lossFacts !== undefined ? { lossFacts: input.lossFacts === null ? null : JSON.stringify(input.lossFacts) } : {}),
      ...(input.partnershipShares !== undefined ? { partnershipShares: input.partnershipShares === null ? null : JSON.stringify(input.partnershipShares) } : {}),
    }
    const saved = await this.repository.saveProfile(userId, year, person, patch)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.toView(saved, person, book !== null)
  }

  /** The frame a new book gets: what the profile says, SKR03 and EÜR otherwise. */
  private async frame(userId: string, year: number, person: BusinessPerson): Promise<{ chart: ChartOfAccounts; mode: BookkeepingMode; profile: BusinessProfileRecord | null }> {
    const profile = await this.profileRecord(userId, year, person)
    return { chart: profile?.chart ?? 'SKR03', mode: profile?.mode ?? 'euer', profile }
  }

  // ------------------------------------------------------------------------------------------------
  // The book

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

  async getBook(userId: string, year: number, person: BusinessPerson): Promise<BookView> {
    await this.assertOpen(userId, year)
    const [{ chart, mode }, book] = await Promise.all([this.frame(userId, year, person), this.repository.loadBook(userId, year, person)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.view(book, chart, mode)
  }

  /** A change of the book refuses to build on a broken chain: the user has to see it first. */
  private assertIntact(book: LoadedBook): void {
    const integrity = bookIntegrity(book.ledger, book.log)
    if (!integrity.ok) throw new ConflictError('BOOK_INTEGRITY_BROKEN', integrity.reason)
  }

  /** Posts drafts in order, each with its log record; validation errors come back in German. */
  private postAll(book: LoadedBook, year: number, profile: BusinessProfileRecord | null, drafts: readonly { draft: BookingDraft; source: string; keepDraft?: string }[]): { ledger: Ledger; append: BookAppend; posted: JournalEntry[] } {
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
      log = appendLogRecord(log, 'entry', result.entry, this.now())
      posted.push(result.entry)
      entries.push({ entry: result.entry, source, ...(keepDraft !== undefined ? { draft: keepDraft } : {}) })
    }
    return { ledger, posted, append: { entries, log: log.slice(book.log.length) } }
  }

  /** One booking (ADR-0101 §11); a draft with an asset also enters the asset register. */
  async post(userId: string, year: number, person: BusinessPerson, draft: BookingDraft, source = 'nutzer', keepDraft?: string): Promise<JournalEntry> {
    await this.assertOpen(userId, year)
    const { chart, mode, profile } = await this.frame(userId, year, person)
    const entry = await this.repository.changeBook(userId, year, person, { chart, mode }, (book) => {
      if (keepDraft !== undefined && [...book.sources.values()].includes(source)) throw new ConflictError('BOOKING_DRAFT_POSTED', 'Dieser Buchungsentwurf ist schon gebucht.')
      const { posted, append } = this.postAll(book, year, profile, [{ draft, source, ...(keepDraft !== undefined ? { keepDraft } : {}) }])
      const asset = draft.asset !== undefined && draft.asset.method !== 'sofort' ? this.assetOf(year, person, chart, posted[0]!, draft) : null
      return { result: posted[0]!, append: asset === null ? append : { ...append, assets: [asset] } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry
  }

  /** The asset an entry capitalises, checked by the core's schedule before anything is written. */
  private assetOf(year: number, person: BusinessPerson, chart: ChartOfAccounts, entry: JournalEntry, draft: BookingDraft): NewFixedAsset | null {
    const assetLine = entry.lines.find((l) => l.side === 'debit' && l.taxPart !== 'tax' && accountKindIsAsset(chart, l.account))
    if (assetLine === undefined || draft.asset === undefined) return null
    const category = draft.asset.category
    const asset: NewFixedAsset = {
      taxYear: year,
      person,
      label: draft.asset.label,
      account: assetLine.account,
      acquisitionDate: entry.date,
      acquisitionCost: assetLine.amount,
      method: draft.asset.method,
      category: category ?? null,
      usefulLifeYears: draft.asset.usefulLifeYears ?? (category ? USEFUL_LIVES[category].years : null),
      specialDepreciation: null,
      disposal: null,
    }
    ledgerCall(() => registerAssetOf({ ...asset, id: 'neu' }, year))
    return asset
  }

  /** Storno (GoBD Rz. 58 ff.): a mirrored entry, the original stays. */
  async reverse(userId: string, year: number, person: BusinessPerson, number: number, input: { date: string; documentNumber: string; text?: string | undefined }): Promise<JournalEntry> {
    await this.assertOpen(userId, year)
    const { chart, mode } = await this.frame(userId, year, person)
    const entry = await this.repository.changeBook(userId, year, person, { chart, mode }, (book) => {
      this.assertIntact(book)
      if (Number(input.date.slice(0, 4)) !== year) throw new InvalidInputError('BOOKING_WRONG_YEAR', `Das Datum ${input.date} liegt nicht im Jahr ${year}.`)
      const result = ledgerCall(() => reverseEntry(book.ledger, number, { date: input.date, documentNumber: input.documentNumber, ...(input.text !== undefined ? { text: input.text } : {}) }))
      const log = appendLogRecord(book.log, 'entry', result.entry, this.now())
      return { result: result.entry, append: { entries: [{ entry: result.entry, source: 'storno' }], log: log.slice(book.log.length) } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry
  }

  /** The quick path (ADR-0101 §6): a total per EÜR line, booked against the bank like any entry. */
  async quickEntry(userId: string, year: number, person: BusinessPerson, totals: readonly { key: string; amountCents: number; date?: string | undefined }[]): Promise<readonly JournalEntry[]> {
    await this.assertOpen(userId, year)
    const { chart, mode, profile } = await this.frame(userId, year, person)
    if (mode !== 'euer') throw new InvalidInputError('QUICK_ENTRY_EUER_ONLY', 'Summen je EÜR-Zeile gibt es nur bei der Einnahmenüberschussrechnung.')
    const bank = bankAccountOf(chart)
    const drafts = totals.map(({ key, amountCents, date }) => {
      if (!isEuerKey(key)) throw new InvalidInputError('QUICK_ENTRY_UNKNOWN_KEY', `Die EÜR-Position „${key}“ gibt es nicht.`)
      const account = accountForEuerKey(chart, key)
      if (account === null) throw new InvalidInputError('QUICK_ENTRY_NO_ACCOUNT', `Für „${key}“ hat der ${chart} kein Konto.`)
      const income = isIncomeKey(key)
      const draft: BookingDraft = {
        date: date ?? `${year}-12-31`,
        documentNumber: `Summe-${key}`,
        text: `Summe ${year}: ${key}`,
        lines: income
          ? [{ account: bank, side: 'debit', amount: amountCents }, { account, side: 'credit', amount: amountCents }]
          : [{ account, side: 'debit', amount: amountCents }, { account: bank, side: 'credit', amount: amountCents }],
      }
      return { draft, source: 'summe' }
    })
    const posted = await this.repository.changeBook(userId, year, person, { chart, mode }, (book) => {
      const result = this.postAll(book, year, profile, drafts)
      return { result: result.posted, append: result.append }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return posted
  }

  /** Festschreibung up to a day; it only moves forward, in the core, the database and the log. */
  async lock(userId: string, year: number, person: BusinessPerson, through: string): Promise<BookView> {
    await this.assertOpen(userId, year)
    const { chart, mode } = await this.frame(userId, year, person)
    await this.repository.changeBook(userId, year, person, { chart, mode }, (book) => {
      this.assertIntact(book)
      const ledger = ledgerCall(() => lockPeriod(book.ledger, through))
      const log = appendLogRecord(book.log, 'lock', { through }, this.now())
      return { result: ledger, append: { log: log.slice(book.log.length), lockedThrough: through } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.view(await this.repository.loadBook(userId, year, person), chart, mode)
  }

  // ------------------------------------------------------------------------------------------------
  // Bank import (ADR-0101 §14)

  async importBank(
    userId: string,
    year: number,
    person: BusinessPerson,
    input: { format: 'csv' | 'camt053'; content: string; preset?: BankCsvPreset | undefined; mapping?: CsvMapping | undefined },
  ): Promise<{ readonly added: number; readonly duplicates: number; readonly outsideYear: number }> {
    await this.assertOpen(userId, year)
    const { chart, mode } = await this.frame(userId, year, person)
    let parsed: readonly BankTransaction[]
    try {
      if (input.format === 'camt053') parsed = parseCamt053(input.content)
      else {
        const mapping = input.mapping ?? (input.preset ? BANK_CSV_PRESETS[input.preset] : undefined)
        if (mapping === undefined) throw new InvalidInputError('BANK_MAPPING_MISSING', 'Für eine CSV-Datei die Bank wählen oder die Spalten zuordnen.')
        parsed = parseBankCsv(input.content, mapping)
      }
    } catch (error) {
      if (error instanceof InvalidInputError) throw error
      throw new InvalidInputError('BANK_FILE_UNREADABLE', error instanceof Error ? error.message : 'Die Datei ließ sich nicht lesen.')
    }
    const all = withFingerprints(parsed)
    const inYear = all.filter((tx) => Number(tx.bookingDate.slice(0, 4)) === year)
    const added = await this.repository.addBankTransactions(
      userId,
      year,
      person,
      { chart, mode },
      inYear.map(({ fingerprint, amount, ...details }) => ({ fingerprint, amount, details: JSON.stringify(details) })),
    )
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return { added, duplicates: inYear.length - added, outsideYear: all.length - inYear.length }
  }

  private async rules(userId: string, person: BusinessPerson): Promise<BookingRule[]> {
    return (await this.repository.listRules(userId, person)).map((r) => ({ id: r.id, ...parseJson<Omit<BookingRule, 'id' | 'account' | 'taxKey'>>(r.criteria, {}), account: r.account, taxKey: r.taxKey as BookingTaxKey, ...(r.text ? { text: r.text } : {}) }))
  }

  async listBank(userId: string, year: number, person: BusinessPerson) {
    await this.assertOpen(userId, year)
    const [records, rules] = await Promise.all([this.repository.listBankTransactions(userId, year, person), this.rules(userId, person)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return records.map((r) => {
      const tx: BankTransaction = { ...parseJson<Omit<BankTransaction, 'amount'>>(r.details, emptyTransaction()), amount: r.amount }
      return { id: r.id, status: r.status, entryNumber: r.entryNumber, transaction: tx, suggestion: r.status === 'offen' ? suggestBooking(tx, rules) : null }
    })
  }

  /** Takes a suggestion (or the user's own account) as a booking: bank against the account. */
  async acceptBank(
    userId: string,
    year: number,
    person: BusinessPerson,
    id: string,
    input: { account?: string | undefined; taxKey?: BookingTaxKey | undefined; text?: string | undefined; documentNumber?: string | undefined; remember?: boolean | undefined },
  ): Promise<JournalEntry> {
    const list = await this.listBank(userId, year, person)
    const item = list.find((t) => t.id === id)
    if (!item) throw new NotFoundError('BANK_TRANSACTION_NOT_FOUND', 'Diesen Kontoumsatz gibt es nicht.')
    if (item.status !== 'offen') throw new ConflictError('BANK_TRANSACTION_DONE', 'Dieser Kontoumsatz ist schon erledigt.')
    const account = input.account ?? item.suggestion?.account
    if (account === undefined) throw new InvalidInputError('BANK_ACCOUNT_MISSING', 'Für diesen Umsatz gibt es keinen Vorschlag; bitte ein Konto wählen.')
    const taxKey = input.taxKey ?? item.suggestion?.taxKey ?? 'none'
    const text = input.text ?? item.suggestion?.text ?? (item.transaction.counterpartyName ?? item.transaction.reference)
    const { chart } = await this.frame(userId, year, person)
    const draft = draftFromTransaction(item.transaction, bankAccountOf(chart), { ruleId: item.suggestion?.ruleId ?? 'manuell', account, taxKey, text }, input.documentNumber ?? `Bank-${item.transaction.bookingDate}-${id.slice(0, 6)}`)
    const entry = await this.post(userId, year, person, draft, `bank:${id}`)
    await this.repository.setBankTransactionStatus(userId, id, 'gebucht', entry.number)
    if (input.remember === true && (item.transaction.counterpartyIban || item.transaction.counterpartyName)) {
      const criteria = item.transaction.counterpartyIban ? { counterpartyIban: item.transaction.counterpartyIban } : { counterpartyNameContains: item.transaction.counterpartyName! }
      await this.repository.createRule(userId, { person, criteria: JSON.stringify({ ...criteria, direction: item.transaction.amount > 0 ? 'in' : 'out' }), account, taxKey, text })
    }
    return entry
  }

  async ignoreBank(userId: string, year: number, person: BusinessPerson, id: string): Promise<void> {
    await this.assertOpen(userId, year)
    const records = await this.repository.listBankTransactions(userId, year, person)
    if (!records.some((r) => r.id === id)) throw new NotFoundError('BANK_TRANSACTION_NOT_FOUND', 'Diesen Kontoumsatz gibt es nicht.')
    await this.repository.setBankTransactionStatus(userId, id, 'ignoriert', null)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
  }

  // ------------------------------------------------------------------------------------------------
  // Fixed assets (ADR-0101 §7)

  async assets(userId: string, year: number, person: BusinessPerson) {
    await this.assertOpen(userId, year)
    const records = await this.repository.listAssets(userId, person, year)
    const register = assetRegister(records.map((r) => registerAssetOf(r, year)), year)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return { register, records }
  }

  async createAsset(
    userId: string,
    year: number,
    person: BusinessPerson,
    input: { label: string; account: string; acquisitionDate: string; acquisitionCostCents: number; method: string; category?: string | undefined; usefulLifeYears?: number | undefined },
  ): Promise<FixedAssetRecord> {
    await this.assertOpen(userId, year)
    if (Number(input.acquisitionDate.slice(0, 4)) > year) throw new InvalidInputError('ASSET_FUTURE', 'Das Anschaffungsdatum liegt nach diesem Jahr.')
    const record = await this.repository.createAsset(userId, {
      taxYear: Number(input.acquisitionDate.slice(0, 4)),
      person,
      label: input.label,
      account: input.account,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: input.acquisitionCostCents,
      method: input.method,
      category: input.category ?? null,
      usefulLifeYears: input.usefulLifeYears ?? null,
      specialDepreciation: null,
      disposal: null,
    })
    // The schedule must be computable now, not only at the year's end.
    ledgerCall(() => registerAssetOf(record, year))
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return record
  }

  async disposeAsset(userId: string, year: number, person: BusinessPerson, assetId: string, disposal: { date: string; proceedsCents?: number | undefined }): Promise<FixedAssetRecord> {
    await this.assertOpen(userId, year)
    const updated = await this.repository.setAssetDisposal(userId, assetId, JSON.stringify(disposal))
    if (!updated) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return updated
  }

  /** Books the year's depreciation and disposals the core computed, once per asset and year. */
  async bookDepreciation(userId: string, year: number, person: BusinessPerson): Promise<readonly JournalEntry[]> {
    await this.assertOpen(userId, year)
    const { chart, mode, profile } = await this.frame(userId, year, person)
    const assets = (await this.repository.listAssets(userId, person, year)).map((r) => registerAssetOf(r, year))
    const posted = await this.repository.changeBook(userId, year, person, { chart, mode }, (book) => {
      const booked = new Set(book.sources.values())
      const drafts: { draft: BookingDraft; source: string }[] = [
        ...ledgerCall(() => depreciationDrafts(chart, assets, year)).map((draft) => ({ draft, source: `afa:${draft.documentNumber}` })),
        ...ledgerCall(() => disposalDrafts(chart, assets, year, bankAccountOf(chart))).map((draft) => ({ draft, source: `abgang:${draft.documentNumber}` })),
      ].filter((d) => !booked.has(d.source))
      const result = this.postAll(book, year, profile, drafts)
      return { result: result.posted, append: result.append }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return posted
  }

  // ------------------------------------------------------------------------------------------------
  // Year closing, profit (ADR-0101 §5, §15)

  private async loaded(userId: string, year: number, person: BusinessPerson): Promise<{ book: LoadedBook | null; ledger: Ledger; profile: BusinessProfileRecord | null }> {
    const [{ chart, mode, profile }, book] = await Promise.all([this.frame(userId, year, person), this.repository.loadBook(userId, year, person)])
    return { book, profile, ledger: book?.ledger ?? { chart, mode, entries: [], lockedThrough: null } }
  }

  /** The profit of the year in euros from the book, the restricted expenses applied (EÜR) or the GuV (Bilanz). */
  private profitOf(ledger: Ledger, year: number): number {
    if (ledger.mode === 'euer') return euerProfit(year, byKeyInEuros(euerTotals(ledger, year).byKey)).profitEur
    return eur(incomeStatement(ledger, year).profit)
  }

  async closing(userId: string, year: number, person: BusinessPerson) {
    await this.assertOpen(userId, year)
    const { book, ledger } = await this.loaded(userId, year, person)
    const integrity = book ? bookIntegrity(book.ledger, book.log) : ({ ok: true, entries: 0, headHash: null } as const)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    if (ledger.mode === 'euer') {
      const totals = euerTotals(ledger, year)
      const profit = euerProfit(year, byKeyInEuros(totals.byKey))
      return { mode: 'euer' as const, integrity, euer: { totals, profit }, bilanz: null }
    }
    const statement = incomeStatement(ledger, year)
    const sheet = ledgerCall(() => balanceSheet(ledger, year))
    const balances = ledgerCall(() => closingBalances(ledger, year))
    return { mode: 'bilanz' as const, integrity, euer: null, bilanz: { incomeStatement: statement, balanceSheet: sheet, closingBalances: balances, openingEntry: openingEntryDraft(ledger.chart, balances, year + 1) } }
  }

  /** Carries the closing balances into the next year's book as its Eröffnungsbilanz entry. */
  async carryForward(userId: string, year: number, person: BusinessPerson): Promise<JournalEntry> {
    const closing = await this.closing(userId, year, person)
    if (closing.bilanz === null) throw new InvalidInputError('CARRY_FORWARD_BILANZ_ONLY', 'Eine Eröffnungsbilanz gibt es nur bei der Bilanz.')
    if (!closing.integrity.ok) throw new ConflictError('BOOK_INTEGRITY_BROKEN', closing.integrity.reason)
    const next = year + 1
    // The next year's own profile decides its frame; without one it continues this year's.
    const [nextFrame, thisFrame] = await Promise.all([this.frame(userId, next, person), this.frame(userId, year, person)])
    const profile = nextFrame.profile
    const frame = profile ? { chart: nextFrame.chart, mode: nextFrame.mode } : { chart: thisFrame.chart, mode: 'bilanz' as const }
    const entry = await this.repository.changeBook(userId, next, person, frame, (book) => {
      if ([...book.sources.values()].includes('eb')) throw new ConflictError('OPENING_ENTRY_EXISTS', `Die Eröffnungsbilanz ${next} ist schon gebucht.`)
      const result = this.postAll(book, next, profile, [{ draft: closing.bilanz!.openingEntry, source: 'eb' }])
      return { result: result.posted[0]!, append: result.append }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry
  }

  // ------------------------------------------------------------------------------------------------
  // Umsatzsteuer (ADR-0101 §8)

  async vatReturn(userId: string, year: number, person: BusinessPerson): Promise<{ readonly figures: VatFigures; readonly result: VatAnnualResult; readonly cashAccountingAllowed: boolean }> {
    await this.assertOpen(userId, year)
    const { ledger, profile } = await this.loaded(userId, year, person)
    const result = this.vatOf(ledger, profile, year)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    const turnover = (result.figures.taxableNetEur.standard ?? 0) + (result.figures.taxableNetEur.reduced ?? 0) + result.figures.smallBusinessTurnoverEur
    return { ...result, cashAccountingAllowed: cashAccountingAllowed(year, turnover, profile?.kind === 'freiberuf') }
  }

  private vatOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number): { figures: VatFigures; result: VatAnnualResult } {
    const figures = vatFiguresOf(ledger.entries, year)
    const result = vatAnnualReturn({
      year,
      method: profile?.vatMethod ?? 'ist',
      regime: profile?.smallBusiness ? 'klein' : 'regel',
      taxableNetEur: figures.taxableNetEur,
      taxFreeWithDeductionEur: figures.taxFreeWithDeductionEur,
      taxFreeWithoutDeductionEur: figures.taxFreeWithoutDeductionEur,
      reverseChargeNetEur: figures.reverseChargeNetEur,
      inputVatEur: figures.inputVatEur,
      prepaymentsEur: profile?.vatPrepayments ? eur(Number(profile.vatPrepayments)) : 0,
    })
    return { figures, result }
  }

  // ------------------------------------------------------------------------------------------------
  // Gewerbesteuer (ADR-0101 §9)

  lookupHebesatz(year: number, name: string, land?: string): HebesatzLookup {
    return this.hebesaetze.lookup(year, name, land)
  }

  /** The multiplier: the user's correction first, then the table by AGS; null when neither is there. */
  private multiplierOf(profile: BusinessProfileRecord | null, year: number): { percent: number; source: 'korrektur' | 'tabelle'; tableYear: number | null; note: string | null } | null {
    if (profile?.multiplierOverride) return { percent: Number(profile.multiplierOverride), source: 'korrektur', tableYear: null, note: null }
    if (!profile?.municipalityAgs) return null
    const found = this.hebesaetze.byAgs(year, profile.municipalityAgs)
    return found ? { percent: found.municipality.multiplierPercent, source: 'tabelle', tableYear: found.tableYear, note: found.note } : null
  }

  private tradeTaxOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number): { status: 'berechnet'; result: TradeTaxReturn; multiplier: NonNullable<ReturnType<BusinessService['multiplierOf']>>; profitEur: number } | { status: 'offen'; missing: string[] } | { status: 'entfaellt'; reason: string } {
    if (profile?.kind !== 'gewerbe') return { status: 'entfaellt', reason: 'Freiberufler zahlen keine Gewerbesteuer.' }
    const multiplier = this.multiplierOf(profile, year)
    if (multiplier === null) return { status: 'offen', missing: ['hebesatz'] }
    const inputs = parseJson<TradeTaxInputs>(profile.tradeTaxInputs, {})
    const result = tradeTaxReturn({
      year,
      profitEur: this.profitOf(ledger, year),
      financing: inputs.financing,
      otherAdditionsEur: inputs.otherAdditionsEur,
      landDeductionEur: landDeduction(year, { einheitswertEur: inputs.einheitswertEur }),
      otherDeductionsEur: inputs.otherDeductionsEur,
      lossCarriedForwardEur: inputs.lossCarriedForwardEur,
      multiplierPercent: multiplier.percent,
    })
    return { status: 'berechnet', result, multiplier, profitEur: this.profitOf(ledger, year) }
  }

  async tradeTax(userId: string, year: number, person: BusinessPerson) {
    await this.assertOpen(userId, year)
    const { ledger, profile } = await this.loaded(userId, year, person)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.tradeTaxOf(ledger, profile, year)
  }

  // ------------------------------------------------------------------------------------------------
  // Verluste (ADR-0101 §10)

  async losses(userId: string, year: number, person: BusinessPerson) {
    await this.assertOpen(userId, year)
    const { ledger, profile } = await this.loaded(userId, year, person)
    const facts = parseJson<LossFacts>(profile?.lossFacts ?? null, {})
    const profitEur = this.profitOf(ledger, year)
    const year_ = applyLosses({ year, joint: false, gdeEur: profitEur, carriedForwardEur: facts.carriedForwardEur ?? 0, carriedBackEur: facts.carriedBackEur })
    const carryBack = year_.newLossEur > 0 ? carryBackLoss({ lossYear: year, lossEur: year_.newLossEur, joint: false, roomEur: facts.roomEur ?? [0, 0], waive: facts.waiveCarryBack === true }) : null
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return { facts, rules: lossRules(year, false), businessProfitEur: profitEur, year: year_, carryBack }
  }

  // ------------------------------------------------------------------------------------------------
  // Booking drafts (owl, receipts; ADR-0066 Zero-Write): posted only when the user takes them

  /** The accepted draft behind `eule:<ref>`, while its entry stands (not reversed); null otherwise. */
  async acceptedDraft(userId: string, year: number, person: BusinessPerson, ref: string): Promise<string | null> {
    const book = await this.repository.loadBook(userId, year, person)
    if (book === null) return null
    const number = [...book.sources.entries()].find(([, source]) => source === `eule:${ref}`)?.[0]
    if (number === undefined) return null
    if (book.ledger.entries.some((e) => e.reversalOf === number)) return null
    return book.drafts.get(number) ?? null
  }

  /** Posts an accepted draft (`value`), or reverses the entry of `ref` when `value` is null (the draft's undo). */
  async applyDraft(userId: string, year: number, person: BusinessPerson, ref: string, value: string | null): Promise<void> {
    if (value === null) {
      const book = await this.repository.loadBook(userId, year, person)
      const number = book ? [...book.sources.entries()].find(([, source]) => source === `eule:${ref}`)?.[0] : undefined
      if (number === undefined) throw new NotFoundError('BOOKING_DRAFT_NOT_POSTED', 'Zu diesem Entwurf gibt es keine Buchung.')
      const today = this.now().slice(0, 10)
      const date = Number(today.slice(0, 4)) === year ? today : `${year}-12-31`
      await this.reverse(userId, year, person, number, { date, documentNumber: `Storno-${number}`, text: `Storno von Buchung ${number} (Entwurf zurückgenommen)` })
      return
    }
    const parsed = parseBookingDraft(value)
    if (!parsed.ok) throw new InvalidInputError('BOOKING_DRAFT_INVALID', parsed.reason)
    await this.post(userId, year, person, parsed.draft, `eule:${ref}`, value)
  }

  // ------------------------------------------------------------------------------------------------
  // For the estimate and the owl

  /** The person's Gewinneinkünfte for the core estimate (ADR-0101): Anlage S, Anlage G, § 35 inputs. */
  async estimateInput(userId: string, year: number, person: BusinessPerson): Promise<{ business: BusinessIncome; losses: { carriedForwardEur: number; carriedBackEur?: number } } | null> {
    if (!selfEmploymentEnabled()) return null
    const { book, ledger, profile } = await this.loaded(userId, year, person)
    if (profile === null && book === null) return null
    const shares = parseJson<PartnershipShare[]>(profile?.partnershipShares ?? null, [])
    const own = book === null ? 0 : this.profitOf(ledger, year)
    const trade = this.tradeTaxOf(ledger, profile, year)
    const selfEmployedEur = (profile?.kind === 'gewerbe' ? 0 : own) + shares.filter((s) => s.kind === 'freiberuf').reduce((sum, s) => sum + s.profitEur, 0)
    const tradeEur = (profile?.kind === 'gewerbe' ? own : 0) + shares.filter((s) => s.kind === 'gewerbe').reduce((sum, s) => sum + s.profitEur, 0)
    const tradeTax = [
      ...(trade.status === 'berechnet' ? [{ baseAmountEur: trade.result.baseAmountEur, tradeTaxEur: trade.result.tradeTaxEur }] : []),
      ...shares.filter((s) => s.kind === 'gewerbe' && s.baseAmountEur !== undefined).map((s) => ({ baseAmountEur: s.baseAmountEur!, tradeTaxEur: s.tradeTaxEur ?? 0 })),
    ]
    const facts = parseJson<LossFacts>(profile?.lossFacts ?? null, {})
    return {
      business: { selfEmployedEur, tradeEur, tradeTax },
      losses: { carriedForwardEur: facts.carriedForwardEur ?? 0, ...(facts.carriedBackEur !== undefined ? { carriedBackEur: facts.carriedBackEur } : {}) },
    }
  }

  /** A few figures for the owl's case digest; null without a business. */
  async digest(userId: string, year: number): Promise<{ profitSoFarEur: number; vatBalanceEur: number | null; openBankItems: number; mode: BookkeepingMode; kind: string | null } | null> {
    if (!selfEmploymentEnabled()) return null
    const { book, ledger, profile } = await this.loaded(userId, year, 'A')
    if (profile === null && book === null) return null
    const bank = await this.repository.listBankTransactions(userId, year, 'A')
    return {
      profitSoFarEur: book === null ? 0 : this.profitOf(ledger, year),
      vatBalanceEur: profile?.smallBusiness ? null : this.vatOf(ledger, profile, year).result.balanceEur,
      openBankItems: bank.filter((t) => t.status === 'offen').length,
      mode: ledger.mode,
      kind: profile?.kind ?? null,
    }
  }

  /** The book frame and profile facts a booking draft is checked against (owl, receipts). */
  async bookingTarget(userId: string, year: number, person: BusinessPerson) {
    const { ledger, profile } = await this.loaded(userId, year, person)
    return { chart: ledger.chart, mode: ledger.mode, year, lockedThrough: ledger.lockedThrough, smallBusiness: profile?.smallBusiness ?? false }
  }

  // ------------------------------------------------------------------------------------------------
  // ELSTER fill-in help (ADR-0101 §16)

  async elsterHelp(userId: string, year: number, person: BusinessPerson, form: string): Promise<ElsterHelp> {
    await this.assertOpen(userId, year)
    if (!(ELSTER_FORMS as readonly string[]).includes(form)) throw new NotFoundError('ELSTER_FORM_UNKNOWN', `Das Formular „${form}“ kennt die Ausfüllhilfe nicht.`)
    if (!(ELSTER_YEARS as readonly number[]).includes(year)) throw new NotFoundError('ELSTER_YEAR_UNKNOWN', `Für ${year} gibt es keine Ausfüllhilfe.`)
    await this.assertUnlocked(userId, year)
    const { book, ledger, profile } = await this.loaded(userId, year, person)
    if (book) this.assertIntact(book)
    const values = this.formValues(form as ElsterForm, ledger, profile, year)
    const lines = elsterLinesFor(form as ElsterForm, year as ElsterYear)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    if (lines.status === 'published') {
      return {
        form: form as ElsterForm,
        year,
        status: 'published',
        note: null,
        sourceUrl: lines.source.url,
        lineNumbersAvailable: lines.lines.some((line) => line.zeile !== null),
        lines: lines.lines.map((line) => ({ id: line.id, zeile: line.zeile, kennzahlen: line.kennzahlen, label: line.label, value: values.byLine(line.id, line.euerKeys) })),
      }
    }
    // An electronic-only form needs no note of its own: `lineNumbersAvailable: false` already tells the app to say so once.
    const note =
      lines.status === 'not_published'
        ? `Das Formular ${form} für ${year} ist noch nicht veröffentlicht${lines.latestPublishedYear ? ` (zuletzt ${lines.latestPublishedYear})` : ''}. Die App nennt die Beträge, aber keine Zeilen, bis es erscheint.`
        : null
    return { form: form as ElsterForm, year, status: lines.status, note, sourceUrl: null, lineNumbersAvailable: false, lines: values.unnumbered }
  }

  /** What the app computed for a form: by line id (published forms) and as labelled amounts (others). */
  private formValues(form: ElsterForm, ledger: Ledger, profile: BusinessProfileRecord | null, year: number): { byLine: (id: string, euerKeys: readonly EuerKey[]) => number | string | null; unnumbered: ElsterLineValue[] } {
    const profit = this.profitOf(ledger, year)
    const unnumbered = (rows: readonly [string, string, number | string | null][]): ElsterLineValue[] => rows.map(([id, label, value]) => ({ id, zeile: null, kennzahlen: [], label, value }))
    switch (form) {
      case 'anlage-euer': {
        if (ledger.mode !== 'euer') return { byLine: () => null, unnumbered: [] }
        const result = euerProfit(year, byKeyInEuros(euerTotals(ledger, year).byKey))
        const counted = new Map<EuerKey, number>()
        for (const line of result.lines) counted.set(line.key, (counted.get(line.key) ?? 0) + line.amountEur)
        return {
          byLine: (_id, keys) => (keys.length === 0 ? null : keys.some((k) => counted.has(k)) ? round2(keys.reduce((sum, k) => sum + (counted.get(k) ?? 0), 0)) : null),
          unnumbered: unnumbered([...counted.entries()].map(([key, amount]) => [`euer.${key}`, key, round2(amount)])),
        }
      }
      case 'ust-2-a': {
        const { figures, result } = this.vatOf(ledger, profile, year)
        const byId: Record<string, number | null> = {
          'ust.umsatz-19': figures.taxableNetEur.standard ?? 0,
          'ust.umsatz-7': figures.taxableNetEur.reduced ?? 0,
          'ust.steuerfrei-ig-lieferung': figures.taxFreeWithDeductionEur || null,
          'ust.steuerfrei-ohne-vorsteuerabzug-4': figures.taxFreeWithoutDeductionEur || null,
          'ust.13b-andere-leistungen': figures.reverseChargeNetEur.standard || null,
          'ust.berechnung-steuer-13b': result.reverseChargeVatEur || null,
          'ust.vorsteuer-rechnungen': result.inputVatDeductibleEur,
          'ust.verbleibende-umsatzsteuer': result.vatOfYearEur,
          'ust.vorauszahlungssoll': result.prepaymentsEur,
          'ust.abschlusszahlung': result.balanceEur,
          'ust.kleinunternehmer-umsatz-jahr': profile?.smallBusiness ? figures.smallBusinessTurnoverEur : null,
        }
        return { byLine: (id) => byId[id] ?? null, unnumbered: unnumbered(Object.entries(byId).map(([id, v]) => [id, id, v])) }
      }
      case 'anlage-s':
      case 'anlage-g': {
        const isTrade = form === 'anlage-g'
        if ((profile?.kind === 'gewerbe') !== isTrade) return { byLine: () => null, unnumbered: [] }
        const trade = this.tradeTaxOf(ledger, profile, year)
        return {
          byLine: () => null,
          unnumbered: unnumbered([
            [isTrade ? 'anlage-g.gewinn' : 'anlage-s.gewinn', isTrade ? 'Gewinn aus Gewerbebetrieb' : 'Gewinn aus freiberuflicher Tätigkeit', profit],
            ...(isTrade && trade.status === 'berechnet'
              ? ([
                  ['anlage-g.messbetrag', 'Gewerbesteuer-Messbetrag (§ 35 EStG)', trade.result.baseAmountEur],
                  ['anlage-g.gewerbesteuer', 'Tatsächlich zu zahlende Gewerbesteuer (§ 35 EStG)', trade.result.tradeTaxEur],
                ] as [string, string, number][])
              : []),
          ]),
        }
      }
      case 'gewst-1-a': {
        const trade = this.tradeTaxOf(ledger, profile, year)
        if (trade.status !== 'berechnet') return { byLine: () => null, unnumbered: [] }
        const inputs = parseJson<TradeTaxInputs>(profile?.tradeTaxInputs ?? null, {})
        // The fields the ELSTER help of the Gewerbesteuererklärung names (catalogue, `zeile: null`).
        const municipality = profile?.municipalityAgs ? this.hebesaetze.byAgs(year, profile.municipalityAgs)?.municipality.name : undefined
        const byId: Record<string, number | string | null> = {
          'gewst.betriebsstaette': profile?.municipalityAgs ? `${municipality ?? 'Gemeinde'} (AGS ${profile.municipalityAgs})` : null,
          'gewst.gewinn': profit,
          'gewst.hinzurechnung-entgelte-schulden': inputs.financing?.debtChargesEur ?? null,
          'gewst.kuerzung-grundbesitz-einheitswert': inputs.einheitswertEur ?? null,
        }
        return {
          byLine: (id) => byId[id] ?? null,
          unnumbered: unnumbered([
            ['gewst.gewinn', 'Gewinn aus Gewerbebetrieb', profit],
            ['gewst.hinzurechnungen', 'Hinzurechnungen (§ 8 GewStG)', trade.result.additionsEur],
            ['gewst.kuerzungen', 'Kürzungen (§ 9 GewStG)', trade.result.deductionsEur],
            ['gewst.gewerbeverlust', 'Abgezogener Gewerbeverlust (§ 10a GewStG)', trade.result.lossUsedEur],
          ]),
        }
      }
      case 'anlage-sonstiges':
      case 'est-1-a': {
        const facts = parseJson<LossFacts>(profile?.lossFacts ?? null, {})
        const byId: Record<string, number | string | null> = {
          // A yes/no box on the form („Es wurde … festgestellt“); the amount itself has no line, the Finanzamt has it.
          'anlage-sonstiges.verlustvortrag-festgestellt': (facts.carriedForwardEur ?? 0) > 0 ? 'Ja' : null,
          'anlage-sonstiges.verzicht-verlustruecktrag': facts.waiveCarryBack === true ? 'Ja' : null,
          'est-1-a.feststellung-verlustvortrag': profit < 0 ? 'Ja' : null,
        }
        return { byLine: (id) => byId[id] ?? null, unnumbered: unnumbered(Object.entries(byId).filter(([id]) => id.startsWith(form)).map(([id, v]) => [id, id, v])) }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Exports (GoBD Z3, Verfahrensdokumentation, E-Bilanz)

  /** The Z3 data export as a zip; the export itself is logged in the chain (GoBD Rz. 107). */
  async gobdExport(userId: string, year: number, person: BusinessPerson): Promise<Buffer> {
    await this.assertOpen(userId, year)
    await this.assertUnlocked(userId, year)
    const { chart, mode, profile } = await this.frame(userId, year, person)
    const files = await this.repository.changeBook(userId, year, person, { chart, mode }, (book) => {
      this.assertIntact(book)
      const meta = { supplierName: profile?.name ?? 'Einzelunternehmen', supplierLocation: 'Deutschland', from: `${year}-01-01`, to: `${year}-12-31` }
      const log = appendLogRecord(book.log, 'export', { kind: 'gdpdu', from: meta.from, to: meta.to }, this.now())
      return { result: gdpduExport(book.ledger, log, meta).files, append: { log: log.slice(book.log.length) } }
    })
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig-export' })
    return zipStored({
      ...files,
      'LIESMICH.txt':
        'Datenträgerüberlassung nach § 147 Abs. 6 AO im Beschreibungsstandard der Finanzverwaltung.\r\n' +
        'index.xml verweist auf die DTD gdpdu-01-09-2004.dtd; die DTD veröffentlicht das Bundesministerium der Finanzen und liegt dem Prüfprogramm der Finanzverwaltung bei.\r\n',
    })
  }

  async procedureDoc(userId: string, year: number, person: BusinessPerson) {
    await this.assertOpen(userId, year)
    const { chart, mode, profile } = await this.frame(userId, year, person)
    const stored = parseJson<Partial<Record<VerfahrensdokuPlaceholder, string>>>(profile?.procedureDoc ?? null, {})
    const values = {
      // What the app knows itself; the user's own values win.
      kontenrahmen: chart,
      gewinnermittlung: mode === 'euer' ? 'Einnahmenüberschussrechnung (§ 4 Abs. 3 EStG)' : 'Bestandsvergleich (Bilanz, § 4 Abs. 1, § 5 EStG)',
      appVersion: process.env.APP_VERSION ?? 'aktuelle Fassung',
      verschluesselung: 'Feldverschlüsselung mit AES-256-GCM',
      ...(profile?.name ? { unternehmen: profile.name } : {}),
      ...(profile?.startDate ? { beginn: profile.startDate } : {}),
      ...stored,
    }
    return { values: stored, ...verfahrensdokumentation(values) }
  }

  async saveProcedureDoc(userId: string, year: number, person: BusinessPerson, values: Partial<Record<VerfahrensdokuPlaceholder, string>>) {
    await this.assertOpen(userId, year)
    await this.repository.saveProfile(userId, year, person, { procedureDoc: JSON.stringify(values) })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.procedureDoc(userId, year, person)
  }

  /** The E-Bilanz as XBRL, not transmitted (ADR-0101 §17); `download` is gated by the tier. */
  async eBilanz(userId: string, year: number, person: BusinessPerson, download: boolean): Promise<{ xbrl: string; transmitted: false; note: string }> {
    await this.assertOpen(userId, year)
    if (download) await this.assertUnlocked(userId, year)
    const { book, ledger, profile } = await this.loaded(userId, year, person)
    if (ledger.mode !== 'bilanz') throw new InvalidInputError('E_BILANZ_BILANZ_ONLY', 'Eine E-Bilanz gibt es nur bei der Bilanz.')
    if (book) this.assertIntact(book)
    const doc = parseJson<Partial<Record<VerfahrensdokuPlaceholder, string>>>(profile?.procedureDoc ?? null, {})
    const steuernummer = (doc.steuernummer ?? '').replaceAll(/\D/g, '')
    const assets = (await this.repository.listAssets(userId, person, year)).map((r) => registerAssetOf(r, year))
    const xbrl = ledgerCall(() =>
      eBilanzInstance({
        company: { name: profile?.name ?? doc.unternehmen ?? 'Einzelunternehmen', steuernummer },
        fiscalYearBegin: `${year}-01-01`,
        fiscalYearEnd: `${year}-12-31`,
        balanceSheet: balanceSheet(ledger, year),
        incomeStatement: incomeStatement(ledger, year),
        statementType: 'steuerbilanz',
        anlagespiegel: { rows: anlagespiegel(ledger.chart, assets, year).rows },
        // From 2025 the Kontennachweise are part of the data set (§ 5b Abs. 1 EStG i. d. F. JStG 2024).
        ...(kontennachweisRequired(`${year}-01-01`) ? { kontennachweise: kontennachweise(ledger, year) } : {}),
      }),
    )
    await this.audit.append({ userId, action: 'READ', resource: download ? 'selbststaendig-export' : 'selbststaendig' })
    return { xbrl, transmitted: false, note: 'Die E-Bilanz wird noch nicht übermittelt; das kommt mit der ELSTER-Übermittlung. Bis dahin ist dies eine Vorschau des Datensatzes.' }
  }
}

/** HTTP 402 for the paid parts, the same status the printout answers with (ADR-0050). */
export class PaymentRequiredError extends HttpException {
  constructor(year: number) {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: `Die Ausfüllhilfe und die Exporte für ${year} sind noch nicht freigeschaltet.` }, HttpStatus.PAYMENT_REQUIRED)
  }
}

/** The four yes/no profession questions: one not answered yet counts as „Nein“. */
function withDefaultAnswers(answers: Partial<ProfessionAnswers>): ProfessionAnswers {
  return { ...answers, ownExpertWork: answers.ownExpertWork ?? false, employsQualifiedStaff: answers.employsQualifiedStaff ?? false, leadsPersonally: answers.leadsPersonally ?? false, tradesGoods: answers.tradesGoods ?? false }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function emptyTransaction(): Omit<BankTransaction, 'amount'> {
  return { accountIban: null, bookingDate: '1970-01-01', valueDate: null, currency: 'EUR', counterpartyName: null, counterpartyIban: null, reference: '', endToEndId: null, bankReference: null }
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


/** The core's own errors carry German messages for the user: they become a 400 with that message. */
export function ledgerCall<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof LedgerError) throw new InvalidInputError(`LEDGER_${error.code.toUpperCase()}`, error.message)
    if (error instanceof ClosingError || error instanceof AssetError || error instanceof EBilanzError || error instanceof RangeError) {
      throw new InvalidInputError('BUSINESS_RULE', error.message)
    }
    throw error
  }
}

export type { EntryDraft }
