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
  /** The U1 levy only for an employer with at most 30 employees (§ 1 Abs. 1 AAG); default true. */
  readonly u1Applies?: boolean | undefined
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
    u1Eur: input.u1Applies === false ? 0 : c2(gross * rates.u1),
    u2Eur: c2(gross * rates.u2),
    insolvencyEur: c2(gross * rates.insolvency),
  }
  const employerTotalEur = c2(Object.values(employer).reduce((s, v) => s + v, 0))
  // § 163 Abs. 8 SGB VI: the Minijobber's share is measured on at least 175 €; the employer's 15 % on the pay.
  const employeeRvEur = input.rvExempt ? 0 : c2(Math.min(gross, Math.max(0, Math.max(gross, RV_MIN_BASE_EUR) * RV_TOTAL - gross * rates.rv)))
  return { overLimit: gross > minijobLimitEur(input.year, input.month), employer, employerTotalEur, employeeRvEur, netPayEur: c2(gross - employeeRvEur) }
}

/**
 * § 41a Abs. 2 EStG: monthly above 5.000 € of last year's wage tax, quarterly above 1.080 €, else yearly; a part
 * year annualised (Satz 3). A Betriebsstätte opened this year takes its first full month's wage tax × 12 (Satz 4).
 */
export function wageTaxFilingPeriod(input: {
  readonly priorYearWageTaxEur: number
  readonly priorYearMonthsActive?: number | undefined
  readonly newEstablishment?: { readonly firstFullMonthWageTaxEur: number } | undefined
}): 'monat' | 'quartal' | 'jahr' {
  const months = Math.min(12, Math.max(1, Math.ceil(input.priorYearMonthsActive ?? 12)))
  const annual = input.newEstablishment ? Math.max(0, input.newEstablishment.firstFullMonthWageTaxEur) * 12 : (Math.max(0, input.priorYearWageTaxEur) * 12) / months
  if (annual > 5_000) return 'monat'
  if (annual > 1_080) return 'quartal'
  return 'jahr'
}

/** The Länder by the first two digits of the Amtlicher Gemeindeschlüssel. */
export type FederalState = 'SH' | 'HH' | 'NI' | 'HB' | 'NW' | 'HE' | 'RP' | 'BW' | 'BY' | 'SL' | 'BE' | 'BB' | 'MV' | 'SN' | 'ST' | 'TH'
const STATE_BY_AGS: Readonly<Record<string, FederalState>> = {
  '01': 'SH', '02': 'HH', '03': 'NI', '04': 'HB', '05': 'NW', '06': 'HE', '07': 'RP', '08': 'BW',
  '09': 'BY', '10': 'SL', '11': 'BE', '12': 'BB', '13': 'MV', '14': 'SN', '15': 'ST', '16': 'TH',
}
export function federalStateOfAgs(ags: string | null | undefined): FederalState | null {
  return ags ? (STATE_BY_AGS[ags.slice(0, 2)] ?? null) : null
}

/** The church-tax codes of the Lohnsteuerabzugsmerkmale the Anmeldung knows. */
export const CHURCH_CODES = ['ev', 'rk', 'ak', 'ib', 'fb', 'iw', 'is', 'jh', 'jd', 'fm', 'il', 'fs', 'fg', 'fa', 'ih'] as const
export type ChurchCode = (typeof CHURCH_CODES)[number]

/**
 * Lohnsteuer-Anmeldung 2026, lines 26–32: ev 61 and rk 62 everywhere, the other communities by Land (page 3 of the
 * Vordruck). Hamburg's 64 for jh and Brandenburg's 64 for is/jh/jd are the same line. A code the Land does not list
 * has no line: its tax counts in Kz 83 and the app says so.
 */
const CHURCH_KZ: Readonly<Partial<Record<FederalState, Partial<Record<ChurchCode, string>>>>> = {
  BW: { ib: '78', fb: '67', iw: '73', ak: '63' },
  BY: { is: '64', ak: '63' },
  BE: { ak: '63' },
  BB: { is: '64', jh: '64', jd: '64', fm: '65', il: '74', ak: '63' },
  HH: { jh: '64', ak: '63' },
  HE: { fs: '66', fm: '65', is: '64', il: '74', ak: '63' },
  NI: { ak: '63' },
  NW: { jd: '64', ak: '63' },
  RP: { is: '64', fg: '68', fm: '65', fa: '72', ak: '63' },
  SL: { is: '64', ak: '63' },
  SH: { ih: '64', ak: '63' },
}

export function churchKennzahl(state: FederalState | null, church: ChurchCode): string | null {
  if (church === 'ev') return '61'
  if (church === 'rk') return '62'
  return state ? (CHURCH_KZ[state]?.[church] ?? null) : null
}

