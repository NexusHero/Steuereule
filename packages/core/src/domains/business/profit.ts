import { getTaxYearParameters } from '../../math/tax-parameters'
import { isSupportedIncomeTaxYear } from '../../math/tarif'
import { EUER_KEYS, type EuerKey } from './euer-keys'

/**
 * The Gewinn of a year by Einnahmenüberschussrechnung (§ 4 Abs. 3 EStG) from the totals per EÜR key.
 * Bilanzierer take their profit from the bookkeeping (§ 4 Abs. 1, § 5 EStG); this covers the EÜR.
 * Amounts are euros; the key says whether they are income or expense. A key can net below 0 in a
 * year, e.g. a refund of last year's costs booked on the expense account: the refund is income of the
 * year it comes in (§ 11 Abs. 1 EStG), so the negative amount raises the profit by its deductible part.
 */

export type EuerKeyAmounts = Partial<Record<EuerKey, number>>

/** § 4 Abs. 5 Satz 1 Nr. 1 EStG: 35 €, 50 € for Wirtschaftsjahre beginning after 31.12.2023 (§ 52 Abs. 6 Satz 1 EStG, Wachstumschancengesetz). */
export function giftLimitEur(year: number): number {
  return year >= 2024 ? 50 : 35
}

/** § 4 Abs. 5 Satz 1 Nr. 2 EStG: 70 % of reasonable business entertainment is deductible. */
export const ENTERTAINMENT_DEDUCTIBLE_SHARE = 0.7

/**
 * § 4 Abs. 5 Satz 1 Nr. 5 with § 9 Abs. 4a Satz 3 EStG: 28 € for a full day away, 14 € for a day of
 * more than 8 hours and for the day of arrival and departure; unchanged 2022–2026 (since the JStG 2019).
 */
export const MEAL_ALLOWANCE = { fullDayEur: 28, partialDayEur: 14 } as const

/** § 4 Abs. 5 Satz 1 Nr. 6b EStG: Jahrespauschale of 1.260 € from 2023; 1.250 € cap until 2022. */
const ROOM_LUMP_SUM_EUR = 1260
const ROOM_CAP_2022_EUR = 1250

export type HomeOffice =
  /** § 4 Abs. 5 Satz 1 Nr. 6c EStG: per day worked mainly at home (2022: Homeoffice-Pauschale § 4 Abs. 5 Satz 1 Nr. 6b Satz 4 aF). */
  | { readonly kind: 'tagespauschale'; readonly days: number }
  /** The study is the centre of all work: the costs in full, or from 2023 the Jahrespauschale instead. */
  | { readonly kind: 'mittelpunkt'; readonly costsEur: number; readonly lumpSum?: boolean | undefined; readonly monthsMet?: number | undefined }
  /** Only until 2022: no other workplace available, the costs up to 1.250 €. */
  | { readonly kind: 'kein_anderer_arbeitsplatz'; readonly costsEur: number }

export interface ProfitDetails {
  /** Net costs of the gifts per recipient in the year; a recipient above the limit loses the whole gift. */
  readonly giftsPerRecipientEur?: readonly number[] | undefined
  /** Days of business travel; the deduction is the lump sum, never the meals booked. */
  readonly mealAllowanceDays?: { readonly partialDays: number; readonly fullDays: number } | undefined
  readonly homeOffice?: HomeOffice | undefined
  /** Fahrten zwischen Wohnung und Betriebsstätte (§ 4 Abs. 5 Satz 1 Nr. 6 EStG). */
  readonly commute?: { readonly distanceKm: number; readonly days: number; readonly carInBusinessAssets: boolean } | undefined
}

export interface ProfitLine {
  readonly key: EuerKey
  /** What was entered or booked. */
  readonly amountEur: number
  /** What the profit counts of it (for an expense: the deductible part). */
  readonly countedEur: number
  /** The signed effect on the profit. */
  readonly effectEur: number
}

export type ProfitOpenPoint = 'geschenke_ohne_empfaenger' | 'verpflegung_ohne_tage' | 'arbeitszimmer_ohne_angaben' | 'fahrten_ohne_entfernung'

