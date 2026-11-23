import { Inject, Injectable } from '@nestjs/common'
import {
  elsterLinesFor,
  ELSTER_FORMS,
  ELSTER_YEARS,
  euerProfit,
  euerTotals,
  suggestProfessionKind,
  type BookkeepingMode,
  type ElsterForm,
  type ElsterYear,
  type EuerKey,
  type Ledger,
  type ProfessionAnswers,
  type ProfessionSuggestion,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, ForbiddenError, NotFoundError } from '../common/domain-error.js'
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
import { deductibleByKeyInEuros } from './business-ledger.js'
import { HebesatzDirectory } from './hebesatz.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { BusinessSummaryService } from './business-summary.service.js'
import { BusinessTaxService } from './business-tax.service.js'
import { VatService } from './vat.service.js'
import { AssetService } from './asset.service.js'
import { BankImportService } from './bank-import.service.js'
import { BusinessExportService } from './business-export.service.js'
import { PayrollService } from './payroll.service.js'
import { HEBESATZ_DIRECTORY } from './business.tokens.js'
import { parseJson, PERSON_FORMS, personWideOf, profitOf, round2, withDefaultAnswers, withoutPersonWide } from './business-helpers.js'
import type { BusinessProfileView, DisposalFacts, ElsterHelp, ElsterLineValue, LossFacts, PartnershipShare, ProfileInput, RetainedFacts, TradeTaxInputs, VatPeriodFacts } from './views.js'

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
    @Inject(VatService) private readonly vat: VatService,
    @Inject(BusinessTaxService) private readonly tax: BusinessTaxService,
    @Inject(BusinessSummaryService) private readonly summary: BusinessSummaryService,
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

  closing(...args: Parameters<BusinessTaxService['closing']>) {
    return this.tax.closing(...args)
  }

  carryForward(...args: Parameters<BusinessTaxService['carryForward']>) {
    return this.tax.carryForward(...args)
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

  vatReturn(...args: Parameters<VatService['vatReturn']>) {
    return this.vat.vatReturn(...args)
  }

  vatPrepayments(...args: Parameters<VatService['vatPrepayments']>) {
    return this.vat.vatPrepayments(...args)
  }

  // ------------------------------------------------------------------------------------------------
  // Gewerbesteuer (ADR-0101 §9)

  lookupHebesatz(...args: Parameters<BusinessTaxService['lookupHebesatz']>) {
    return this.tax.lookupHebesatz(...args)
  }

  tradeTax(...args: Parameters<BusinessTaxService['tradeTax']>) {
    return this.tax.tradeTax(...args)
  }

  // ------------------------------------------------------------------------------------------------
  // Verluste (ADR-0101 §10)

  losses(...args: Parameters<BusinessTaxService['losses']>) {
    return this.tax.losses(...args)
  }

  acceptedDraft(...args: Parameters<LedgerService['acceptedDraft']>) {
    return this.ledger.acceptedDraft(...args)
  }

  applyDraft(...args: Parameters<LedgerService['applyDraft']>) {
    return this.ledger.applyDraft(...args)
  }

  // ------------------------------------------------------------------------------------------------
  // For the estimate and the owl

  estimateInput(...args: Parameters<BusinessSummaryService['estimateInput']>) {
    return this.summary.estimateInput(...args)
  }

  // ------------------------------------------------------------------------------------------------
  // Lohn (ADR-0101 §22)

  addPayrollRun(...args: Parameters<PayrollService['addPayrollRun']>) {
    return this.payrollRuns.addPayrollRun(...args)
  }

  payroll(...args: Parameters<PayrollService['payroll']>) {
    return this.payrollRuns.payroll(...args)
  }

  specialTariffs(...args: Parameters<BusinessTaxService['specialTariffs']>) {
    return this.tax.specialTariffs(...args)
  }

  digest(...args: Parameters<BusinessSummaryService['digest']>) {
    return this.summary.digest(...args)
  }

  bookingTarget(...args: Parameters<BusinessSummaryService['bookingTarget']>) {
    return this.summary.bookingTarget(...args)
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
        const { figures, result } = this.vat.vatOf(ledger, profile, year)
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
        const trade = this.tax.tradeTaxOf(ledger, profile, year)
        const disposal = this.tax.specialOf(ledger, profile, year, trade.status === 'berechnet' ? trade.result.tradeTaxEur : 0).disposal
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
        const trade = this.tax.tradeTaxOf(ledger, profile, year)
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
