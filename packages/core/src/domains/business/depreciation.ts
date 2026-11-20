import type { EuerKey } from './euer-keys'

/**
 * Abschreibung for the self-employed (ADR-0101 decision 7): low value assets and the pool, linear
 * and degressive AfA, buildings, and the § 7g pair of Investitionsabzugsbetrag and Sonder-AfA. The
 * output is plain data per asset and year, so the bookkeeping can book it without knowing the rules.
 *
 * Dates are ISO strings (YYYY-MM-DD); amounts are net euros (the Kleinunternehmer's costs include
 * the VAT he cannot deduct, § 9b EStG — the caller passes what the asset cost him).
 */

export interface UsefulLife {
  readonly label: string
  readonly years: number
  readonly source: string
}

const AFA_AV = 'AfA-Tabelle AV (BMF 15.12.2000, IV D 2 - S 1551 - 188/00, BStBl I S. 1532)'
const DIGITAL = 'BMF 22.02.2022 (IV C 3 - S 2190/21/10002 :025), Tz. 1.1'

/**
 * The assets the self-employed really buy, with the official useful life. Computer hardware and
 * software: one year since the BMF letter of 26.02.2021, replaced by the one of 22.02.2022, which
 * overrides the 3 years of AfA-Tabelle AV 6.14.3.2 and the 5 years for ERP software.
 */
export const USEFUL_LIVES = {
  computer: { label: 'Computer, Notebook und Peripherie (Drucker, Monitor, Scanner)', years: 1, source: DIGITAL },
  software: { label: 'Betriebs- und Anwendersoftware', years: 1, source: DIGITAL },
  mobile_phone: { label: 'Mobiltelefon', years: 5, source: `${AFA_AV} 6.13.2.2` },
  telephone: { label: 'Telefon, Kommunikationsendgerät', years: 8, source: `${AFA_AV} 6.13.2.1` },
  fax: { label: 'Faxgerät', years: 6, source: `${AFA_AV} 6.13.3` },
  camera_audio_video: { label: 'Foto-, Film-, Video- und Audiogerät', years: 7, source: `${AFA_AV} 6.14.4` },
  projector: { label: 'Beamer, Präsentationsgerät', years: 8, source: `${AFA_AV} 6.14.6` },
  copier: { label: 'Kopiergerät', years: 7, source: `${AFA_AV} 6.14.10` },
  cash_register: { label: 'Registrierkasse', years: 6, source: `${AFA_AV} 6.14.7` },
  card_reader: { label: 'Kartenleser (EC, Kredit)', years: 8, source: `${AFA_AV} 6.14.14` },
  shredder: { label: 'Aktenvernichter', years: 8, source: `${AFA_AV} 6.14.13` },
  office_furniture: { label: 'Büromöbel', years: 13, source: `${AFA_AV} 6.15` },
  steel_cabinet: { label: 'Stahlschrank', years: 14, source: `${AFA_AV} 6.19.1` },
  safe: { label: 'Tresor', years: 23, source: `${AFA_AV} 6.19.2` },
  carpet: { label: 'Teppich', years: 8, source: `${AFA_AV} 6.19.4.1` },
  car: { label: 'Pkw, Kombi', years: 6, source: `${AFA_AV} 4.2.1` },
  motorcycle_bicycle: { label: 'Motorrad, Motorroller, Fahrrad', years: 7, source: `${AFA_AV} 4.2.2` },
  truck: { label: 'Lkw', years: 9, source: `${AFA_AV} 4.2.3` },
  trailer: { label: 'Anhänger', years: 11, source: `${AFA_AV} 4.2.6` },
  forklift: { label: 'Stapler, Hubwagen, Elektrokarren', years: 8, source: `${AFA_AV} 4.5` },
  workshop_equipment: { label: 'Werkstatt-, Labor- und Lagereinrichtung', years: 14, source: `${AFA_AV} 6.1` },
  shop_fittings: { label: 'Ladeneinrichtung', years: 8, source: `${AFA_AV} 6.2` },
  shop_installations: { label: 'Laden- und Gaststätteneinbauten', years: 8, source: `${AFA_AV} 3.7` },
  trade_fair_stand: { label: 'Messestand', years: 6, source: `${AFA_AV} 6.3` },
  air_conditioner: { label: 'Klimagerät (mobil)', years: 11, source: `${AFA_AV} 6.5` },
  fridge: { label: 'Kühlschrank', years: 10, source: `${AFA_AV} 7.7` },
  dishwasher: { label: 'Geschirrspülmaschine', years: 7, source: `${AFA_AV} 7.2.3` },
  washing_machine: { label: 'Waschmaschine', years: 10, source: `${AFA_AV} 7.2.10` },
  microwave: { label: 'Mikrowelle', years: 8, source: `${AFA_AV} 7.9` },
  drill_mobile: { label: 'Bohrmaschine (mobil)', years: 8, source: `${AFA_AV} 5.3.2` },
  drill_stationary: { label: 'Bohrmaschine (stationär)', years: 16, source: `${AFA_AV} 5.3.1` },
  saw_mobile: { label: 'Säge (mobil)', years: 8, source: `${AFA_AV} 5.14.2` },
  saw_stationary: { label: 'Säge (stationär)', years: 14, source: `${AFA_AV} 5.14.1` },
  grinder_mobile: { label: 'Schleifmaschine (mobil)', years: 8, source: `${AFA_AV} 5.17.2` },
  welding: { label: 'Schweiß- und Lötgerät', years: 13, source: `${AFA_AV} 5.20` },
  machine_other: { label: 'Sonstige Be- und Verarbeitungsmaschine', years: 13, source: `${AFA_AV} 5.27` },
  pressure_washer: { label: 'Hochdruckreiniger', years: 8, source: `${AFA_AV} 7.2.4` },
  alarm_system: { label: 'Alarm- und Überwachungsanlage', years: 11, source: `${AFA_AV} 3.10.6` },
  photovoltaic: { label: 'Photovoltaikanlage', years: 20, source: `${AFA_AV} 3.1.6` },
  container: { label: 'Büro- oder Baucontainer', years: 10, source: `${AFA_AV} 3.6` },
  lab_equipment: { label: 'Laborgerät (Mikroskop, Präzisionswaage)', years: 13, source: `${AFA_AV} 7.8` },
  vending_machine: { label: 'Warenautomat', years: 5, source: `${AFA_AV} 7.4.2` },
} as const satisfies Record<string, UsefulLife>

