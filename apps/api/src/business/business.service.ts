import { Inject, Injectable } from '@nestjs/common'
import {
  accountFor,
  companyCarUse,
  BAV_SUPPORT_MAX_EUR,
  churchKennzahl,
  federalStateOfAgs,
  minijobCharges,
  minijobLimitEur,
  payrollEntryLines,
  wageTaxFilingPeriod,
  wageTaxReturn,
  disposalGain,
  retainedProfitTax,
  type RetainedProfit,
  ecSalesListInQuarter,
  specialPrepayment,
  vatFilingPeriod,
  vatPeriodReturn,
  vatPeriodsOf,
  type CompanyCarInput,
  type CompanyCarResult,
  chartAccounts,
  BANK_CSV_PRESETS,
  USEFUL_LIVES,
  type AssetCategory,
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
  type EuerKey,
  type ChurchCode,
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
import { selfEmploymentEnabled } from '../config/self-employment.js'
import { elsterTransmissionConfig, missingForTransmission, transmitEBilanz, type TransmissionMode, type TransmissionResult } from './elster-transmission.js'
import {
  BUSINESS_REPOSITORY,
  type BookAppend,
  type BusinessPerson,
  type BusinessRef,
  FIRST_BUSINESS,
  firstBusinessOf,
  type BusinessProfilePatch,
  type BusinessProfileRecord,
  type BusinessRepository,
  type FixedAssetRecord,
  type NewFixedAsset,
  type LoadedBook,
} from './business.repository.js'
import { accountForEuerKey, bankAccountOf, bookIntegrity, deductibleByKeyInEuros, ecSalesListOf, eur, registerAssetOf, vatCorrectionOf, vatFiguresOf, type VatFigures } from './business-ledger.js'
import { HebesatzDirectory, type HebesatzLookup } from './hebesatz.js'
import { zipStored } from './zip.js'
import { BusinessContext } from './business-context.js'
import { HEBESATZ_DIRECTORY } from './business.tokens.js'
import {
  emptyTransaction,
  extraordinaryOf,
  LABEL_ONLY_TAX_KEYS,
  ledgerCall,
  parseJson,
  PERSON_FORMS,
  personWideOf,
  privateBalanceEur,
  profitOf,
  round2,
  smallBusinessCheckOf,
  taxKeyOfAccount,
  turnoverOf,
  withDefaultAnswers,
  withoutPersonWide,
} from './business-helpers.js'
import type {
  AppliedMultiplier, BookView,
  BuildingFactsInput,
  BusinessProfileView,
  DisposalFacts,
  ElsterHelp,
  ElsterLineValue,
  InputVatCorrectionLine,
  LossFacts,
  PartnershipShare,
  PayrollOverview,
  PayrollRunInput,
  ProfileInput,
  RetainedFacts,
  SmallBusinessCheck,
  SpecialDepreciationInput,
  TradeTaxInputs,
  VatCorrectionInput,
  VatPeriodFacts,
  VatPrepaymentOverview,
} from './views.js'

/** The self-employment path (ADR-0101): profile, the book, its derivations and the fill-in help. */
@Injectable()
export class BusinessService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(HEBESATZ_DIRECTORY) private readonly hebesaetze: HebesatzDirectory,
    @Inject(BusinessContext) private readonly context: BusinessContext,
  ) {}

  /** Whether the path is open for the year (switch on, a business declared), for callers that must not throw. */
  async pathOpen(userId: string, year: number): Promise<boolean> {
    try {
      await this.context.assertOpen(userId, year)
      return true
    } catch (error) {
      if (error instanceof ForbiddenError) return false
      throw error
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Profile

  private toView(record: BusinessProfileRecord | null, ref: BusinessRef, bookExists: boolean): BusinessProfileView {
    return {
      person: ref.person,
      business: ref.business,
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
      vatPeriodFacts: parseJson<VatPeriodFacts>(record?.vatPeriodFacts ?? null, {}),
      disposalFacts: parseJson<DisposalFacts | null>(record?.disposalFacts ?? null, null),
      retainedFacts: parseJson<RetainedFacts | null>(record?.retainedFacts ?? null, null),
      tradeTaxInputs: parseJson<TradeTaxInputs>(record?.tradeTaxInputs ?? null, {}),
      lossFacts: parseJson<LossFacts>(record?.lossFacts ?? null, {}),
      partnershipShares: parseJson<PartnershipShare[]>(record?.partnershipShares ?? null, []),
      bookExists,
    }
  }

  async getProfile(userId: string, year: number, ref: BusinessRef): Promise<BusinessProfileView> {
    await this.context.assertOpen(userId, year)
    const [record, book] = await Promise.all([this.context.personRecord(userId, year, ref), this.repository.loadBook(userId, year, ref)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.toView(record, ref, book !== null)
  }

  /** The businesses of the person in the year: at least the first, even before anything was entered. */
  async listBusinesses(userId: string, year: number, person: BusinessPerson): Promise<readonly { business: number; name: string | null; kind: 'freiberuf' | 'gewerbe' | null; mode: BookkeepingMode }[]> {
    await this.context.assertOpen(userId, year)
    const profiles = await this.repository.listProfiles(userId, year, person)
    const listed = profiles.map((p) => ({ business: p.business, name: p.name, kind: p.kind, mode: p.mode }))
    return listed.some((b) => b.business === FIRST_BUSINESS) ? listed : [{ business: FIRST_BUSINESS, name: null, kind: null, mode: 'euer' as const }, ...listed]
  }

  /** A further business of the person (ADR-0101 §22): the next number, with its name. */
  async addBusiness(userId: string, year: number, person: BusinessPerson, name: string): Promise<BusinessProfileView> {
    await this.context.assertOpen(userId, year)
    const existing = await this.repository.listProfiles(userId, year, person)
    if (!existing.some((p) => p.business === FIRST_BUSINESS)) await this.repository.saveProfile(userId, year, firstBusinessOf(person), {})
    const next = Math.max(FIRST_BUSINESS, ...existing.map((p) => p.business)) + 1
    const ref = { person, business: next }
    await this.repository.saveProfile(userId, year, ref, { name })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.getProfile(userId, year, ref)
  }

  /** Removes a further business that has no book yet; the first business and any book stay. */
  async removeBusiness(userId: string, year: number, ref: BusinessRef): Promise<void> {
    await this.context.assertOpen(userId, year)
    if (ref.business === FIRST_BUSINESS) throw new ConflictError('BUSINESS_FIRST_STAYS', 'Der erste Betrieb bleibt; du kannst ihn umbenennen.')
    const book = await this.repository.loadBook(userId, year, ref)
    if (book !== null && book.ledger.entries.length > 0) throw new ConflictError('BUSINESS_HAS_BOOK', 'In diesem Betrieb wurde schon gebucht; Buchungen bleiben erhalten (GoBD).')
    // Assets and payroll runs belong to the business: a later business with the same number must not inherit them.
    const [assets, runs] = await Promise.all([this.repository.listAssets(userId, ref, year + 50), this.repository.listPayrollRuns(userId, year, ref)])
    if (assets.length > 0 || runs.length > 0) throw new ConflictError('BUSINESS_HAS_RECORDS', 'Zu diesem Betrieb gibt es Anlagen oder Lohnläufe; er bleibt.')
    await this.repository.deleteProfile(userId, year, ref)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
  }

  async saveProfile(userId: string, year: number, ref: BusinessRef, input: ProfileInput): Promise<BusinessProfileView> {
    await this.context.assertOpen(userId, year)
    const book = await this.repository.loadBook(userId, year, ref)
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
      ...(input.vatPeriodFacts !== undefined ? { vatPeriodFacts: input.vatPeriodFacts === null ? null : JSON.stringify(input.vatPeriodFacts) } : {}),
      ...(input.disposalFacts !== undefined ? { disposalFacts: input.disposalFacts === null ? null : JSON.stringify(input.disposalFacts) } : {}),
      ...(input.retainedFacts !== undefined ? { retainedFacts: input.retainedFacts === null ? null : JSON.stringify(input.retainedFacts) } : {}),
      ...(input.tradeTaxInputs !== undefined ? { tradeTaxInputs: input.tradeTaxInputs === null ? null : JSON.stringify(input.tradeTaxInputs) } : {}),
      ...(input.lossFacts !== undefined ? { lossFacts: input.lossFacts === null ? null : JSON.stringify(input.lossFacts) } : {}),
      ...(input.partnershipShares !== undefined ? { partnershipShares: input.partnershipShares === null ? null : JSON.stringify(input.partnershipShares) } : {}),
    }
    if (ref.business !== FIRST_BUSINESS) {
      // Person-wide facts live on the first business, whichever business the user saved them from.
      const wide = personWideOf(patch as BusinessProfileRecord)
      if (Object.values(wide).some((v) => v !== undefined)) await this.repository.saveProfile(userId, year, firstBusinessOf(ref.person), wide)
    }
    const ownPatch = ref.business === FIRST_BUSINESS ? patch : withoutPersonWide(patch)
    await this.repository.saveProfile(userId, year, ref, ownPatch)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.toView(await this.context.personRecord(userId, year, ref), ref, book !== null)
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

  async getBook(userId: string, year: number, ref: BusinessRef): Promise<BookView> {
    await this.context.assertOpen(userId, year)
    const [{ chart, mode }, book] = await Promise.all([this.context.frame(userId, year, ref), this.repository.loadBook(userId, year, ref)])
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
      log = appendLogRecord(log, 'entry', result.entry, this.context.now())
      posted.push(result.entry)
      entries.push({ entry: result.entry, source, ...(keepDraft !== undefined ? { draft: keepDraft } : {}) })
    }
    return { ledger, posted, append: { entries, log: log.slice(book.log.length) } }
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
    const posted = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      const result = this.postAll(book, year, profile, drafts)
      return { result: result.posted, append: result.append }
    })
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
  // Bank import (ADR-0101 §14)

  async importBank(
    userId: string,
    year: number,
    ref: BusinessRef,
    input: { format: 'csv' | 'camt053'; content: string; preset?: BankCsvPreset | undefined; mapping?: CsvMapping | undefined },
  ): Promise<{ readonly added: number; readonly duplicates: number; readonly outsideYear: number }> {
    await this.context.assertOpen(userId, year)
    const { chart, mode } = await this.context.frame(userId, year, ref)
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
      ref,
      { chart, mode },
      inYear.map(({ fingerprint, amount, ...details }) => ({ fingerprint, amount, details: JSON.stringify(details) })),
    )
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return { added, duplicates: inYear.length - added, outsideYear: all.length - inYear.length }
  }

  private async rules(userId: string, person: BusinessPerson): Promise<BookingRule[]> {
    return (await this.repository.listRules(userId, person)).map((r) => ({ id: r.id, ...parseJson<Omit<BookingRule, 'id' | 'account' | 'taxKey'>>(r.criteria, {}), account: r.account, taxKey: r.taxKey as BookingTaxKey, ...(r.text ? { text: r.text } : {}) }))
  }

  async listBank(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const [records, rules] = await Promise.all([this.repository.listBankTransactions(userId, year, ref), this.rules(userId, ref.person)])
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
    ref: BusinessRef,
    id: string,
    input: { account?: string | undefined; taxKey?: BookingTaxKey | undefined; text?: string | undefined; documentNumber?: string | undefined; remember?: boolean | undefined },
  ): Promise<JournalEntry> {
    const list = await this.listBank(userId, year, ref)
    const item = list.find((t) => t.id === id)
    if (!item) throw new NotFoundError('BANK_TRANSACTION_NOT_FOUND', 'Diesen Kontoumsatz gibt es nicht.')
    if (item.status !== 'offen') throw new ConflictError('BANK_TRANSACTION_DONE', 'Dieser Kontoumsatz ist schon erledigt.')
    const account = input.account ?? item.suggestion?.account
    if (account === undefined) throw new InvalidInputError('BANK_ACCOUNT_MISSING', 'Für diesen Umsatz gibt es keinen Vorschlag; bitte ein Konto wählen.')
    const taxKey = input.taxKey ?? item.suggestion?.taxKey ?? 'none'
    const text = input.text ?? item.suggestion?.text ?? (item.transaction.counterpartyName ?? item.transaction.reference)
    const { chart } = await this.context.frame(userId, year, ref)
    const draft = draftFromTransaction(item.transaction, bankAccountOf(chart), { ruleId: item.suggestion?.ruleId ?? 'manuell', account, taxKey, text }, input.documentNumber ?? `Bank-${item.transaction.bookingDate}-${id.slice(0, 6)}`)
    const entry = await this.post(userId, year, ref, draft, `bank:${id}`)
    await this.repository.setBankTransactionStatus(userId, id, 'gebucht', entry.number)
    if (input.remember === true && (item.transaction.counterpartyIban || item.transaction.counterpartyName)) {
      const criteria = item.transaction.counterpartyIban ? { counterpartyIban: item.transaction.counterpartyIban } : { counterpartyNameContains: item.transaction.counterpartyName! }
      await this.repository.createRule(userId, { person: ref.person, criteria: JSON.stringify({ ...criteria, direction: item.transaction.amount > 0 ? 'in' : 'out' }), account, taxKey, text })
    }
    return entry
  }

  async ignoreBank(userId: string, year: number, ref: BusinessRef, id: string): Promise<void> {
    await this.context.assertOpen(userId, year)
    const records = await this.repository.listBankTransactions(userId, year, ref)
    if (!records.some((r) => r.id === id)) throw new NotFoundError('BANK_TRANSACTION_NOT_FOUND', 'Diesen Kontoumsatz gibt es nicht.')
    await this.repository.setBankTransactionStatus(userId, id, 'ignoriert', null)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
  }

  // ------------------------------------------------------------------------------------------------
  // Fixed assets (ADR-0101 §7)

  async assets(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const records = await this.repository.listAssets(userId, ref, year)
    const register = assetRegister(records.map((r) => registerAssetOf(r, year)), year)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return { register, records }
  }

  async createAsset(
    userId: string,
    year: number,
    ref: BusinessRef,
    input: {
      label: string
      account: string
      acquisitionDate: string
      acquisitionCostCents: number
      method: string
      category?: string | undefined
      usefulLifeYears?: number | undefined
      building?: BuildingFactsInput | undefined
      specialDepreciation?: SpecialDepreciationInput | undefined
    },
  ): Promise<FixedAssetRecord> {
    await this.context.assertOpen(userId, year)
    if (Number(input.acquisitionDate.slice(0, 4)) > year) throw new InvalidInputError('ASSET_FUTURE', 'Das Anschaffungsdatum liegt nach diesem Jahr.')
    const asset: NewFixedAsset = {
      taxYear: Number(input.acquisitionDate.slice(0, 4)),
      person: ref.person,
      business: ref.business,
      label: input.label,
      account: input.account,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: input.acquisitionCostCents,
      method: input.method,
      category: input.category ?? null,
      // The category sets the useful life when none is given (the DTO's contract), as on the booking path.
      usefulLifeYears: input.usefulLifeYears ?? (input.category && Object.hasOwn(USEFUL_LIVES, input.category) ? USEFUL_LIVES[input.category as AssetCategory].years : null),
      specialDepreciation: input.specialDepreciation ? JSON.stringify(input.specialDepreciation) : null,
      disposal: null,
      buildingFacts: input.building ? JSON.stringify(input.building) : null,
      vatCorrection: null,
    }
    // The schedule must be computable now, not only at the year's end, and before anything is stored.
    ledgerCall(() => registerAssetOf({ ...asset, id: 'neu' }, year))
    const record = await this.repository.createAsset(userId, asset)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return record
  }

  /**
   * The Sonder-AfA (§ 7g Abs. 5 EStG), chosen per year in the acquisition year and the four after it, and the
   * Vorsteuerberichtigung (§ 15a UStG) of an asset. `null` clears one; the schedule must stay computable.
   */
  async setAssetFacts(userId: string, year: number, ref: BusinessRef, assetId: string, facts: { specialDepreciation?: SpecialDepreciationInput | null | undefined; vatCorrection?: VatCorrectionInput | null | undefined }): Promise<FixedAssetRecord> {
    await this.context.assertOpen(userId, year)
    const current = (await this.repository.listAssets(userId, ref, year)).find((a) => a.id === assetId)
    if (!current) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    const patch = {
      ...(facts.specialDepreciation !== undefined ? { specialDepreciation: facts.specialDepreciation === null ? null : JSON.stringify(facts.specialDepreciation) } : {}),
      ...(facts.vatCorrection !== undefined ? { vatCorrection: facts.vatCorrection === null ? null : JSON.stringify(facts.vatCorrection) } : {}),
    }
    const next = { ...current, ...patch }
    ledgerCall(() => registerAssetOf(next, year))
    ledgerCall(() => vatCorrectionOf(next))
    const updated = await this.repository.setAssetFacts(userId, assetId, patch)
    if (!updated) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return updated
  }

  async disposeAsset(userId: string, year: number, ref: BusinessRef, assetId: string, disposal: { date: string; proceedsCents?: number | undefined }): Promise<FixedAssetRecord> {
    await this.context.assertOpen(userId, year)
    const updated = await this.repository.setAssetDisposal(userId, assetId, JSON.stringify(disposal))
    if (!updated) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return updated
  }

  /** Books the year's depreciation and disposals the core computed, once per asset and year. */
  async bookDepreciation(userId: string, year: number, ref: BusinessRef): Promise<readonly JournalEntry[]> {
    await this.context.assertOpen(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const assets = (await this.repository.listAssets(userId, ref, year)).map((r) => registerAssetOf(r, year))
    const posted = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
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

  async closing(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const { book, ledger } = await this.context.loaded(userId, year, ref)
    const integrity = book ? bookIntegrity(book.ledger, book.log) : ({ ok: true, entries: 0, headHash: null } as const)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    if (ledger.mode === 'euer') {
      const totals = euerTotals(ledger, year)
      const profit = euerProfit(year, deductibleByKeyInEuros(totals))
      return { mode: 'euer' as const, integrity, euer: { totals, profit }, bilanz: null }
    }
    const statement = incomeStatement(ledger, year)
    const sheet = ledgerCall(() => balanceSheet(ledger, year))
    const balances = ledgerCall(() => closingBalances(ledger, year))
    return { mode: 'bilanz' as const, integrity, euer: null, bilanz: { incomeStatement: statement, balanceSheet: sheet, closingBalances: balances, openingEntry: openingEntryDraft(ledger.chart, balances, year + 1) } }
  }

  /** Carries the closing balances into the next year's book as its Eröffnungsbilanz entry. */
  async carryForward(userId: string, year: number, ref: BusinessRef): Promise<JournalEntry> {
    const closing = await this.closing(userId, year, ref)
    if (closing.bilanz === null) throw new InvalidInputError('CARRY_FORWARD_BILANZ_ONLY', 'Eine Eröffnungsbilanz gibt es nur bei der Bilanz.')
    if (!closing.integrity.ok) throw new ConflictError('BOOK_INTEGRITY_BROKEN', closing.integrity.reason)
    const next = year + 1
    // The next year's own profile decides its frame; without one it continues this year's.
    const [nextFrame, thisFrame] = await Promise.all([this.context.frame(userId, next, ref), this.context.frame(userId, year, ref)])
    const profile = nextFrame.profile
    const frame = profile ? { chart: nextFrame.chart, mode: nextFrame.mode } : { chart: thisFrame.chart, mode: 'bilanz' as const }
    const entry = await this.repository.changeBook(userId, next, ref, frame, (book) => {
      if ([...book.sources.values()].includes('eb')) throw new ConflictError('OPENING_ENTRY_EXISTS', `Die Eröffnungsbilanz ${next} ist schon gebucht.`)
      const result = this.postAll(book, next, profile, [{ draft: closing.bilanz!.openingEntry, source: 'eb' }])
      return { result: result.posted[0]!, append: result.append }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry
  }

  // ------------------------------------------------------------------------------------------------
  // Firmenwagen (ADR-0101 §22)

  /** The private use of a business car: computed, nothing booked. A Kleinunternehmer owes no Wertabgabe. */
  async companyCar(userId: string, year: number, ref: BusinessRef, input: Omit<CompanyCarInput, 'year' | 'vatDeductible'>): Promise<CompanyCarResult> {
    await this.context.assertOpen(userId, year)
    const profile = await this.context.personRecord(userId, year, ref)
    return companyCarUse({ ...input, year, vatDeductible: !(profile?.smallBusiness ?? false) })
  }

  /**
   * Books the year's private use: the Entnahme (income tax value on the EÜR line, the VAT on its full
   * base through the 19 % account, the rest without VAT) and the non-deductible commute moved off the
   * car costs. Two entries dated 31.12., source `kfz`.
   */
  async bookCompanyCar(userId: string, year: number, ref: BusinessRef, input: Omit<CompanyCarInput, 'year' | 'vatDeductible'>): Promise<readonly JournalEntry[]> {
    const result = await this.companyCar(userId, year, ref, input)
    if (result.kind !== 'berechnet') throw new InvalidInputError('CAR_NOT_COMPUTABLE', result.kind === 'offen' ? 'Für das Fahrtenbuch fehlen Gesamtkosten oder Privatanteil.' : 'Die 1-%-Regel gilt nur bei mehr als 50 % betrieblicher Nutzung.')
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const n = (concept: Parameters<typeof accountFor>[1]) => accountFor(chart, concept).number
    const c = (eurAmount: number) => Math.round(eurAmount * 100)
    const drafts: { draft: BookingDraft; source: string }[] = []
    const use = c(result.privateUseEur)
    const base = c(result.vat?.baseEur ?? 0)
    const vat = c(result.vat?.vatEur ?? 0)
    if (use > 0 || base > 0) {
      const rest = use - base
      drafts.push({
        source: 'kfz',
        draft: {
          date: `${year}-12-31`,
          documentNumber: `Kfz-Privat-${year}`,
          text: `Private Kfz-Nutzung ${year} (${result.method === 'pauschal' ? '1-%-Regel' : 'Fahrtenbuch'})`,
          lines: [
            { account: n('private_withdrawals'), side: 'debit', amount: use + vat },
            ...(base > 0 ? [{ account: n('private_car_use_19'), side: 'credit' as const, amount: base, taxKey: 'ust19' as const, amountIs: 'net' as const }] : []),
            // An electric car: the VAT base above the income tax value; the difference comes back off the EÜR line.
            ...(rest > 0 ? [{ account: n('private_car_use_free'), side: 'credit' as const, amount: rest }] : rest < 0 ? [{ account: n('private_car_use_free'), side: 'debit' as const, amount: -rest }] : []),
          ],
        },
      })
    }
    const commute = c(result.commute?.nonDeductibleEur ?? 0)
    if (commute > 0) {
      drafts.push({
        source: 'kfz',
        draft: {
          date: `${year}-12-31`,
          documentNumber: `Kfz-Wege-${year}`,
          text: `Wege Wohnung–Betrieb ${year}, nicht abziehbarer Teil (§ 4 Abs. 5 Satz 1 Nr. 6 EStG)`,
          lines: [
            { account: n('commute_nondeductible'), side: 'debit', amount: commute },
            { account: n('vehicle_other'), side: 'credit', amount: commute },
          ],
        },
      })
    }
    const posted = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      const out = this.postAll(book, year, profile, drafts)
      return { result: out.posted, append: out.append }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return posted
  }

  // ------------------------------------------------------------------------------------------------
  // Umsatzsteuer (ADR-0101 §8)

  async vatReturn(
    userId: string,
    year: number,
    ref: BusinessRef,
  ): Promise<{ readonly figures: VatFigures; readonly result: VatAnnualResult; readonly cashAccountingAllowed: boolean; readonly smallBusiness: SmallBusinessCheck; readonly inputVatCorrections: readonly InputVatCorrectionLine[] }> {
    await this.context.assertOpen(userId, year)
    const [vat, prior] = await Promise.all([this.personVat(userId, year, ref.person), this.context.businessesOf(userId, year - 1, ref.person)])
    const { profile, startDate, freelanceOnly } = vat
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    const priorBooks = prior.filter((b) => b.book !== null)
    const priorTurnoverEur = priorBooks.length === 0 ? null : turnoverOf(vatFiguresOf(priorBooks.flatMap((b) => b.vatEntries), year - 1))
    // From 2025 the rule ends with the supply that passes the limit; the book's turnover per entry dates it.
    const supplies = vat.entries.filter((e) => Number(e.date.slice(0, 4)) === year).map((e) => ({ date: e.date, netEur: turnoverOf(vatFiguresOf([e], year)) }))
    const smallBusiness = smallBusinessCheckOf(year, profile === null ? null : { ...profile, startDate }, turnoverOf(vat.figures), priorTurnoverEur, supplies)
    // § 20 Satz 1 Nr. 1 UStG: the Gesamtumsatz of the year before; in the founding year the running one.
    const basis = priorTurnoverEur ?? turnoverOf(vat.figures)
    const facts = parseJson<VatPeriodFacts>(profile?.vatPeriodFacts ?? null, {})
    return { figures: vat.figures, result: vat.result, cashAccountingAllowed: cashAccountingAllowed(year, basis, freelanceOnly, facts.exemptFromBookkeeping === true), smallBusiness, inputVatCorrections: vat.corrections }
  }

  /**
   * The Voranmeldungen of the year (ADR-0101 §22, § 18 UStG): the period from the facts or the year
   * before, each period's Kennzahlen from all books of the person, the Sondervorauszahlung (§ 47 UStDV)
   * taken off in December, and the Zusammenfassende Meldungen (§ 18a UStG). Nothing is transmitted.
   */
  async vatPrepayments(userId: string, year: number, ref: BusinessRef): Promise<VatPrepaymentOverview> {
    await this.context.assertOpen(userId, year)
    const overview = await this.prepaymentsOf(userId, year, ref.person)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return overview
  }

  private async prepaymentsOf(userId: string, year: number, person: BusinessPerson, depth = 0): Promise<VatPrepaymentOverview> {
    const [businesses, prior] = await Promise.all([this.context.businessesOf(userId, year, person), this.context.businessesOf(userId, year - 1, person)])
    const profile = businesses.find((b) => b.ref.business === FIRST_BUSINESS)?.profile ?? businesses[0]?.profile ?? null
    const facts = parseJson<VatPeriodFacts>(profile?.vatPeriodFacts ?? null, {})
    const entries = businesses.flatMap((b) => b.vatEntries)
    const regime = profile?.smallBusiness ? 'klein' : 'regel'
    const starts = businesses.map((b) => b.profile?.startDate ?? null).filter((d): d is string => d !== null).sort((a, b) => a.localeCompare(b))
    const start = starts[0] ?? null
    const founding = start !== null && Number(start.slice(0, 4)) === year
    const priorEntries = prior.flatMap((b) => b.vatEntries)
    const priorVat = priorEntries.length === 0 ? null : this.vatOf({ chart: 'SKR03', mode: 'euer', entries: priorEntries, lockedThrough: null }, profile, year - 1).result.vatOfYearEur
    const priorMonths = start !== null && Number(start.slice(0, 4)) === year - 1 ? 12 - Number(start.slice(5, 7)) + 1 : 12
    // A founder's expected VAT: what is booked so far, over the months since the start (§ 18 Abs. 2 Satz 6 UStG).
    const lastMonth = Math.max(Number(start?.slice(5, 7) ?? 1), ...entries.filter((e) => e.date.startsWith(String(year))).map((e) => Number(e.date.slice(5, 7))))
    const monthsSoFar = Math.max(1, lastMonth - Number(start?.slice(5, 7) ?? 1) + 1)
    const derived = founding
      ? vatFilingPeriod({ year, founding: { expectedVatEur: (this.vatOf({ chart: 'SKR03', mode: 'euer', entries, lockedThrough: null }, profile, year).result.vatOfYearEur * 12) / monthsSoFar } })
      : vatFilingPeriod({ year, priorYearVatEur: priorVat ?? 0, priorYearMonthsActive: priorMonths, chooseMonthly: facts.chooseMonthly })
    const period = facts.period ?? derived.period
    const extension = facts.extension === true
    const priorProfile = prior.find((b) => b.ref.business === FIRST_BUSINESS)?.profile ?? null
    // The year before's own Voranmeldungen (one level back is enough for its Sondervorauszahlung).
    const specialPrepaymentBasis =
      period === 'monat' && extension && facts.specialPrepaymentEur === undefined && prior.length > 0 && depth === 0
        ? priorProfile?.vatPrepayments
          ? eur(Number(priorProfile.vatPrepayments))
          : await this.priorPrepaymentsTotal(userId, year - 1, person, depth + 1)
        : null
    // § 47 Abs. 1 UStDV: 1/11 of the sum of last year's Vorauszahlungen: as entered for that year, else its Voranmeldungen.
    const priorPrepaymentsEur = specialPrepaymentBasis ?? Math.max(0, priorVat ?? 0)
    const specialPrepaymentEur = period === 'monat' && extension ? (facts.specialPrepaymentEur ?? specialPrepayment({ priorYearPrepaymentsEur: priorPrepaymentsEur, priorYearMonthsActive: priorMonths })) : null
    const list = vatPeriodsOf(year, period, extension)
    const periods = list.map((p, index) => {
      const figures = vatFiguresOf(entries, year, p)
      const r = vatPeriodReturn({ figures, regime, year, ...(index === list.length - 1 && specialPrepaymentEur !== null ? { specialPrepaymentDeductionEur: specialPrepaymentEur } : {}) })
      return { ...p, kennzahlen: r.kennzahlen, vatDueEur: r.vatDueEur }
    })
    const totalEur = round2(periods.reduce((sum, p) => sum + p.vatDueEur, 0) + (specialPrepaymentEur ?? 0))
    return { period, periodSource: facts.period ? 'angabe' : derived.reason, extension, specialPrepaymentEur, periods, totalEur, ecSalesList: this.ecSalesListsOf(year, entries, priorEntries) }
  }

  /**
   * The year before's Vorauszahlungen as its Voranmeldungen give them; null when it had none in the app
   * (the year before that has no book, so its period reads „befreit“): then the annual VAT stands in.
   */
  private async priorPrepaymentsTotal(userId: string, year: number, person: BusinessPerson, depth: number): Promise<number | null> {
    const overview = await this.prepaymentsOf(userId, year, person, depth)
    return overview.periods.length > 0 ? overview.totalEur : null
  }

  /**
   * The Zusammenfassende Meldungen of the year (§ 18a UStG): per quarter; per month once the goods passed
   * 50.000 € in one of the four quarters before (Abs. 1 Satz 2). In the quarter they pass it, one ZM covers the
   * months up to that one, monthly after it (Satz 3). Due on the 25th.
   */
  private ecSalesListsOf(year: number, entries: readonly JournalEntry[], priorEntries: readonly JournalEntry[]): VatPrepaymentOverview['ecSalesList'] {
    const all = [...priorEntries, ...entries]
    const quarters = vatPeriodsOf(year, 'quartal', false)
    const months = vatPeriodsOf(year, 'monat', false)
    const goodsOf = (p: { from: string; to: string }) => ecSalesListOf(all, p).reduce((sum, r) => sum + r.goodsEur, 0)
    const byQuarter = [...vatPeriodsOf(year - 1, 'quartal', false), ...quarters].map(goodsOf)
    const due25 = (to: string) => {
      const y = Number(to.slice(0, 4))
      const m = Number(to.slice(5, 7))
      return m === 12 ? `${y + 1}-01-25` : `${y}-${String(m + 1).padStart(2, '0')}-25`
    }
    let monthly = false
    const periods = quarters.flatMap((q, i) => {
      const inQuarter = months.slice(i * 3, i * 3 + 3)
      const r = ecSalesListInQuarter({ goodsByMonthEur: inQuarter.map(goodsOf), fourQuartersBeforeEur: byQuarter.slice(i, i + 4) })
      if (r.period === 'quartal') return [q]
      monthly = true
      if (r.reason === 'vorquartale') return inQuarter
      const upTo = inQuarter[r.monthOfQuarter - 1]!
      const first = r.monthOfQuarter === 1 ? upTo : { ...upTo, label: `${inQuarter[0]!.label.slice(0, 2)}–${upTo.label}`, from: q.from }
      return [first, ...inQuarter.slice(r.monthOfQuarter)]
    })
    const reports = periods.map((p) => ({ label: p.label, due: due25(p.to), rows: ecSalesListOf(entries, p) })).filter((r) => r.rows.length > 0)
    return { period: monthly ? 'monat' : 'quartal', reports }
  }

  /**
   * The VAT of the person: one Unternehmer, one Unternehmen (§ 2 Abs. 1 Satz 2 UStG), so all his
   * businesses' journals together, with the person-wide facts of the first business. The business began
   * with the earliest start date of them; § 20 Nr. 3 holds when all are freelance.
   */
  private async personVat(
    userId: string,
    year: number,
    person: BusinessPerson,
  ): Promise<{
    figures: VatFigures
    result: VatAnnualResult
    profile: BusinessProfileRecord | null
    startDate: string | null
    freelanceOnly: boolean
    entries: readonly JournalEntry[]
    corrections: readonly InputVatCorrectionLine[]
  }> {
    const businesses = await this.context.businessesOf(userId, year, person)
    const profile = businesses.find((b) => b.ref.business === FIRST_BUSINESS)?.profile ?? businesses[0]?.profile ?? null
    const entries = businesses.flatMap((b) => b.vatEntries)
    const chart = businesses[0]?.ledger.chart ?? 'SKR03'
    const derivedPrepayments = profile?.vatPrepayments ? null : (await this.prepaymentsOf(userId, year, person)).totalEur
    // § 15a UStG: the corrections of the year over all assets of the person's businesses.
    const assets = (await Promise.all(businesses.map((b) => this.repository.listAssets(userId, b.ref, year)))).flat()
    const corrections = assets.flatMap((a) => {
      const row = vatCorrectionOf(a).find((r) => r.year === year)
      return row && row.correctionEur !== 0 ? [{ assetId: a.id, label: a.label, correctionEur: row.correctionEur, inPrepayment: row.inPrepayment }] : []
    })
    const correctionEur = round2(corrections.reduce((s, c) => s + c.correctionEur, 0))
    const { figures, result } = this.vatOf({ chart, mode: 'euer', entries, lockedThrough: null }, profile, year, derivedPrepayments, correctionEur)
    const starts = businesses.map((b) => b.profile?.startDate ?? null).filter((d): d is string => d !== null).sort((a, b) => a.localeCompare(b))
    const freelanceOnly = businesses.length > 0 && businesses.every((b) => b.profile?.kind === 'freiberuf')
    return { figures, result, profile, startDate: starts[0] ?? null, freelanceOnly, entries, corrections }
  }

  /** `derivedPrepaymentsEur`: the Voranmeldungen's total, used when the user entered no sum of his own. */
  private vatOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number, derivedPrepaymentsEur: number | null = null, inputVatCorrectionEur = 0): { figures: VatFigures; result: VatAnnualResult } {
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
      prepaymentsEur: profile?.vatPrepayments ? eur(Number(profile.vatPrepayments)) : (derivedPrepaymentsEur ?? 0),
      inputVatCorrectionEur,
    })
    return { figures, result }
  }

  // ------------------------------------------------------------------------------------------------
  // Gewerbesteuer (ADR-0101 §9)

  lookupHebesatz(year: number, name: string, land?: string): HebesatzLookup {
    return this.hebesaetze.lookup(year, name, land)
  }

  /** The multiplier: the user's correction first, then the table by AGS; null when neither is there. */
  private multiplierOf(profile: BusinessProfileRecord | null, year: number): AppliedMultiplier | null {
    if (profile?.multiplierOverride) return { percent: Number(profile.multiplierOverride), source: 'korrektur', tableYear: null, note: null }
    if (!profile?.municipalityAgs) return null
    const found = this.hebesaetze.byAgs(year, profile.municipalityAgs)
    return found ? { percent: found.municipality.multiplierPercent, source: 'tabelle', tableYear: found.tableYear, note: found.note } : null
  }

  private tradeTaxOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number): { status: 'berechnet'; result: TradeTaxReturn; multiplier: AppliedMultiplier; profitEur: number } | { status: 'offen'; missing: string[] } | { status: 'entfaellt'; reason: string } {
    if (profile?.kind !== 'gewerbe') return { status: 'entfaellt', reason: 'Freiberufler zahlen keine Gewerbesteuer.' }
    const multiplier = this.multiplierOf(profile, year)
    if (multiplier === null) return { status: 'offen', missing: ['hebesatz'] }
    const inputs = parseJson<TradeTaxInputs>(profile.tradeTaxInputs, {})
    const result = tradeTaxReturn({
      year,
      profitEur: profitOf(ledger, year),
      financing: inputs.financing,
      otherAdditionsEur: inputs.otherAdditionsEur,
      landDeductionEur: landDeduction(year, { einheitswertEur: inputs.einheitswertEur }),
      otherDeductionsEur: inputs.otherDeductionsEur,
      lossCarriedForwardEur: inputs.lossCarriedForwardEur,
      multiplierPercent: multiplier.percent,
    })
    return { status: 'berechnet', result, multiplier, profitEur: profitOf(ledger, year) }
  }

  async tradeTax(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const { ledger, profile } = await this.context.loaded(userId, year, ref)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.tradeTaxOf(ledger, profile, year)
  }

  // ------------------------------------------------------------------------------------------------
  // Verluste (ADR-0101 §10)

  async losses(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const { ledger, profile } = await this.context.loaded(userId, year, ref)
    const facts = parseJson<LossFacts>(profile?.lossFacts ?? null, {})
    const profitEur = profitOf(ledger, year)
    const year_ = applyLosses({ year, joint: false, gdeEur: profitEur, carriedForwardEur: facts.carriedForwardEur ?? 0, carriedBackEur: facts.carriedBackEur })
    const carryBack = year_.newLossEur > 0 ? carryBackLoss({ lossYear: year, lossEur: year_.newLossEur, joint: false, roomEur: facts.roomEur ?? [0, 0], waive: facts.waiveCarryBack === true }) : null
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return { facts, rules: lossRules(year, false), businessProfitEur: profitEur, year: year_, carryBack }
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

  // ------------------------------------------------------------------------------------------------
  // For the estimate and the owl

  /**
   * The person's Gewinneinkünfte for the core estimate (ADR-0101): Anlage S, Anlage G, § 35 inputs, summed
   * over all his businesses (§ 22). Each Gewerbebetrieb has its own Messbetrag; § 35 takes them together.
   */
  async estimateInput(userId: string, year: number, person: BusinessPerson): Promise<{ business: BusinessIncome; losses: { carriedForwardEur: number; carriedBackEur?: number } } | null> {
    if (!selfEmploymentEnabled()) return null
    const businesses = await this.context.businessesOf(userId, year, person)
    if (businesses.length === 0) return null
    let selfEmployedEur = 0
    let tradeEur = 0
    const tradeTax: { baseAmountEur: number; tradeTaxEur: number }[] = []
    let tradeWithoutTradeTaxEur = 0
    const gains: { gainEur: number; method: 'fuenftel' | 'ermaessigt' }[] = []
    const retained: { favouredEur: number; taxEur: number; recaptureEur: number }[] = []
    for (const { book, ledger, profile } of businesses) {
      const own = book === null ? 0 : profitOf(ledger, year)
      if (profile?.kind === 'gewerbe') tradeEur += own
      else selfEmployedEur += own
      const trade = this.tradeTaxOf(ledger, profile, year)
      if (trade.status === 'berechnet') tradeTax.push({ baseAmountEur: trade.result.baseAmountEur, tradeTaxEur: trade.result.tradeTaxEur })
      // § 16: the gain beside the current profit; a sole trader's bears no trade tax (§ 7 Satz 2 GewStG e contrario, R 7.1 Abs. 3 GewStR).
      const special = this.specialOf(ledger, profile, year, trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0)
      if (special.disposal !== null && special.disposal.taxableGainEur > 0) {
        if (profile?.kind === 'gewerbe') {
          tradeEur += special.disposal.taxableGainEur
          tradeWithoutTradeTaxEur += special.disposal.taxableGainEur
        } else selfEmployedEur += special.disposal.taxableGainEur
        if (special.disposal.method !== 'keine') gains.push({ gainEur: special.disposal.taxableGainEur, method: special.disposal.method })
      }
      if (special.retained !== null && special.retained !== 'nur_bilanz') retained.push(special.retained)
    }
    const first = businesses.find((b) => b.ref.business === FIRST_BUSINESS)?.profile ?? null
    const shares = parseJson<PartnershipShare[]>(first?.partnershipShares ?? null, [])
    selfEmployedEur += shares.filter((s) => s.kind === 'freiberuf').reduce((sum, s) => sum + s.profitEur, 0)
    tradeEur += shares.filter((s) => s.kind === 'gewerbe').reduce((sum, s) => sum + s.profitEur, 0)
    tradeTax.push(...shares.filter((s) => s.kind === 'gewerbe' && s.baseAmountEur !== undefined).map((s) => ({ baseAmountEur: s.baseAmountEur!, tradeTaxEur: s.tradeTaxEur ?? 0 })))
    const facts = parseJson<LossFacts>(first?.lossFacts ?? null, {})
    const specialFacts = {
      ...(gains.length > 0 ? { extraordinary: extraordinaryOf(gains) } : {}),
      ...(retained.length > 0 ? { retained: { favouredEur: round2(retained.reduce((s, r) => s + r.favouredEur, 0)), taxEur: round2(retained.reduce((s, r) => s + r.taxEur, 0)), recaptureEur: round2(retained.reduce((s, r) => s + r.recaptureEur, 0)) } } : {}),
    }
    return {
      business: {
        selfEmployedEur: round2(selfEmployedEur),
        tradeEur: round2(tradeEur),
        tradeTax,
        ...(tradeWithoutTradeTaxEur > 0 ? { tradeWithoutTradeTaxEur: round2(tradeWithoutTradeTaxEur) } : {}),
        ...(Object.keys(specialFacts).length > 0 ? { special: specialFacts } : {}),
      },
      losses: { carriedForwardEur: facts.carriedForwardEur ?? 0, ...(facts.carriedBackEur !== undefined ? { carriedBackEur: facts.carriedBackEur } : {}) },
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Lohn (ADR-0101 §22)

  /**
   * Books one payroll run and keeps it for the Lohnsteuer-Anmeldung. A regular employee's amounts come
   * from the outside payroll; a Minijob's charges the core computes. Dated the last day of the month.
   */
  async addPayrollRun(userId: string, year: number, ref: BusinessRef, input: PayrollRunInput) {
    await this.context.assertOpen(userId, year)
    if (!(input.month >= 1 && input.month <= 12)) throw new InvalidInputError('PAYROLL_MONTH', 'Der Monat ist 1 bis 12.')
    const mini = input.kind === 'minijob' ? minijobCharges({ year, month: input.month, grossEur: input.grossEur, statutoryHealthInsured: input.statutoryHealthInsured !== false, rvExempt: input.rvExempt === true, u1Applies: input.u1Applies !== false }) : null
    const flat = mini ? { flatWageTaxEur: 0, flat37bTaxEur: 0, flatChurchTaxEur: 0 } : { flatWageTaxEur: input.flatWageTaxEur ?? 0, flat37bTaxEur: input.flat37bTaxEur ?? 0, flatChurchTaxEur: input.flatChurchTaxEur ?? 0 }
    const bavSupportEur = mini ? 0 : (input.bavSupportEur ?? 0)
    if (bavSupportEur > 0) {
      const earlier = (await this.repository.listPayrollRuns(userId, year, ref))
        .filter((r) => r.employee === input.employee)
        .reduce((s, r) => s + (parseJson<{ bavSupportEur?: number }>(r.amounts, {}).bavSupportEur ?? 0), 0)
      if (earlier + bavSupportEur > BAV_SUPPORT_MAX_EUR) throw new InvalidInputError('PAYROLL_BAV_SUPPORT', `Der Förderbetrag ist höchstens ${BAV_SUPPORT_MAX_EUR} € im Jahr je Arbeitnehmer (§ 100 Abs. 2 EStG).`)
    }
    if (mini?.overLimit) throw new InvalidInputError('PAYROLL_MINIJOB_OVER_LIMIT', `Über ${minijobLimitEur(year, input.month)} € im Monat ist es kein Minijob; trag die Werte aus der Lohnabrechnung ein.`)
    const amounts = {
      kind: input.kind,
      grossEur: input.grossEur,
      wageTaxEur: mini ? 0 : (input.wageTaxEur ?? 0),
      soliEur: mini ? 0 : (input.soliEur ?? 0),
      churchTaxEur: mini ? 0 : (input.churchTaxEur ?? 0),
      employeeSocialEur: mini ? mini.employeeRvEur : (input.employeeSocialEur ?? 0),
      employerSocialEur: mini ? mini.employerTotalEur : (input.employerSocialEur ?? 0),
      employerFlatTaxEur: round2(flat.flatWageTaxEur + flat.flat37bTaxEur + flat.flatChurchTaxEur),
    }
    const lines = payrollEntryLines(amounts)
    if (!lines.ok) throw new InvalidInputError('PAYROLL_AMOUNTS', lines.reason)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const n = (concept: Parameters<typeof accountFor>[1]) => accountFor(chart, concept).number
    const c = (v: number) => Math.round(v * 100)
    const day = new Date(Date.UTC(year, input.month, 0)).getUTCDate()
    const l = lines.lines
    const draft: BookingDraft = {
      date: `${year}-${String(input.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      documentNumber: `Lohn-${year}-${String(input.month).padStart(2, '0')}-${input.employee.slice(0, 20)}`,
      text: `${input.kind === 'minijob' ? 'Minijob' : 'Lohn'} ${input.employee} ${String(input.month).padStart(2, '0')}/${year}`,
      lines: [
        { account: n(input.kind === 'minijob' ? 'temp_wages' : 'wages'), side: 'debit', amount: c(l.wagesEur) },
        ...(l.employerSocialEur > 0 ? [{ account: n('social_security'), side: 'debit' as const, amount: c(l.employerSocialEur) }] : []),
        // The pauschale Lohn- and Kirchensteuer is the employer's own Personalaufwand (DATEV 4198 / 6039).
        ...(l.employerFlatTaxEur > 0 ? [{ account: n('flat_wage_tax'), side: 'debit' as const, amount: c(l.employerFlatTaxEur) }] : []),
        ...(l.netEur > 0 ? [{ account: n('bank'), side: 'credit' as const, amount: c(l.netEur) }] : []),
        ...(l.taxesEur > 0 ? [{ account: n('wage_tax_payables'), side: 'credit' as const, amount: c(l.taxesEur) }] : []),
        ...(l.socialPayableEur > 0 ? [{ account: n('social_security_payables'), side: 'credit' as const, amount: c(l.socialPayableEur) }] : []),
      ],
    }
    const [entry] = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      const out = this.postAll(book, year, profile, [{ draft, source: 'lohn' }])
      return { result: out.posted, append: out.append }
    })
    const run = await this.repository.addPayrollRun(userId, {
      taxYear: year,
      person: ref.person,
      business: ref.business,
      month: input.month,
      kind: input.kind,
      employee: input.employee,
      amounts: JSON.stringify({ ...amounts, ...flat, bavSupportEur, church: input.church ?? null, netEur: l.netEur }),
      entryNumber: entry?.number ?? null,
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return { run, entry }
  }

  /** The runs of the year, the Lohnsteuer-Anmeldungen (§ 41a EStG) and the Minijob charges per month. */
  async payroll(userId: string, year: number, ref: BusinessRef): Promise<PayrollOverview> {
    await this.context.assertOpen(userId, year)
    const [records, prior, profile] = await Promise.all([this.repository.listPayrollRuns(userId, year, ref), this.repository.listPayrollRuns(userId, year - 1, ref), this.context.personRecord(userId, year, ref)])
    const state = federalStateOfAgs(profile?.municipalityAgs)
    type Stored = {
      kind: 'regulaer' | 'minijob'
      grossEur: number
      wageTaxEur: number
      soliEur: number
      churchTaxEur: number
      employerSocialEur: number
      church: ChurchCode | null
      netEur: number
      flatWageTaxEur?: number
      flat37bTaxEur?: number
      flatChurchTaxEur?: number
      bavSupportEur?: number
    }
    const parse = (r: { amounts: string }) => parseJson<Stored>(r.amounts, { kind: 'regulaer', grossEur: 0, wageTaxEur: 0, soliEur: 0, churchTaxEur: 0, employerSocialEur: 0, church: null, netEur: 0 })
    const runs = records.map((r) => ({ record: r, a: parse(r) }))
    // § 41a Abs. 2: by last year's wage tax (a part year annualised, Satz 3); a Betriebsstätte without runs last
    // year takes its first booked month as the first full month × 12 (Satz 4).
    const priorTax = prior.reduce((s, r) => s + parse(r).wageTaxEur, 0)
    const firstMonth = runs.filter((r) => r.a.kind === 'regulaer').map((r) => r.record.month).sort((a, b) => a - b)[0]
    const wageTaxPeriod =
      prior.length > 0
        ? wageTaxFilingPeriod({ priorYearWageTaxEur: priorTax, priorYearMonthsActive: 12 - Math.min(...prior.map((r) => r.month)) + 1 })
        : firstMonth === undefined
          ? 'jahr'
          : wageTaxFilingPeriod({ priorYearWageTaxEur: 0, newEstablishment: { firstFullMonthWageTaxEur: runs.filter((r) => r.record.month === firstMonth).reduce((s, r) => s + r.a.wageTaxEur, 0) } })
    const step = wageTaxPeriod === 'monat' ? 1 : wageTaxPeriod === 'quartal' ? 3 : 12
    const wageTaxReturns = []
    for (let start = 1; start <= 12; start += step) {
      const end = start + step - 1
      const inPeriod = runs.filter((r) => r.record.month >= start && r.record.month <= end)
      if (inPeriod.length === 0) continue
      const kennzahlen = wageTaxReturn(
        inPeriod.map((r) => ({
          kind: r.a.kind,
          employee: r.record.employee,
          wageTaxEur: r.a.wageTaxEur,
          soliEur: r.a.soliEur,
          churchTaxEur: r.a.churchTaxEur,
          church: r.a.church,
          flatWageTaxEur: r.a.flatWageTaxEur,
          flat37bTaxEur: r.a.flat37bTaxEur,
          flatChurchTaxEur: r.a.flatChurchTaxEur,
          bavSupportEur: r.a.bavSupportEur,
        })),
        state,
      )
      if (Object.keys(kennzahlen).length === 0) continue
      const label = step === 1 ? `${String(start).padStart(2, '0')}/${year}` : step === 3 ? `Q${(start + 2) / 3}/${year}` : String(year)
      const dueMonth = end + 1
      const due = dueMonth > 12 ? `${year + 1}-01-10` : `${year}-${String(dueMonth).padStart(2, '0')}-10`
      wageTaxReturns.push({ label, due, kennzahlen })
    }
    const minijob = new Map<number, number>()
    for (const r of runs) if (r.a.kind === 'minijob') minijob.set(r.record.month, round2((minijob.get(r.record.month) ?? 0) + r.a.employerSocialEur + (r.a.grossEur - r.a.netEur)))
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return {
      runs: runs.map(({ record, a }) => ({ id: record.id, month: record.month, kind: a.kind, employee: record.employee, grossEur: a.grossEur, netEur: a.netEur, wageTaxEur: a.wageTaxEur, employerChargesEur: a.employerSocialEur, entryNumber: record.entryNumber })),
      wageTaxPeriod,
      wageTaxReturns,
      minijobCharges: [...minijob.entries()].sort((a, b) => a[0] - b[0]).map(([month, totalEur]) => ({ month, totalEur })),
      unassignedChurchCodes: [...new Set(runs.flatMap((r) => (r.a.kind === 'regulaer' && r.a.church && churchKennzahl(state, r.a.church) === null ? [r.a.church] : [])))].sort((a, b) => a.localeCompare(b)),
    }
  }

  /** § 16 / § 34 and § 34a of one business as the profile and the book say (ADR-0101 §22). */
  async specialTariffs(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const { ledger, profile } = await this.context.loaded(userId, year, ref)
    const trade = this.tradeTaxOf(ledger, profile, year)
    const result = this.specialOf(ledger, profile, year, trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return result
  }

  private specialOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number, tradeTaxEur: number) {
    const disposalFacts = parseJson<DisposalFacts | null>(profile?.disposalFacts ?? null, null)
    const disposal = disposalFacts !== null && Number(disposalFacts.date.slice(0, 4)) === year ? { ...disposalGain(disposalFacts), method: disposalFacts.method } : null
    const retainedFacts = parseJson<RetainedFacts | null>(profile?.retainedFacts ?? null, null)
    let retained: RetainedProfit | 'nur_bilanz' | null = null
    if (retainedFacts !== null) {
      if (ledger.mode !== 'bilanz') retained = 'nur_bilanz'
      else {
        // § 34a Abs. 2: the balance of withdrawals and deposits, read off the private accounts of the book.
        const balance = privateBalanceEur(ledger, year)
        retained = retainedProfitTax({
          year,
          profitEur: profitOf(ledger, year),
          withdrawalsEur: Math.max(0, balance),
          depositsEur: Math.max(0, -balance),
          tradeTaxEur,
          requestedEur: retainedFacts.requestedEur,
          carriedForwardEur: retainedFacts.carriedForwardEur ?? 0,
          withdrawalsForRetainedTaxEur: retainedFacts.withdrawalsForRetainedTaxEur,
          disposal: disposal !== null,
        })
        // § 34a Abs. 1 Satz 1 excludes only the disposal gain that uses § 16 Abs. 4 or § 34 Abs. 3 ("soweit"); it is
        // taxed apart from the book's profit, so the running profit may still be retained. The sale recaptures the
        // carried amount (Abs. 6 Nr. 1).
      }
    }
    return { disposal, retained }
  }

  /** A few figures for the owl's case digest; null without a business. All businesses of Person A together. */
  async digest(userId: string, year: number): Promise<{ profitSoFarEur: number; vatBalanceEur: number | null; openBankItems: number; mode: BookkeepingMode; kind: string | null } | null> {
    if (!selfEmploymentEnabled()) return null
    const businesses = await this.context.businessesOf(userId, year, 'A')
    if (businesses.length === 0) return null
    const banks = await Promise.all(businesses.map((b) => this.repository.listBankTransactions(userId, year, b.ref)))
    const first = businesses[0]!
    const vat = await this.personVat(userId, year, 'A')
    return {
      profitSoFarEur: round2(businesses.reduce((sum, b) => sum + (b.book === null ? 0 : profitOf(b.ledger, year)), 0)),
      vatBalanceEur: first.profile?.smallBusiness ? null : vat.result.balanceEur,
      openBankItems: banks.flat().filter((t) => t.status === 'offen').length,
      mode: first.ledger.mode,
      kind: first.profile?.kind ?? null,
    }
  }

  /** The book frame and profile facts a booking draft is checked against (owl, receipts). */
  async bookingTarget(userId: string, year: number, ref: BusinessRef) {
    const { ledger, profile } = await this.context.loaded(userId, year, ref)
    return { chart: ledger.chart, mode: ledger.mode, year, lockedThrough: ledger.lockedThrough, smallBusiness: profile?.smallBusiness ?? false }
  }

  // ------------------------------------------------------------------------------------------------
  // ELSTER fill-in help (ADR-0101 §16)

  /** The gate of the whole fill-in help: the path open, a year the help knows, the tier paid. */
  async assertElsterOpen(userId: string, year: number): Promise<void> {
    await this.context.assertOpen(userId, year)
    if (!(ELSTER_YEARS as readonly number[]).includes(year)) throw new NotFoundError('ELSTER_YEAR_UNKNOWN', `Für ${year} gibt es keine Ausfüllhilfe.`)
    await this.context.assertUnlocked(userId, year)
  }

  /** The business forms of the fill-in help that carry at least one value the app computed. */
  async elsterFormsWithValues(userId: string, year: number, ref: BusinessRef): Promise<ElsterForm[]> {
    await this.assertElsterOpen(userId, year)
    const context = await this.elsterContext(userId, year, ref)
    return ELSTER_FORMS.filter((form) => {
      const { ledger, profile, personProfitEur } = PERSON_FORMS.has(form) ? context.person : context.own
      const values = this.formValues(form, ledger, profile, year, personProfitEur)
      const lines = elsterLinesFor(form, year as ElsterYear)
      return lines.status === 'published' ? lines.lines.some((line) => values.byLine(line.id, line.euerKeys) !== null) : values.unnumbered.some((line) => line.value !== null)
    })
  }

  async elsterHelp(userId: string, year: number, ref: BusinessRef, form: string): Promise<ElsterHelp> {
    await this.context.assertOpen(userId, year)
    if (!(ELSTER_FORMS as readonly string[]).includes(form)) throw new NotFoundError('ELSTER_FORM_UNKNOWN', `Das Formular „${form}“ kennt die Ausfüllhilfe nicht.`)
    await this.assertElsterOpen(userId, year)
    const context = await this.elsterContext(userId, year, ref)
    const { ledger, profile, personProfitEur } = PERSON_FORMS.has(form as ElsterForm) ? context.person : context.own
    const values = this.formValues(form as ElsterForm, ledger, profile, year, personProfitEur)
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
        lines: lines.lines.map((line) => ({ id: line.id, zeile: line.zeile, kennzahlen: line.kennzahlen, label: line.label, column: null, value: values.byLine(line.id, line.euerKeys) })),
      }
    }
    // An electronic-only form needs no note of its own: `lineNumbersAvailable: false` already tells the app to say so once.
    const note =
      lines.status === 'not_published'
        ? `Das Formular ${form} für ${year} ist noch nicht veröffentlicht${lines.latestPublishedYear ? ` (zuletzt ${lines.latestPublishedYear})` : ''}. Die App nennt die Beträge, aber keine Zeilen, bis es erscheint.`
        : null
    return { form: form as ElsterForm, year, status: lines.status, note, sourceUrl: null, lineNumbersAvailable: false, lines: values.unnumbered }
  }

  /**
   * The data a form is filled from (ADR-0101 §22): the business's own book for the EÜR, Anlage S/G and
   * the Gewerbesteuer; the person's businesses together for the VAT return and the § 10d lines.
   */
  private async elsterContext(userId: string, year: number, ref: BusinessRef) {
    const [own, businesses] = await Promise.all([this.context.loaded(userId, year, ref), this.context.businessesOf(userId, year, ref.person)])
    for (const b of businesses) if (b.book) this.assertIntact(b.book)
    const first = businesses.find((b) => b.ref.business === FIRST_BUSINESS)?.profile ?? own.profile
    const merged: Ledger = { chart: own.ledger.chart, mode: 'euer', entries: businesses.flatMap((b) => b.vatEntries), lockedThrough: null }
    const personProfitEur = round2(businesses.reduce((sum, b) => sum + (b.book === null ? 0 : profitOf(b.ledger, year)), 0))
    return {
      own: { ledger: own.ledger, profile: ref.business === FIRST_BUSINESS ? own.profile : own.profile === null ? null : { ...own.profile, ...personWideOf(first) }, personProfitEur: null },
      person: { ledger: merged, profile: first, personProfitEur },
    }
  }

  /** What the app computed for a form: by line id (published forms) and as labelled amounts (others). */
  private formValues(
    form: ElsterForm,
    ledger: Ledger,
    profile: BusinessProfileRecord | null,
    year: number,
    personProfitEur: number | null = null,
  ): { byLine: (id: string, euerKeys: readonly EuerKey[]) => number | string | null; unnumbered: ElsterLineValue[] } {
    const profit = personProfitEur ?? profitOf(ledger, year)
    const unnumbered = (rows: readonly [string, string, number | string | null][]): ElsterLineValue[] => rows.map(([id, label, value]) => ({ id, zeile: null, kennzahlen: [], label, column: null, value }))
    switch (form) {
      case 'anlage-euer': {
        if (ledger.mode !== 'euer') return { byLine: () => null, unnumbered: [] }
        const result = euerProfit(year, deductibleByKeyInEuros(euerTotals(ledger, year)))
        const counted = new Map<EuerKey, number>()
        for (const line of result.lines) counted.set(line.key, (counted.get(line.key) ?? 0) + line.amountEur)
        return {
          byLine: (_id, keys) => (keys.length === 0 ? null : keys.some((k) => counted.has(k)) ? round2(keys.reduce((sum, k) => sum + (counted.get(k) ?? 0), 0)) : null),
          unnumbered: unnumbered([...counted.entries()].map(([key, amount]) => [`euer.${key}`, key, round2(amount)])),
        }
      }
      case 'ust-2-a': {
        const { figures, result } = this.vatOf(ledger, profile, year)
        // Each kind of input tax on its own line: invoices, EU acquisitions, § 13b (§ 15 Abs. 1 Satz 1 Nr. 1, 3, 4 UStG).
        const deducts = !profile?.smallBusiness
        const igTax = round2((figures.intraEuAcquisitionNetEur.standard ?? 0) * 0.19 + (figures.intraEuAcquisitionNetEur.reduced ?? 0) * 0.07)
        const rc13bTax = round2(result.reverseChargeVatEur - igTax)
        const byId: Record<string, number | null> = {
          'ust.umsatz-19': figures.taxableNetEur.standard ?? 0,
          'ust.umsatz-7': figures.taxableNetEur.reduced ?? 0,
          'ust.steuerfrei-ig-lieferung': figures.taxFreeWithDeductionEur || null,
          'ust.steuerfrei-ohne-vorsteuerabzug-4': figures.taxFreeWithoutDeductionEur || null,
          'ust.13b-leistungen-eu': figures.reverseChargeEuServicesNetEur || null,
          'ust.13b-andere-leistungen': figures.reverseChargeOtherNetEur || null,
          'ust.berechnung-steuer-13b': rc13bTax || null,
          'ust.vorsteuer-rechnungen': deducts ? figures.inputVatEur : 0,
          'ust.vorsteuer-ig-erwerb': deducts && igTax !== 0 ? igTax : null,
          'ust.vorsteuer-13b': deducts && rc13bTax !== 0 ? rc13bTax : null,
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
        const disposal = this.specialOf(ledger, profile, year, trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0).disposal
        const rows: [string, string, number | string | null][] = [
          [isTrade ? 'anlage-g.gewinn' : 'anlage-s.gewinn', isTrade ? 'Gewinn aus Gewerbebetrieb' : 'Gewinn aus freiberuflicher Tätigkeit', profit],
          ...(disposal !== null && disposal.taxableGainEur > 0 ? ([[isTrade ? 'anlage-g.veraeusserungsgewinn' : 'anlage-s.veraeusserungsgewinn', 'Veräußerungs- oder Aufgabegewinn (§ 16 EStG) nach Freibetrag', disposal.taxableGainEur]] as [string, string, number][]) : []),
          ...(isTrade && trade.status === 'berechnet'
            ? ([
                ['anlage-g.messbetrag', 'Gewerbesteuer-Messbetrag (§ 35 EStG)', trade.result.baseAmountEur],
                ['anlage-g.gewerbesteuer', 'Tatsächlich zu zahlende Gewerbesteuer (§ 35 EStG)', trade.result.tradeTaxEur],
              ] as [string, string, number][])
            : []),
        ]
        // With lines read off Mein ELSTER (ADR-0101 §22) each value has its place; otherwise the amounts stand alone.
        const byId = new Map(rows.map(([id, , v]) => [id, v]))
        return { byLine: (id) => byId.get(id) ?? null, unnumbered: unnumbered(rows) }
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
  async gobdExport(userId: string, year: number, ref: BusinessRef): Promise<Buffer> {
    await this.context.assertOpen(userId, year)
    await this.context.assertUnlocked(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const files = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      this.assertIntact(book)
      const meta = { supplierName: profile?.name ?? 'Einzelunternehmen', supplierLocation: 'Deutschland', from: `${year}-01-01`, to: `${year}-12-31` }
      const log = appendLogRecord(book.log, 'export', { kind: 'gdpdu', from: meta.from, to: meta.to }, this.context.now())
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

  async procedureDoc(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
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

  async saveProcedureDoc(userId: string, year: number, ref: BusinessRef, values: Partial<Record<VerfahrensdokuPlaceholder, string>>) {
    await this.context.assertOpen(userId, year)
    await this.repository.saveProfile(userId, year, ref, { procedureDoc: JSON.stringify(values) })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.procedureDoc(userId, year, ref)
  }

  /** The E-Bilanz as XBRL, not transmitted (ADR-0101 §17); `download` is gated by the tier. */
  async eBilanz(userId: string, year: number, ref: BusinessRef, download: boolean): Promise<{ xbrl: string; transmitted: false; transmissionReady: boolean; note: string }> {
    await this.context.assertOpen(userId, year)
    if (download) await this.context.assertUnlocked(userId, year)
    const { book, ledger, profile } = await this.context.loaded(userId, year, ref)
    if (ledger.mode !== 'bilanz') throw new InvalidInputError('E_BILANZ_BILANZ_ONLY', 'Eine E-Bilanz gibt es nur bei der Bilanz.')
    if (book) this.assertIntact(book)
    const doc = parseJson<Partial<Record<VerfahrensdokuPlaceholder, string>>>(profile?.procedureDoc ?? null, {})
    const steuernummer = (doc.steuernummer ?? '').replaceAll(/\D/g, '')
    const assets = (await this.repository.listAssets(userId, ref, year)).map((r) => registerAssetOf(r, year))
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
    const ready = missingForTransmission(elsterTransmissionConfig()).length === 0
    return {
      xbrl,
      transmitted: false,
      transmissionReady: ready,
      note: ready
        ? 'Der Datensatz kann geprüft und an ELSTER übermittelt werden.'
        : 'Die Übermittlung an ELSTER ist auf diesem Server noch nicht eingerichtet (ERiC und Zertifikat des Betreibers fehlen). Bis dahin ist dies eine Vorschau des Datensatzes; die Elementnamen folgen der amtlichen Taxonomie, geprüft hat ihn ERiC noch nicht.',
    }
  }

  /**
   * Validates or sends the E-Bilanz through the operator's ERiC sidecar (ADR-0101 §17, §22). The paid
   * tier is needed for both; sending writes an export record into the book's log.
   */
  async transmitEBilanz(userId: string, year: number, ref: BusinessRef, mode: TransmissionMode): Promise<TransmissionResult> {
    await this.context.assertUnlocked(userId, year)
    const { xbrl } = await this.eBilanz(userId, year, ref, true)
    if (mode === 'validieren') {
      const result = await transmitEBilanz(xbrl, mode)
      await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig-elster' })
      return result
    }
    // Sending runs under the book's lock: two requests cannot both send; the ticket goes into the log.
    const { chart, mode: bookMode } = await this.context.frame(userId, year, ref)
    const result = await this.repository.changeBook<TransmissionResult>(userId, year, ref, { chart, mode: bookMode }, async (book) => {
      this.assertIntact(book)
      if (book.log.some((r) => r.kind === 'export' && (r.payload as { kind?: string } | null)?.kind === 'e-bilanz')) {
        throw new ConflictError('E_BILANZ_ALREADY_SENT', 'Die E-Bilanz für dieses Jahr ist schon übermittelt; eine Berichtigung macht die App nicht.')
      }
      const sent = await transmitEBilanz(xbrl, 'senden')
      if (sent.status !== 'ok') return { result: sent, append: {} }
      const log = appendLogRecord(book.log, 'export', { kind: 'e-bilanz', ticket: sent.ticket }, this.context.now())
      return { result: sent, append: { log: log.slice(book.log.length) } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig-elster' })
    return result
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