export interface ProfitResult {
  readonly incomeEur: number
  readonly expensesEur: number
  readonly nonDeductibleEur: number
  /** Before the § 7g lines and reserves. */
  readonly profitBeforeIabEur: number
  readonly profitEur: number
  readonly lines: readonly ProfitLine[]
  /** Restricted keys entered as a total only: the profit takes them as deductible, the user should check. */
  readonly openPoints: readonly ProfitOpenPoint[]
}

const INCOME_PREFIX = 'einnahmen_'
const NOT_DEDUCTIBLE: ReadonlySet<EuerKey> = new Set(['ausgaben_gewerbesteuer', 'nicht_abziehbar_schuldzinsen_4_4a', 'nicht_abziehbar_sonstige'])
const cents = (value: number) => Math.round(value * 100) / 100

/**
 * Betriebseinnahmen − Betriebsausgaben, with the restricted expenses at their deductible part
 * (§ 4 Abs. 5 EStG), then − IAB-Abzug + IAB-Hinzurechnung (§ 7g Abs. 1, 2) − reserves (e.g. § 6c).
 * The Gewerbesteuer (§ 4 Abs. 5b EStG, since EZ 2008), the interest of § 4 Abs. 4a EStG and other
 * non-deductible expenses (fines, § 4 Abs. 5 Satz 1 Nr. 8 EStG) are listed in the EÜR and added back:
 * booked under their own key they count 0 and show among the non-deductible amounts. Their amount must
 * therefore not sit in another expense key as well.
 */
export function euerProfit(year: number, totals: EuerKeyAmounts, details: ProfitDetails = {}): ProfitResult {
  if (!isSupportedIncomeTaxYear(year)) throw new RangeError(`no EÜR rules for ${year}`)
  const openPoints: ProfitOpenPoint[] = []
  const lines: ProfitLine[] = []
  for (const key of EUER_KEYS) {
    const amount = totals[key]
    const hasDetail = restrictedDetailGiven(key, details)
    if ((amount === undefined || amount === 0) && !hasDetail) continue
    const amountEur = amount ?? 0
    if (!Number.isFinite(amountEur)) throw new RangeError(`${key}: amounts are euros`)
    const countedEur = cents(counted(year, key, amountEur, details, openPoints))
    const sign = key.startsWith(INCOME_PREFIX) || key === 'gewinn_iab_hinzurechnung' ? 1 : -1
    lines.push({ key, amountEur, countedEur, effectEur: countedEur === 0 ? 0 : sign * countedEur })
  }
  const sumOf = (filter: (key: EuerKey) => boolean) => cents(lines.filter((l) => filter(l.key)).reduce((sum, l) => sum + l.effectEur, 0))
  const incomeEur = sumOf((k) => k.startsWith(INCOME_PREFIX))
  const expensesEur = -sumOf((k) => k.startsWith('ausgaben_') || k.startsWith('beschraenkt_') || NOT_DEDUCTIBLE.has(k))
  const nonDeductibleEur = cents(lines.filter((l) => l.key.startsWith('beschraenkt_') || NOT_DEDUCTIBLE.has(l.key)).reduce((sum, l) => sum + Math.max(0, l.amountEur - l.countedEur), 0))
  const profitBeforeIabEur = cents(incomeEur - expensesEur)
  return {
    incomeEur,
    expensesEur,
    nonDeductibleEur,
    profitBeforeIabEur,
    profitEur: cents(profitBeforeIabEur + sumOf((k) => k.startsWith('gewinn_'))),
    lines,
    openPoints,
  }
}

function restrictedDetailGiven(key: EuerKey, d: ProfitDetails): boolean {
  switch (key) {
    case 'beschraenkt_verpflegungsmehraufwand':
      return d.mealAllowanceDays !== undefined
    case 'beschraenkt_arbeitszimmer_tagespauschale':
      return d.homeOffice !== undefined
    case 'beschraenkt_fahrten_wohnung_betrieb':
      return d.commute !== undefined && !d.commute.carInBusinessAssets
    default:
      return false
  }
}