export type AssetCategory = keyof typeof USEFUL_LIVES

/** § 6 Abs. 2 EStG: GWG up to 800 € net (for assets acquired after 31.12.2017, § 52 Abs. 12 EStG). */
export const GWG_LIMIT_EUR = 800
/** § 6 Abs. 2a Satz 4 EStG: up to 250 € the costs may always go to expense at once. */
export const IMMEDIATE_EXPENSE_LIMIT_EUR = 250
/** § 6 Abs. 2a Satz 1 EStG: the pool takes assets above 250 € up to 1.000 €. */
export const POOL_LIMIT_EUR = 1000

/** The choice of a year (§ 6 Abs. 2a Satz 5 EStG: one choice for all assets of a Wirtschaftsjahr). */
export type LowValueChoice = 'gwg' | 'sammelposten'

export type LowValueTreatment = 'sofort' | 'gwg' | 'sammelposten' | 'aktivieren'

/** Where an asset goes under the year's choice; 'aktivieren' means regular AfA. */
export function lowValueTreatment(netCostEur: number, choice: LowValueChoice): LowValueTreatment {
  if (netCostEur <= IMMEDIATE_EXPENSE_LIMIT_EUR) return 'sofort'
  if (choice === 'gwg') return netCostEur <= GWG_LIMIT_EUR ? 'gwg' : 'aktivieren'
  return netCostEur <= POOL_LIMIT_EUR ? 'sammelposten' : 'aktivieren'
}

export interface PoolYear {
  readonly year: number
  readonly amountEur: number
}

/**
 * § 6 Abs. 2a Satz 2 and 3 EStG: the pool of a year is released by one fifth in that year and the
 * four following ones; a disposal does not reduce it.
 */
export function poolSchedule(poolYear: number, totalEur: number): PoolYear[] {
  const fifth = roundCents(totalEur / 5)
  return [0, 1, 2, 3, 4].map((offset) => ({ year: poolYear + offset, amountEur: offset === 4 ? roundCents(totalEur - 4 * fifth) : fifth }))
}

export interface DegressiveRate {
  readonly rate: number
  readonly multiple: number
  readonly cap: number
}

