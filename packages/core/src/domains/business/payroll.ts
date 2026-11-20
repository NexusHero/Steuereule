/**
 * Wages of the self-employed's own employees (ADR-0101 §22): the app books the runs of an outside
 * payroll (tax office, payroll software) and computes a gewerblicher Minijob itself; it gives the
 * Lohnsteuer-Anmeldung as fill-in help. It files no social security reports (those need ITSG-certified
 * software). Sources: docs/research/selbststaendige-erweiterung.md §2, §5.
 */

interface MinijobRates {
  readonly kv: number
  readonly rv: number
  readonly tax: number
  readonly u1: number
  readonly u2: number
  readonly insolvency: number
}

/** Minijob-Zentrale, gewerblich: KV § 249b SGB V, RV § 168 Abs. 1 Nr. 1b / § 172 Abs. 3 SGB VI, Pauschsteuer § 40a Abs. 2 EStG; Umlagen per year. */
const MINIJOB_RATES: Readonly<Record<number, MinijobRates>> = {
  2022: { kv: 0.13, rv: 0.15, tax: 0.02, u1: 0.009, u2: 0.0029, insolvency: 0.0009 },
  2023: { kv: 0.13, rv: 0.15, tax: 0.02, u1: 0.011, u2: 0.0024, insolvency: 0.0006 },
  2024: { kv: 0.13, rv: 0.15, tax: 0.02, u1: 0.011, u2: 0.0024, insolvency: 0.0006 },
  2025: { kv: 0.13, rv: 0.15, tax: 0.02, u1: 0.011, u2: 0.0022, insolvency: 0.0015 },
  2026: { kv: 0.13, rv: 0.15, tax: 0.02, u1: 0.008, u2: 0.0022, insolvency: 0.0015 },
}

/** The RV rate (18,6 % 2022–2026): the Minijobber pays what exceeds the employer's 15 %. */
const RV_TOTAL = 0.186
const RV_MIN_BASE_EUR = 175

/** § 8 Abs. 1a SGB IV: 450 € until 30.9.2022, then Mindestlohn × 130 / 3 (520, 538, 556, 603 €). */
export function minijobLimitEur(year: number, month: number): number {
  if (year < 2022 || (year === 2022 && month < 10)) return 450
  if (year <= 2023) return 520
  if (year === 2024) return 538
  if (year === 2025) return 556
  return 603
}

const c2 = (v: number) => Math.round(v * 100) / 100

export interface MinijobInput {
  readonly year: number
  readonly month: number
  readonly grossEur: number
  /** The flat KV only for a Minijobber in the statutory insurance (member or family), § 249b SGB V. */
  readonly statutoryHealthInsured: boolean
  /** Exempt from the RV on application (§ 6 Abs. 1b SGB VI): no own share, the employer still pays 15 %. */
  readonly rvExempt: boolean
}

export interface MinijobCharges {
  /** Above the limit the job is no Minijob; the app then needs the outside payroll. */
  readonly overLimit: boolean
  readonly employer: { readonly kvEur: number; readonly rvEur: number; readonly taxEur: number; readonly u1Eur: number; readonly u2Eur: number; readonly insolvencyEur: number }
  readonly employerTotalEur: number
  readonly employeeRvEur: number
  readonly netPayEur: number
}

export function minijobCharges(input: MinijobInput): MinijobCharges {
  const rates = MINIJOB_RATES[Math.min(2026, Math.max(2022, input.year))]!
  const gross = Math.max(0, input.grossEur)
  const employer = {
    kvEur: input.statutoryHealthInsured ? c2(gross * rates.kv) : 0,
    rvEur: c2(gross * rates.rv),
    taxEur: c2(gross * rates.tax),
    u1Eur: c2(gross * rates.u1),
    u2Eur: c2(gross * rates.u2),
    insolvencyEur: c2(gross * rates.insolvency),
  }
  const employerTotalEur = c2(Object.values(employer).reduce((s, v) => s + v, 0))
  // § 163 Abs. 8 SGB VI: the Minijobber's share is measured on at least 175 €; the employer's 15 % on the pay.
  const employeeRvEur = input.rvExempt ? 0 : c2(Math.min(gross, Math.max(0, Math.max(gross, RV_MIN_BASE_EUR) * RV_TOTAL - gross * rates.rv)))
  return { overLimit: gross > minijobLimitEur(input.year, input.month), employer, employerTotalEur, employeeRvEur, netPayEur: c2(gross - employeeRvEur) }
}