export interface WageTaxRunFacts {
  readonly kind: 'regulaer' | 'minijob'
  readonly employee: string
  readonly wageTaxEur: number
  readonly soliEur: number
  readonly churchTaxEur: number
  readonly church: ChurchCode | null
  /** Pauschale Lohnsteuer (§§ 40, 40a Abs. 1, 3, 40b EStG) the employer takes over: Kz 41. */
  readonly flatWageTaxEur?: number | undefined
  /** Pauschale Lohnsteuer for gifts and benefits (§ 37b EStG): Kz 44. */
  readonly flat37bTaxEur?: number | undefined
  /** Pauschale Kirchensteuer in the simplified procedure: Kz 47. */
  readonly flatChurchTaxEur?: number | undefined
  /** BAV-Förderbetrag the employer takes off the wage tax (§ 100 EStG): Kz 45, the employee counts in Kz 90. */
  readonly bavSupportEur?: number | undefined
}

/** § 100 Abs. 2 Satz 1 EStG: 30 % of the additional employer contribution, at most 288 € a year per employee. */
export const BAV_SUPPORT_MAX_EUR = 288

/**
 * The Kennzahlen of one Lohnsteuer-Anmeldung (Vordruck 2026): 86 employees (Minijobber included), 90 of them with
 * a BAV-Förderbetrag, 42 Lohnsteuer, 41 and 44 pauschale Lohnsteuer, 45 the Förderbetrag (§ 100 EStG), 48
 * Verbleiben (42 + 41 + 44 − 45; Kz 33, the Kürzung for merchant ships of § 41a Abs. 4, does not arise in the app),
 * 49 Soli, 47 pauschale Kirchensteuer, 61/62 and the Land lines church tax, 83 total. The Minijob's 2 % goes to
 * the Knappschaft, not here (Hinweis Nr. 2).
 */
export function wageTaxReturn(runs: readonly WageTaxRunFacts[], state: FederalState | null = null): Readonly<Record<string, number>> {
  const regular = runs.filter((r) => r.kind === 'regulaer')
  const k: Record<string, number> = {}
  const sum = (f: (r: WageTaxRunFacts) => number) => regular.reduce((s, r) => s + f(r), 0)
  const put = (kz: string, v: number) => {
    if (v !== 0) k[kz] = c2((k[kz] ?? 0) + v)
  }
  // Kz 86 counts every employee, Aushilfen and Minijobber included (Vordruck 2026, Hinweis Nr. 11).
  put('86', new Set(runs.map((r) => r.employee)).size)
  put('90', new Set(regular.filter((r) => (r.bavSupportEur ?? 0) > 0).map((r) => r.employee)).size)
  const wageTax = sum((r) => r.wageTaxEur)
  const flat = sum((r) => r.flatWageTaxEur ?? 0)
  const flat37b = sum((r) => r.flat37bTaxEur ?? 0)
  const bav = sum((r) => r.bavSupportEur ?? 0)
  put('42', wageTax)
  put('41', flat)
  put('44', flat37b)
  put('45', bav)
  if (flat !== 0 || flat37b !== 0 || bav !== 0) put('48', wageTax + flat + flat37b - bav)
  put('49', sum((r) => r.soliEur))
  put('47', sum((r) => r.flatChurchTaxEur ?? 0))
  for (const r of regular) {
    const kz = r.church ? churchKennzahl(state, r.church) : null
    if (kz) put(kz, r.churchTaxEur)
  }
  put('83', sum((r) => r.wageTaxEur + (r.flatWageTaxEur ?? 0) + (r.flat37bTaxEur ?? 0) - (r.bavSupportEur ?? 0) + r.soliEur + r.churchTaxEur + (r.flatChurchTaxEur ?? 0)))
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
  /** Pauschale Lohn- and Kirchensteuer the employer takes over: an expense of his, owed to the tax office. */
  readonly employerFlatTaxEur?: number | undefined
}

/**
 * The amounts of the entry of one run: gross and employer charges as Personalaufwand, the net paid,
 * the wage taxes owed to the tax office, both social shares owed to the health insurer (or the
 * Knappschaft for a Minijob).
 */
export function payrollEntryLines(run: PayrollRunAmounts):
  | {
      readonly ok: true
      readonly netEur: number
      readonly lines: { readonly wagesEur: number; readonly employerSocialEur: number; readonly employerFlatTaxEur: number; readonly netEur: number; readonly taxesEur: number; readonly socialPayableEur: number }
    }
  | { readonly ok: false; readonly reason: string } {
  const flat = run.employerFlatTaxEur ?? 0
  const withheld = c2(run.wageTaxEur + run.soliEur + run.churchTaxEur)
  const netEur = c2(run.grossEur - withheld - run.employeeSocialEur)
  if (netEur < 0 || [run.grossEur, run.wageTaxEur, run.soliEur, run.churchTaxEur, run.employeeSocialEur, run.employerSocialEur, flat].some((v) => v < 0)) {
    return { ok: false, reason: 'Die Abzüge sind größer als der Bruttolohn; prüf die Lohnabrechnung.' }
  }
  return {
    ok: true,
    netEur,
    lines: { wagesEur: c2(run.grossEur), employerSocialEur: c2(run.employerSocialEur), employerFlatTaxEur: c2(flat), netEur, taxesEur: c2(withheld + flat), socialPayableEur: c2(run.employeeSocialEur + run.employerSocialEur) },
  }
}