/**
 * § 7 Abs. 2 EStG allows the degressive AfA of movable assets only for acquisitions in three windows
 * (§ 52 Abs. 15 Satz 4 EStG): 2020–2022 at 2,5 × linear and at most 25 % (Zweites Corona-Steuerhilfe-
 * gesetz, extended by the Vierte), 1.4.–31.12.2024 at 2 × and 20 % (Wachstumschancengesetz of
 * 27.03.2024), and 1.7.2025–31.12.2027 at 3 × and 30 % (Investitionssofortprogramm of 14.07.2025).
 * Outside these windows it returns null: 2023, 1.1.–31.3.2024 and 1.1.–30.6.2025 have none.
 */
export function degressiveRate(acquired: string, usefulLifeYears: number): DegressiveRate | null {
  const window =
    acquired >= '2020-01-01' && acquired <= '2022-12-31'
      ? { multiple: 2.5, cap: 0.25 }
      : acquired >= '2024-04-01' && acquired <= '2024-12-31'
        ? { multiple: 2, cap: 0.2 }
        : acquired >= '2025-07-01' && acquired <= '2027-12-31'
          ? { multiple: 3, cap: 0.3 }
          : null
  if (!window || usefulLifeYears <= 0) return null
  return { ...window, rate: Math.min(window.multiple / usefulLifeYears, window.cap) }
}

export type BuildingUse = 'betrieb' | 'wohnen'

/**
 * § 7 Abs. 4 Satz 1 EStG: 3 % for a building in business assets not used for living (Nr. 1), 3 % for
 * a residential building completed after 31.12.2022 (Nr. 2 a, Jahressteuergesetz 2022), 2 % for one
 * completed 1925–2022 (Nr. 2 b) and 2,5 % before 1925 (Nr. 2 c).
 */
export function buildingRate(use: BuildingUse, completed: string): number {
  if (use === 'betrieb') return 0.03
  if (completed > '2022-12-31') return 0.03
  return completed < '1925-01-01' ? 0.025 : 0.02
}

/** § 7 Abs. 5a EStG: 5 % of the book value for residential buildings begun 1.10.2023–30.9.2029. */
export function buildingDegressiveAllowed(constructionStarted: string): boolean {
  return constructionStarted >= '2023-10-01' && constructionStarted <= '2029-09-30'
}

export type DepreciationMethod = 'linear' | 'degressive' | 'building' | 'building_degressive' | 'gwg' | 'sofort'

export interface SpecialDepreciation {
  readonly year: number
  readonly amountEur: number
}

export interface DepreciableAsset {
  readonly id: string
  readonly acquired: string
  readonly netCostEur: number
  readonly method: DepreciationMethod
  /** Required for linear and degressive; ignored for buildings. */
  readonly usefulLifeYears?: number | undefined
  /** For 'building': the yearly rate (see `buildingRate`). */
  readonly buildingRate?: number | undefined
  /** For 'building_degressive': when construction began (§ 7 Abs. 5a EStG). */
  readonly constructionStarted?: string | undefined
  /**
   * BMF 22.02.2022 Tz. 1.4: for a one-year useful life the office does not object to the full AfA in
   * the year of acquisition instead of by months. Default true for a one-year life.
   */
  readonly fullFirstYear?: boolean | undefined
  /** § 7g Abs. 2 Satz 2 EStG: costs cut by up to 50 % (at most the IAB added back), an expense in the acquisition year. */
  readonly iabCostReductionEur?: number | undefined
  /** § 7g Abs. 5 EStG: the Sonder-AfA the user takes, in the acquisition year and the four after it. */
  readonly specialDepreciation?: readonly SpecialDepreciation[] | undefined
  readonly disposal?: { readonly date: string; readonly proceedsEur: number } | undefined
}

export interface AssetYear {
  readonly assetId: string
  readonly year: number
  readonly method: DepreciationMethod
  readonly openingBookValueEur: number
  /** The regular AfA (linear, degressive, building) or the full write-off of a GWG. */
  readonly depreciationEur: number
  readonly specialDepreciationEur: number
  readonly costReductionEur: number
  readonly closingBookValueEur: number
  /** In the year of disposal: the Restbuchwert is an expense, the proceeds income. */
  readonly disposal: { readonly date: string; readonly residualBookValueEur: number; readonly proceedsEur: number } | null
}