function counted(year: number, key: EuerKey, amount: number, d: ProfitDetails, open: ProfitOpenPoint[]): number {
  switch (key) {
    case 'beschraenkt_geschenke': {
      if (!d.giftsPerRecipientEur) {
        open.push('geschenke_ohne_empfaenger')
        return amount
      }
      // A Freigrenze: a recipient above the limit loses the deduction for all his gifts of the year.
      const limit = giftLimitEur(year)
      return Math.min(amount, d.giftsPerRecipientEur.filter((g) => g <= limit).reduce((sum, g) => sum + g, 0))
    }
    case 'ausgaben_gewerbesteuer':
    case 'nicht_abziehbar_schuldzinsen_4_4a':
    case 'nicht_abziehbar_sonstige':
      return 0
    case 'beschraenkt_bewirtung':
      return amount * ENTERTAINMENT_DEDUCTIBLE_SHARE
    case 'beschraenkt_verpflegungsmehraufwand': {
      if (!d.mealAllowanceDays) {
        open.push('verpflegung_ohne_tage')
        return amount
      }
      return Math.max(0, d.mealAllowanceDays.partialDays) * MEAL_ALLOWANCE.partialDayEur + Math.max(0, d.mealAllowanceDays.fullDays) * MEAL_ALLOWANCE.fullDayEur
    }
    case 'beschraenkt_arbeitszimmer_tagespauschale': {
      if (!d.homeOffice) {
        open.push('arbeitszimmer_ohne_angaben')
        return amount
      }
      return homeOfficeDeduction(year, d.homeOffice)
    }
    case 'beschraenkt_fahrten_wohnung_betrieb': {
      if (!d.commute) {
        open.push('fahrten_ohne_entfernung')
        return amount
      }
      const allowance = commuteAllowance(year, d.commute.distanceKm, d.commute.days)
      // With the car in business assets its costs are booked; only the part above the Entfernungspauschale is lost.
      return d.commute.carInBusinessAssets ? Math.min(amount, allowance) : allowance
    }
    default:
      return amount
  }
}

/**
 * The deductible home office: from 2023 the study at the centre of all work in full or by the
 * Jahrespauschale (1.260 €, less 1/12 per month the conditions are not met), otherwise 6 € per day up
 * to 1.260 € (§ 4 Abs. 5 Satz 1 Nr. 6b, 6c EStG as amended by the Jahressteuergesetz 2022). Until 2022:
 * the centre in full, without another workplace up to 1.250 €, otherwise 5 € per day up to 600 €.
 */
export function homeOfficeDeduction(year: number, office: HomeOffice): number {
  const daily = getTaxYearParameters(year).homeOffice
  switch (office.kind) {
    case 'tagespauschale':
      return Math.min(Math.min(Math.max(0, Math.floor(office.days)), daily.maxDays) * daily.dailyRateEur, daily.maxAnnualEur)
    case 'mittelpunkt': {
      if (office.lumpSum && year >= 2023) return (ROOM_LUMP_SUM_EUR * Math.min(12, Math.max(0, office.monthsMet ?? 12))) / 12
      return Math.max(0, office.costsEur)
    }
    case 'kein_anderer_arbeitsplatz':
      if (year >= 2023) throw new RangeError('from 2023 a study outside the centre of work counts only through the Tagespauschale')
      return Math.min(Math.max(0, office.costsEur), ROOM_CAP_2022_EUR)
  }
}

/**
 * Entfernungspauschale (§ 9 Abs. 1 Satz 3 Nr. 4 Satz 2 EStG, by § 4 Abs. 5 Satz 1 Nr. 6): 0,30 € for the
 * first 20 km and 0,38 € from the 21st until 2025, 0,38 € from the first km from 2026
 * (Steueränderungsgesetz 2025). The 4.500 € cap does not apply to trips by car, the case here.
 */
export function commuteAllowance(year: number, distanceKm: number, days: number): number {
  const c = getTaxYearParameters(year).commute
  const km = Math.max(0, Math.floor(distanceKm))
  const perDay = Math.min(km, c.firstKmThreshold) * c.rateFirstEur + Math.max(0, km - c.firstKmThreshold) * c.rateAdditionalEur
  return cents(Math.max(0, Math.floor(days)) * perDay)
}
