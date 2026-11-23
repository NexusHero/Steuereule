import { Inject, Injectable } from '@nestjs/common'
import {
  ecSalesListInQuarter,
  specialPrepayment,
  vatFilingPeriod,
  vatPeriodReturn,
  vatPeriodsOf,
  vatAnnualReturn,
  cashAccountingAllowed,
  type JournalEntry,
  type Ledger,
  type VatAnnualResult,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { BUSINESS_REPOSITORY, type BusinessPerson, type BusinessRef, FIRST_BUSINESS, type BusinessProfileRecord, type BusinessRepository } from './business.repository.js'
import { ecSalesListOf, eur, vatCorrectionOf, vatFiguresOf, type VatFigures } from './business-ledger.js'
import { BusinessContext } from './business-context.js'
import { parseJson, round2, smallBusinessCheckOf, turnoverOf } from './business-helpers.js'
import type { InputVatCorrectionLine, SmallBusinessCheck, VatPeriodFacts, VatPrepaymentOverview } from './views.js'

/**
 * Umsatzsteuer (ADR-0101 §8, §22): the annual return, the Voranmeldungen and the Zusammenfassende
 * Meldungen of the person, read off the journals of all his businesses.
 */
@Injectable()
export class VatService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
  ) {}

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
  async personVat(
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
  vatOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number, derivedPrepaymentsEur: number | null = null, inputVatCorrectionEur = 0): { figures: VatFigures; result: VatAnnualResult } {
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
}