/** § 7g Abs. 5 EStG: 20 % for assets acquired up to 31.12.2023, 40 % after (§ 52 Abs. 16 Satz 6 EStG). */
export function specialDepreciationRate(acquired: string): number {
  return acquired > '2023-12-31' ? 0.4 : 0.2
}

const roundCents = (value: number) => Math.round(value * 100) / 100

function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

function monthOf(date: string): number {
  return Number(date.slice(5, 7))
}

/**
 * The asset's schedule from the acquisition year up to `lastYear` (or its disposal). The AfA runs
 * by months: the acquisition month counts in full (§ 7 Abs. 1 Satz 4 EStG), the disposal month too
 * (R 7.4 Abs. 8 EStR). Linear AfA beside a § 7g Sonder-AfA keeps its base until the five-year period
 * ends, then the rest is spread over the remaining life (§ 7a Abs. 9 EStG).
 */
export function assetSchedule(asset: DepreciableAsset, lastYear: number): AssetYear[] {
  validate(asset)
  const startYear = yearOf(asset.acquired)
  const startMonth = monthOf(asset.acquired)
  const reduction = asset.iabCostReductionEur ?? 0
  const base = roundCents(asset.netCostEur - reduction)
  const totalMonths = Math.round((asset.usefulLifeYears ?? 0) * 12)
  const degressive = asset.method === 'degressive' ? degressiveRate(asset.acquired, asset.usefulLifeYears ?? 0) : null
  const special = new Map((asset.specialDepreciation ?? []).map((s) => [s.year, s.amountEur]))
  const disposalYear = asset.disposal ? yearOf(asset.disposal.date) : null
  const endYear = disposalYear === null ? lastYear : Math.min(lastYear, disposalYear)

  const rows: AssetYear[] = []
  let book = asset.netCostEur
  let elapsedMonths = 0
  for (let year = startYear; year <= endYear; year++) {
    const opening = book
    const costReduction = year === startYear ? reduction : 0
    book = roundCents(book - costReduction)
    const fromMonth = year === startYear ? startMonth : 1
    const toMonth = year === disposalYear ? monthOf(asset.disposal?.date ?? '') : 12
    const months = Math.max(0, toMonth - fromMonth + 1)
    const specialEur = Math.min(book, special.get(year) ?? 0)
    let regular = 0
    switch (asset.method) {
      case 'gwg':
      case 'sofort':
        regular = year === startYear ? book : 0
        break
      case 'linear': {
        const remaining = Math.max(0, totalMonths - elapsedMonths)
        const usedMonths = Math.min(months, remaining)
        if (totalMonths === 12 && (asset.fullFirstYear ?? true)) regular = year === startYear ? book : 0
        else if (special.size > 0 && year > startYear + 4) regular = remaining > 0 ? (book - specialEur) * (usedMonths / remaining) : book
        else regular = remaining <= usedMonths ? book - specialEur : (base * usedMonths) / totalMonths
        elapsedMonths += usedMonths
        break
      }
      case 'degressive': {
        const remaining = Math.max(0, totalMonths - elapsedMonths)
        const usedMonths = Math.min(months, remaining)
        const afterSpecial = book - specialEur
        // § 7 Abs. 3 EStG: the change to linear AfA on the rest is allowed, so take it once it gives more.
        const degressiveAmount = afterSpecial * (degressive?.rate ?? 0) * (usedMonths / 12)
        const linearRest = remaining > 0 ? afterSpecial * (usedMonths / remaining) : afterSpecial
        regular = remaining <= usedMonths ? afterSpecial : Math.max(degressiveAmount, linearRest)
        elapsedMonths += usedMonths
        break
      }
      case 'building':
        regular = (base * (asset.buildingRate ?? 0) * months) / 12
        break
      case 'building_degressive':
        regular = ((book - specialEur) * 0.05 * months) / 12
        break
    }
    regular = Math.min(roundCents(regular), roundCents(book - specialEur))
    book = roundCents(book - specialEur - regular)
    const disposal =
      year === disposalYear && asset.disposal ? { date: asset.disposal.date, residualBookValueEur: book, proceedsEur: asset.disposal.proceedsEur } : null
    rows.push({
      assetId: asset.id,
      year,
      method: asset.method,
      openingBookValueEur: opening,
      depreciationEur: regular,
      specialDepreciationEur: roundCents(specialEur),
      costReductionEur: costReduction,
      closingBookValueEur: disposal ? 0 : book,
      disposal,
    })
    if (disposal) break
  }
  return rows
}

