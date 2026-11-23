import { Inject, Injectable } from '@nestjs/common'
import { elsterLinesFor, ELSTER_FORMS, ELSTER_YEARS, euerProfit, euerTotals, type ElsterForm, type ElsterYear, type EuerKey, type Ledger } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { NotFoundError } from '../common/domain-error.js'
import { type BusinessRef, FIRST_BUSINESS, type BusinessProfileRecord } from './business.repository.js'
import { deductibleByKeyInEuros } from './business-ledger.js'
import { HebesatzDirectory } from './hebesatz.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { BusinessTaxService } from './business-tax.service.js'
import { VatService } from './vat.service.js'
import { HEBESATZ_DIRECTORY } from './business.tokens.js'
import { parseJson, PERSON_FORMS, personWideOf, profitOf, round2 } from './business-helpers.js'
import type { ElsterHelp, ElsterLineValue, LossFacts, TradeTaxInputs } from './views.js'

/**
 * The ELSTER fill-in help of the business forms (ADR-0101 §16, §22): its gate, and per form the values
 * the app computed, from the business's own book or from all businesses of the person.
 */
@Injectable()
export class BusinessElsterService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(VatService) private readonly vat: VatService,
    @Inject(BusinessTaxService) private readonly tax: BusinessTaxService,
    @Inject(HEBESATZ_DIRECTORY) private readonly hebesaetze: HebesatzDirectory,
  ) {}

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
}