/** § 41a Abs. 2 EStG: monthly above 5.000 € of last year's wage tax, quarterly above 1.080 €, else yearly; a part year annualised. */
export function wageTaxFilingPeriod(input: { readonly priorYearWageTaxEur: number; readonly priorYearMonthsActive?: number | undefined }): 'monat' | 'quartal' | 'jahr' {
  const months = Math.min(12, Math.max(1, Math.ceil(input.priorYearMonthsActive ?? 12)))
  const annual = (Math.max(0, input.priorYearWageTaxEur) * 12) / months
  if (annual > 5_000) return 'monat'
  if (annual > 1_080) return 'quartal'
  return 'jahr'
}

export interface WageTaxRunFacts {
  readonly kind: 'regulaer' | 'minijob'
  readonly employee: string
  readonly wageTaxEur: number
  readonly soliEur: number
  readonly churchTaxEur: number
  readonly church: 'ev' | 'rk' | null
}

/**
 * The Kennzahlen of one Lohnsteuer-Anmeldung (Vordruck 2026): 86 employees, 42 Lohnsteuer, 49 Soli,
 * 61/62 church tax, 83 total. The Minijob's 2 % goes to the Knappschaft, not here (Hinweis Nr. 2).
 */
export function wageTaxReturn(runs: readonly WageTaxRunFacts[]): Readonly<Record<string, number>> {
  const regular = runs.filter((r) => r.kind === 'regulaer')
  const k: Record<string, number> = {}
  const put = (kz: string, v: number) => {
    if (v !== 0) k[kz] = c2(v)
  }
  put('86', new Set(regular.map((r) => r.employee)).size)
  put('42', regular.reduce((s, r) => s + r.wageTaxEur, 0))
  put('49', regular.reduce((s, r) => s + r.soliEur, 0))
  put('61', regular.filter((r) => r.church === 'ev').reduce((s, r) => s + r.churchTaxEur, 0))
  put('62', regular.filter((r) => r.church === 'rk').reduce((s, r) => s + r.churchTaxEur, 0))
  put('83', regular.reduce((s, r) => s + r.wageTaxEur + r.soliEur + r.churchTaxEur, 0))
  return k
}

export interface PayrollRunAmounts {
  readonly kind: 'regulaer' | 'minijob'
  readonly grossEur: number
  readonly wageTaxEur: number
  readonly soliEur: number
  readonly churchTaxEur: number
  readonly employeeSocialEur: number
  readonly employerSocialEur: number
}

/**
 * The amounts of the entry of one run: gross and employer charges as Personalaufwand, the net paid,
 * the wage taxes owed to the tax office, both social shares owed to the health insurer (or the
 * Knappschaft for a Minijob).
 */
export function payrollEntryLines(run: PayrollRunAmounts):
  | { readonly ok: true; readonly netEur: number; readonly lines: { readonly wagesEur: number; readonly employerSocialEur: number; readonly netEur: number; readonly taxesEur: number; readonly socialPayableEur: number } }
  | { readonly ok: false; readonly reason: string } {
  const taxesEur = c2(run.wageTaxEur + run.soliEur + run.churchTaxEur)
  const netEur = c2(run.grossEur - taxesEur - run.employeeSocialEur)
  if (netEur < 0 || [run.grossEur, run.wageTaxEur, run.soliEur, run.churchTaxEur, run.employeeSocialEur, run.employerSocialEur].some((v) => v < 0)) {
    return { ok: false, reason: 'Die Abzüge sind größer als der Bruttolohn; prüf die Lohnabrechnung.' }
  }
  return { ok: true, netEur, lines: { wagesEur: c2(run.grossEur), employerSocialEur: c2(run.employerSocialEur), netEur, taxesEur, socialPayableEur: c2(run.employeeSocialEur + run.employerSocialEur) } }
}