function validate(asset: DepreciableAsset): void {
  if (!(asset.netCostEur > 0)) throw new RangeError('the costs must be positive')
  if ((asset.method === 'linear' || asset.method === 'degressive') && !((asset.usefulLifeYears ?? 0) > 0)) {
    throw new RangeError('linear and degressive AfA need a useful life')
  }
  if (asset.method === 'gwg' && asset.netCostEur > GWG_LIMIT_EUR) throw new RangeError('a GWG costs at most 800 € net (§ 6 Abs. 2 EStG)')
  if (asset.method === 'sofort' && asset.netCostEur > IMMEDIATE_EXPENSE_LIMIT_EUR) throw new RangeError('only up to 250 € go to expense at once (§ 6 Abs. 2a Satz 4 EStG)')
  if (asset.method === 'degressive' && degressiveRate(asset.acquired, asset.usefulLifeYears ?? 0) === null) {
    throw new RangeError(`no degressive AfA for an acquisition on ${asset.acquired} (§ 7 Abs. 2 EStG)`)
  }
  if (asset.method === 'building_degressive' && !buildingDegressiveAllowed(asset.constructionStarted ?? '')) {
    throw new RangeError('the 5 % building AfA needs a construction start 1.10.2023–30.9.2029 (§ 7 Abs. 5a EStG)')
  }
  const reduction = asset.iabCostReductionEur ?? 0
  if (reduction < 0 || reduction > asset.netCostEur * 0.5) throw new RangeError('the § 7g cost reduction is at most 50 % of the costs')
  const special = asset.specialDepreciation ?? []
  if (special.length > 0) {
    if (asset.method !== 'linear' && asset.method !== 'degressive') throw new RangeError('the § 7g Sonder-AfA applies to movable assets with regular AfA only')
    const start = yearOf(asset.acquired)
    if (special.some((s) => s.year < start || s.year > start + 4)) throw new RangeError('the § 7g Sonder-AfA runs in the acquisition year and the four after it')
    const total = special.reduce((sum, s) => sum + s.amountEur, 0)
    if (total > roundCents((asset.netCostEur - reduction) * specialDepreciationRate(asset.acquired)) + 0.005) {
      throw new RangeError(`the § 7g Sonder-AfA is at most ${specialDepreciationRate(asset.acquired) * 100} % of the costs`)
    }
  }
}

export interface DepreciationYear {
  readonly year: number
  readonly byKey: Partial<Record<EuerKey, number>>
  readonly rows: readonly AssetYear[]
}

/** Everything a year books for its assets and pools, by EÜR key. */
export function depreciationForYear(year: number, assets: readonly DepreciableAsset[], pools: readonly PoolYear[] = []): DepreciationYear {
  const rows = assets.flatMap((asset) => assetSchedule(asset, year).filter((row) => row.year === year))
  const byKey: Partial<Record<EuerKey, number>> = {}
  const add = (key: EuerKey, amount: number) => {
    if (amount !== 0) byKey[key] = roundCents((byKey[key] ?? 0) + amount)
  }
  for (const row of rows) {
    const key: EuerKey =
      row.method === 'gwg' || row.method === 'sofort'
        ? 'ausgaben_gwg'
        : row.method === 'building' || row.method === 'building_degressive'
          ? 'ausgaben_afa_unbeweglich'
          : 'ausgaben_afa_beweglich'
    add(key, row.depreciationEur)
    add('ausgaben_sonder_afa_7g', row.specialDepreciationEur)
    // § 7g Abs. 2 Satz 2 EStG: the cut of the costs has its own EÜR line, apart from the Sonder-AfA.
    add('ausgaben_herabsetzung_7g', row.costReductionEur)
    if (row.disposal) {
      add('ausgaben_restbuchwert_abgang', row.disposal.residualBookValueEur)
      add('einnahmen_veraeusserung_anlagevermoegen', row.disposal.proceedsEur)
    }
  }
  for (const pool of pools) for (const part of poolSchedule(pool.year, pool.amountEur)) if (part.year === year) add('ausgaben_sammelposten', part.amountEur)
  return { year, byKey, rows }
}

