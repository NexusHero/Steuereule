import { Inject, Injectable } from '@nestjs/common'
import type { BusinessIncome, BookkeepingMode } from '@steuereule/core'
import { selfEmploymentEnabled } from '../config/self-employment.js'
import { BUSINESS_REPOSITORY, type BusinessPerson, type BusinessRef, FIRST_BUSINESS, type BusinessRepository } from './business.repository.js'
import { BusinessContext } from './business-context.js'
import { BusinessTaxService } from './business-tax.service.js'
import { VatService } from './vat.service.js'
import { extraordinaryOf, parseJson, profitOf, round2 } from './business-helpers.js'
import type { LossFacts, PartnershipShare } from './views.js'

/**
 * What the rest of the app reads from the self-employment path: the Gewinneinkünfte for the estimate,
 * a few figures for the owl's case digest, and the frame a booking draft is checked against.
 */
@Injectable()
export class BusinessSummaryService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(VatService) private readonly vat: VatService,
    @Inject(BusinessTaxService) private readonly tax: BusinessTaxService,
  ) {}

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
      const trade = this.tax.tradeTaxOf(ledger, profile, year)
      if (trade.status === 'berechnet') tradeTax.push({ baseAmountEur: trade.result.baseAmountEur, tradeTaxEur: trade.result.tradeTaxEur })
      // § 16: the gain beside the current profit; a sole trader's bears no trade tax (§ 7 Satz 2 GewStG e contrario, R 7.1 Abs. 3 GewStR).
      const special = this.tax.specialOf(ledger, profile, year, trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0)
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

  /** A few figures for the owl's case digest; null without a business. All businesses of Person A together. */
  async digest(userId: string, year: number): Promise<{ profitSoFarEur: number; vatBalanceEur: number | null; openBankItems: number; mode: BookkeepingMode; kind: string | null } | null> {
    if (!selfEmploymentEnabled()) return null
    const businesses = await this.context.businessesOf(userId, year, 'A')
    if (businesses.length === 0) return null
    const banks = await Promise.all(businesses.map((b) => this.repository.listBankTransactions(userId, year, b.ref)))
    const first = businesses[0]!
    const vat = await this.vat.personVat(userId, year, 'A')
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
}
