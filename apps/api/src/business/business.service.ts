import { Inject, Injectable } from '@nestjs/common'
import {
  disposalGain,
  retainedProfitTax,
  type RetainedProfit,
  ecSalesListInQuarter,
  specialPrepayment,
  vatFilingPeriod,
  vatPeriodReturn,
  vatPeriodsOf,
  applyLosses,
  balanceSheet,
  carryBackLoss,
  closingBalances,
  elsterLinesFor,
  ELSTER_FORMS,
  ELSTER_YEARS,
  euerProfit,
  euerTotals,
  incomeStatement,
  lossRules,
  openingEntryDraft,
  suggestProfessionKind,
  tradeTaxReturn,
  landDeduction,
  vatAnnualReturn,
  cashAccountingAllowed,
  type BusinessIncome,
  type BookkeepingMode,
  type ElsterForm,
  type ElsterYear,
  type EuerKey,
  type JournalEntry,
  type Ledger,
  type ProfessionAnswers,
  type ProfessionSuggestion,
  type TradeTaxReturn,
  type VatAnnualResult,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { selfEmploymentEnabled } from '../config/self-employment.js'
import {
  BUSINESS_REPOSITORY,
  type BusinessPerson,
  type BusinessRef,
  FIRST_BUSINESS,
  firstBusinessOf,
  type BusinessProfilePatch,
  type BusinessProfileRecord,
  type BusinessRepository,
} from './business.repository.js'
import { bookIntegrity, deductibleByKeyInEuros, ecSalesListOf, eur, vatCorrectionOf, vatFiguresOf, type VatFigures } from './business-ledger.js'
import { HebesatzDirectory, type HebesatzLookup } from './hebesatz.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { AssetService } from './asset.service.js'
import { BankImportService } from './bank-import.service.js'
import { BusinessExportService } from './business-export.service.js'
import { PayrollService } from './payroll.service.js'
import { HEBESATZ_DIRECTORY } from './business.tokens.js'
import {
  extraordinaryOf,
  ledgerCall,
  parseJson,
  PERSON_FORMS,
  personWideOf,
  privateBalanceEur,
  profitOf,
  round2,
  smallBusinessCheckOf,
  turnoverOf,
  withDefaultAnswers,
  withoutPersonWide,
} from './business-helpers.js'
import type {
  AppliedMultiplier,
  BusinessProfileView,
  DisposalFacts,
  ElsterHelp,
  ElsterLineValue,
  InputVatCorrectionLine,
  LossFacts,
  PartnershipShare,
  ProfileInput,
  RetainedFacts,
  SmallBusinessCheck,
  TradeTaxInputs,
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
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(PayrollService) private readonly payrollRuns: PayrollService,
    @Inject(BusinessExportService) private readonly exports: BusinessExportService,
    @Inject(BankImportService) private readonly bank: BankImportService,
    @Inject(AssetService) private readonly fixedAssets: AssetService,
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

  getBook(...args: Parameters<LedgerService['getBook']>) {
    return this.ledger.getBook(...args)
  }

  post(...args: Parameters<LedgerService['post']>) {
    return this.ledger.post(...args)
  }

  reverse(...args: Parameters<LedgerService['reverse']>) {
    return this.ledger.reverse(...args)
  }

  quickEntry(...args: Parameters<LedgerService['quickEntry']>) {
    return this.ledger.quickEntry(...args)
  }

  lock(...args: Parameters<LedgerService['lock']>) {
    return this.ledger.lock(...args)
  }

  // ------------------------------------------------------------------------------------------------
  // Bank import (ADR-0101 §14)

  importBank(...args: Parameters<BankImportService['importBank']>) {
    return this.bank.importBank(...args)
  }

  listBank(...args: Parameters<BankImportService['listBank']>) {
    return this.bank.listBank(...args)
  }

  acceptBank(...args: Parameters<BankImportService['acceptBank']>) {
    return this.bank.acceptBank(...args)
  }

  ignoreBank(...args: Parameters<BankImportService['ignoreBank']>) {
    return this.bank.ignoreBank(...args)
  }

  // ------------------------------------------------------------------------------------------------
  // Fixed assets (ADR-0101 §7)

  assets(...args: Parameters<AssetService['assets']>) {
    return this.fixedAssets.assets(...args)
  }

  createAsset(...args: Parameters<AssetService['createAsset']>) {
    return this.fixedAssets.createAsset(...args)
  }

  setAssetFacts(...args: Parameters<AssetService['setAssetFacts']>) {
    return this.fixedAssets.setAssetFacts(...args)
  }

  disposeAsset(...args: Parameters<AssetService['disposeAsset']>) {
    return this.fixedAssets.disposeAsset(...args)
  }

  bookDepreciation(...args: Parameters<AssetService['bookDepreciation']>) {
    return this.fixedAssets.bookDepreciation(...args)
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
    const [entry] = await this.ledger.postDrafts(userId, next, ref, frame, profile, (book) => {
      if ([...book.sources.values()].includes('eb')) throw new ConflictError('OPENING_ENTRY_EXISTS', `Die Eröffnungsbilanz ${next} ist schon gebucht.`)
      return [{ draft: closing.bilanz!.openingEntry, source: 'eb' }]
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return entry!
  }

  // ------------------------------------------------------------------------------------------------
  // Firmenwagen (ADR-0101 §22)

  companyCar(...args: Parameters<AssetService['companyCar']>) {
    return this.fixedAssets.companyCar(...args)
  }

  bookCompanyCar(...args: Parameters<AssetService['bookCompanyCar']>) {
    return this.fixedAssets.bookCompanyCar(...args)
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

  acceptedDraft(...args: Parameters<LedgerService['acceptedDraft']>) {
    return this.ledger.acceptedDraft(...args)
  }

  applyDraft(...args: Parameters<LedgerService['applyDraft']>) {
    return this.ledger.applyDraft(...args)
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

  addPayrollRun(...args: Parameters<PayrollService['addPayrollRun']>) {
    return this.payrollRuns.addPayrollRun(...args)
  }

  payroll(...args: Parameters<PayrollService['payroll']>) {
    return this.payrollRuns.payroll(...args)
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
    for (const b of businesses) if (b.book) this.ledger.assertIntact(b.book)
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

  gobdExport(...args: Parameters<BusinessExportService['gobdExport']>) {
    return this.exports.gobdExport(...args)
  }

  procedureDoc(...args: Parameters<BusinessExportService['procedureDoc']>) {
    return this.exports.procedureDoc(...args)
  }

  saveProcedureDoc(...args: Parameters<BusinessExportService['saveProcedureDoc']>) {
    return this.exports.saveProcedureDoc(...args)
  }

  eBilanz(...args: Parameters<BusinessExportService['eBilanz']>) {
    return this.exports.eBilanz(...args)
  }

  transmitEBilanz(...args: Parameters<BusinessExportService['transmitEBilanz']>) {
    return this.exports.transmitEBilanz(...args)
  }
}
