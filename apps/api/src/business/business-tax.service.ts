import { Inject, Injectable } from '@nestjs/common'
import {
  disposalGain,
  retainedProfitTax,
  type RetainedProfit,
  applyLosses,
  balanceSheet,
  carryBackLoss,
  closingBalances,
  euerProfit,
  euerTotals,
  incomeStatement,
  lossRules,
  openingEntryDraft,
  tradeTaxReturn,
  landDeduction,
  type JournalEntry,
  type Ledger,
  type TradeTaxReturn,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
import type { BusinessRef, BusinessProfileRecord } from './business.repository.js'
import { bookIntegrity, deductibleByKeyInEuros } from './business-ledger.js'
import { HebesatzDirectory, type HebesatzLookup } from './hebesatz.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { HEBESATZ_DIRECTORY } from './business.tokens.js'
import { ledgerCall, parseJson, privateBalanceEur, profitOf } from './business-helpers.js'
import type { AppliedMultiplier, DisposalFacts, LossFacts, RetainedFacts, TradeTaxInputs } from './views.js'

/**
 * What the year's book yields for the taxes on the profit (ADR-0101 §5, §9, §10, §15, §22): the closing
 * and its carry-forward, the Gewerbesteuer with the Hebesatz, the losses and the special tariffs.
 */
@Injectable()
export class BusinessTaxService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(HEBESATZ_DIRECTORY) private readonly hebesaetze: HebesatzDirectory,
  ) {}

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

  tradeTaxOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number): { status: 'berechnet'; result: TradeTaxReturn; multiplier: AppliedMultiplier; profitEur: number } | { status: 'offen'; missing: string[] } | { status: 'entfaellt'; reason: string } {
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

  /** § 16 / § 34 and § 34a of one business as the profile and the book say (ADR-0101 §22). */
  async specialTariffs(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const { ledger, profile } = await this.context.loaded(userId, year, ref)
    const trade = this.tradeTaxOf(ledger, profile, year)
    const result = this.specialOf(ledger, profile, year, trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return result
  }

  specialOf(ledger: Ledger, profile: BusinessProfileRecord | null, year: number, tradeTaxEur: number) {
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
}