/** § 7g Abs. 1 EStG as amended by the Jahressteuergesetz 2020, unchanged for 2022–2026. */
export const IAB_RATE = 0.5
export const IAB_MAX_PER_BUSINESS_EUR = 200_000
export const IAB_PROFIT_LIMIT_EUR = 200_000

export interface InvestmentDeductionInput {
  readonly plannedCostEur: number
  /** The profit of the year before any IAB deduction or addition (§ 7g Abs. 1 Satz 2 Nr. 1 EStG). */
  readonly profitBeforeIabEur: number
  /** IABs of the three years before that are still open (neither added back nor reversed). */
  readonly openDeductionsEur: number
}

export interface InvestmentDeductionLimit {
  readonly maxEur: number
  readonly blockedBy: 'gewinngrenze' | 'hoechstbetrag' | null
}

/**
 * The most the user may deduct: half the planned costs, none when the profit exceeds 200.000 €, and
 * with the still open IABs of the three years before at most 200.000 € (§ 7g Abs. 1 Satz 1, 2 Nr. 1, Satz 4).
 */
export function maxInvestmentDeduction(input: InvestmentDeductionInput): InvestmentDeductionLimit {
  if (input.profitBeforeIabEur > IAB_PROFIT_LIMIT_EUR) return { maxEur: 0, blockedBy: 'gewinngrenze' }
  const room = Math.max(0, IAB_MAX_PER_BUSINESS_EUR - input.openDeductionsEur)
  const wanted = roundCents(Math.max(0, input.plannedCostEur) * IAB_RATE)
  return wanted > room ? { maxEur: room, blockedBy: 'hoechstbetrag' } : { maxEur: wanted, blockedBy: null }
}

/**
 * The last year in which the investment may happen: the third after the deduction (§ 7g Abs. 3 Satz 1
 * EStG); for the Corona years longer (§ 52 Abs. 16 Satz 3–5 EStG): deductions of 2017 until the sixth,
 * of 2018 the fifth, of 2019 the fourth year after — all three end with 2023.
 */
export function investmentDeadlineYear(deductionYear: number): number {
  const extended: Readonly<Record<number, number>> = { 2017: 6, 2018: 5, 2019: 4 }
  return deductionYear + (extended[deductionYear] ?? 3)
}

export interface InvestmentDeductionSettlement {
  /** § 7g Abs. 2 Satz 1: added back in the investment year, up to 50 % of its costs. */
  readonly additions: readonly { readonly year: number; readonly amountEur: number }[]
  /** § 7g Abs. 2 Satz 2: the costs of the asset may be cut by up to the amount added back. */
  readonly maxCostReductionEur: number
  /** § 7g Abs. 3: what is left after the deadline is reversed in the year of the deduction. */
  readonly reversal: { readonly year: number; readonly amountEur: number } | null
  readonly openEur: number
  readonly deadlineYear: number
}

/**
 * Settles one IAB against the investments that followed it. Investments count from the year after the
 * deduction up to the deadline; the reversal is due once `asOfYear` lies past the deadline, and it
 * changes the assessment of the deduction year, not the current one.
 */
export function settleInvestmentDeduction(
  deduction: { readonly year: number; readonly amountEur: number },
  investments: readonly { readonly year: number; readonly costEur: number }[],
  asOfYear: number,
): InvestmentDeductionSettlement {
  const deadlineYear = investmentDeadlineYear(deduction.year)
  let open = deduction.amountEur
  const additions: { year: number; amountEur: number }[] = []
  for (const investment of [...investments].sort((x, y) => x.year - y.year)) {
    if (investment.year <= deduction.year || investment.year > deadlineYear || investment.year > asOfYear || open <= 0) continue
    const amount = roundCents(Math.min(open, investment.costEur * IAB_RATE))
    additions.push({ year: investment.year, amountEur: amount })
    open = roundCents(open - amount)
  }
  const reversal = asOfYear > deadlineYear && open > 0 ? { year: deduction.year, amountEur: open } : null
  return {
    additions,
    maxCostReductionEur: roundCents(additions.reduce((sum, a) => sum + a.amountEur, 0)),
    reversal,
    openEur: reversal ? 0 : open,
    deadlineYear,
  }
}
