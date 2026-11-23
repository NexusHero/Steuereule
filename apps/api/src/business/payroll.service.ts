import { Inject, Injectable } from '@nestjs/common'
import {
  accountFor,
  BAV_SUPPORT_MAX_EUR,
  churchKennzahl,
  federalStateOfAgs,
  minijobCharges,
  minijobLimitEur,
  payrollEntryLines,
  wageTaxFilingPeriod,
  wageTaxReturn,
  type BookingDraft,
  type ChurchCode,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { InvalidInputError } from '../common/domain-error.js'
import { BUSINESS_REPOSITORY, type BusinessRef, type BusinessRepository } from './business.repository.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { parseJson, round2 } from './business-helpers.js'
import type { PayrollOverview, PayrollRunInput } from './views.js'

/** Lohn (ADR-0101 §22): payroll runs booked through the ledger, the Lohnsteuer-Anmeldungen and the Minijob charges. */
@Injectable()
export class PayrollService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

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
    const [entry] = await this.ledger.postDrafts(userId, year, ref, { chart, mode }, profile, () => [{ draft, source: 'lohn' }])
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
    // One draft posts one entry; the index type alone says it could be missing.
    return { run, entry: entry! }
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
}
