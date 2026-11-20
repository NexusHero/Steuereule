import { commuteAllowance } from './profit'

/**
 * Private use of a business car (ADR-0101 §22): the Entnahme of the income tax (§ 6 Abs. 1 Nr. 4
 * Satz 2, 3 EStG), the non-deductible trips between home and business (§ 4 Abs. 5 Satz 1 Nr. 6 EStG)
 * and the unentgeltliche Wertabgabe of the VAT (§ 3 Abs. 9a Nr. 1 UStG, Abschn. 15.23 Abs. 5 UStAE).
 * Sources: docs/research/selbststaendige-erweiterung.md §1.
 */

export type CarDrive = 'verbrenner' | 'elektro' | 'hybrid'

export interface CarFacts {
  readonly drive: CarDrive
  /** Acquisition (or first lease) date, ISO. */
  readonly acquired: string
  /** Inländischer Bruttolistenpreis at first registration with the extras, VAT included. */
  readonly listPriceGrossEur: number
  /** From the Übereinstimmungsbescheinigung, for a plug-in hybrid. */
  readonly co2GPerKm?: number | undefined
  readonly electricRangeKm?: number | undefined
  /** Battery capacity in kWh, for the battery deduction of a car bought before 2023 without a fraction (Satz 2 Nr. 1). */
  readonly batteryKwh?: number | undefined
}

/**
 * § 6 Abs. 1 Nr. 4 Satz 2 Nr. 1 EStG: an electric or plug-in hybrid car bought before 1.1.2023 that takes no
 * fraction (Nr. 2–4) has its list price cut by the battery: 500 € per kWh for one bought up to 2013, 50 € less for
 * each later year; at most 10.000 €, 500 € less each later year (2022: 50 €/kWh, at most 5.500 €).
 */
export function batteryDeductionEur(car: CarFacts): number {
  if (car.drive === 'verbrenner' || car.acquired >= '2023-01-01' || !(car.batteryKwh && car.batteryKwh > 0)) return 0
  if (listPriceFactor(car) !== 1) return 0
  const later = Math.max(0, Number(car.acquired.slice(0, 4)) - 2013)
  const perKwh = Math.max(0, 500 - 50 * later)
  const cap = Math.max(0, 10_000 - 500 * later)
  return Math.min(cap, perKwh * car.batteryKwh, car.listPriceGrossEur)
}

/** The electric car's list-price cap by acquisition date (§ 6 Abs. 1 Nr. 4 Satz 2 Nr. 3, § 52 Abs. 12 Satz 5, 6 EStG). */
function electricCapEur(acquired: string): number {
  if (acquired <= '2023-12-31') return 60_000
  if (acquired <= '2025-06-30') return 70_000
  return 100_000
}

/** The minimal electric range of a plug-in hybrid by acquisition date (Satz 2 Nr. 2, 4, 5). */
function hybridRangeKm(acquired: string): number {
  if (acquired <= '2021-12-31') return 40
  if (acquired <= '2024-12-31') return 60
  return 80
}

/**
 * The part of the list price the income tax takes: a quarter for an electric car up to the cap, half
 * above it and for a qualifying hybrid, for acquisitions 2019–2030 (BMF 05.11.2021 Rn. 11); else all.
 */
export function listPriceFactor(car: CarFacts): number {
  if (car.acquired < '2019-01-01' || car.acquired > '2030-12-31') return 1
  if (car.drive === 'elektro') return car.listPriceGrossEur <= electricCapEur(car.acquired) ? 0.25 : 0.5
  if (car.drive === 'hybrid') {
    const clean = (car.co2GPerKm !== undefined && car.co2GPerKm <= 50) || (car.electricRangeKm !== undefined && car.electricRangeKm >= hybridRangeKm(car.acquired))
    return clean ? 0.5 : 1
  }
  return 1
}

export interface CompanyCarInput extends CarFacts {
  readonly year: number
  /** More than half of the use is business (Rn. 4–7 BMF 18.11.2009): the 1 % rule needs it. */
  readonly businessShareOver50: boolean
  /** Months of the year the car was in the business assets (1–12). */
  readonly monthsInBusiness: number
  readonly method: 'pauschal' | 'fahrtenbuch'
  /** Gesamtkosten of the car in the year, AfA included: the cap, and the basis of the logbook method. */
  readonly totalCostsEur?: number | undefined
  /** The AfA inside `totalCostsEur`: an electric or hybrid car counts it at its fraction, by logbook and in the Kostendeckelung (BMF 05.11.2021 Rn. 13). */
  readonly depreciationEur?: number | undefined
  /** Leasing rates inside `totalCostsEur`: by logbook an electric or hybrid car counts them at its fraction (Satz 3 Nr. 2–5). */
  readonly leasingEur?: number | undefined
  /** By logbook: the private share of the kilometres (0–1). */
  readonly privateShare?: number | undefined
  /** By logbook: the kilometres of the year, for the actual cost of the trips home–business. */
  readonly totalKm?: number | undefined
  /** By logbook: the costs that carried input VAT, the VAT base of the private share. */
  readonly costsWithInputVatEur?: number | undefined
  /** Trips between home and business with this car. */
  readonly commute?: { readonly distanceKm: number; readonly days: number } | undefined
  /** False for a Kleinunternehmer or a business without input VAT deduction: no Wertabgabe. */
  readonly vatDeductible?: boolean | undefined
}

export type CompanyCarResult =
  | {
      readonly kind: 'berechnet'
      readonly method: 'pauschal' | 'fahrtenbuch'
      readonly factor: number
      /** The list price after the fraction, rounded down to full 100 € (BMF 05.11.2021 Rn. 12). */
      readonly assessedListPriceEur: number
      /** The Entnahme of the year (Anlage EÜR: private Kfz-Nutzung). */
      readonly privateUseEur: number
      readonly commute: { readonly valueEur: number; readonly allowanceEur: number; readonly nonDeductibleEur: number } | null
      /** The Kostendeckelung took effect (BMF 18.11.2009 Rn. 18). */
      readonly capped: boolean
      /** The Wertabgabe: net base with 19 %, and the part without VAT; null without input VAT deduction. */
      readonly vat: { readonly baseEur: number; readonly vatEur: number; readonly freeOfVatEur: number } | null
    }
  | { readonly kind: 'nicht_zulaessig'; readonly reason: 'betriebliche_nutzung_bis_50' }
  | { readonly kind: 'offen'; readonly missing: readonly ('gesamtkosten' | 'privatanteil')[] }

const cents = (value: number) => Math.round(value * 100) / 100
const VAT_RATE = 0.19
/** Abschn. 15.23 Abs. 5 UStAE: 20 % of the 1 % value for the costs without input VAT. */
const NO_INPUT_VAT_SHARE = 0.2

export function companyCarUse(input: CompanyCarInput): CompanyCarResult {
  const months = Math.min(12, Math.max(0, Math.floor(input.monthsInBusiness)))
  const factor = listPriceFactor(input)
  const battery = batteryDeductionEur(input)
  const assessedListPriceEur = Math.floor(((input.listPriceGrossEur - battery) * factor) / 100) * 100
  // The share of the AfA (and by logbook the leasing) the income tax takes: the fraction, or the list price less the battery.
  const costShare = input.listPriceGrossEur > 0 ? (factor * (input.listPriceGrossEur - battery)) / input.listPriceGrossEur : factor
  const vatDeductible = input.vatDeductible !== false

  if (input.method === 'pauschal') {
    if (!input.businessShareOver50) return { kind: 'nicht_zulaessig', reason: 'betriebliche_nutzung_bis_50' }
    let privateUseEur = cents(assessedListPriceEur * 0.01 * months)
    let commute = input.commute ? commuteOf(input.year, assessedListPriceEur * 0.0003 * input.commute.distanceKm * months, input.commute) : null
    let capped = false
    // BMF 05.11.2021 Rn. 13: for the comparison the AfA inside the total costs counts at the same fraction as the list price.
    const capCostsEur = input.totalCostsEur === undefined ? undefined : input.totalCostsEur - (input.depreciationEur ?? 0) * (1 - costShare)
    if (capCostsEur !== undefined && privateUseEur + (commute?.nonDeductibleEur ?? 0) > capCostsEur) {
      capped = true
      const total = Math.max(0, capCostsEur)
      const commuteNon = Math.min(commute?.nonDeductibleEur ?? 0, total)
      if (commute) commute = { ...commute, nonDeductibleEur: cents(commuteNon) }
      privateUseEur = cents(total - commuteNon)
    }
    // The VAT takes the full list price, the fractions are income tax only (Abschn. 15.23 Abs. 5 UStAE).
    const fullValue = Math.floor(input.listPriceGrossEur / 100) * 100 * 0.01 * months
    // The Wertabgabe cannot exceed the car's total costs either; the VAT compares them unreduced.
    const vat = vatDeductible ? wertabgabe(Math.min(fullValue, Math.max(0, input.totalCostsEur ?? fullValue))) : null
    return { kind: 'berechnet', method: 'pauschal', factor, assessedListPriceEur, privateUseEur, commute, capped, vat }
  }

  const missing = [...(input.totalCostsEur === undefined ? (['gesamtkosten'] as const) : []), ...(input.privateShare === undefined ? (['privatanteil'] as const) : [])]
  if (missing.length > 0) return { kind: 'offen', missing }
  // By logbook an electric or hybrid car counts its AfA and leasing at the fraction (Satz 3 Nr. 2–5), one with the
  // battery deduction its AfA without the battery (Satz 3 Nr. 1).
  const leasing = battery > 0 ? 0 : (input.leasingEur ?? 0)
  const costs = Math.max(0, input.totalCostsEur! - ((input.depreciationEur ?? 0) + leasing) * (1 - costShare))
  const share = Math.min(1, Math.max(0, input.privateShare!))
  const privateUseEur = cents(costs * share)
  // By logbook the trips cost what they cost: per km of the year, both ways (§ 4 Abs. 5 Satz 1 Nr. 6 Satz 3 EStG).
  const perKm = input.totalKm !== undefined && input.totalKm > 0 ? costs / input.totalKm : 0
  const commute = input.commute ? commuteOf(input.year, perKm * input.commute.distanceKm * 2 * input.commute.days, input.commute) : null
  const vat = vatDeductible ? { baseEur: cents((input.costsWithInputVatEur ?? 0) * share), vatEur: cents((input.costsWithInputVatEur ?? 0) * share * VAT_RATE), freeOfVatEur: 0 } : null
  return { kind: 'berechnet', method: 'fahrtenbuch', factor, assessedListPriceEur, privateUseEur, commute, capped: false, vat }
}

/** The commute value against the Entfernungspauschale: only the excess is not deductible. */
function commuteOf(year: number, valueEur: number, trips: { readonly distanceKm: number; readonly days: number }) {
  const allowanceEur = commuteAllowance(year, trips.distanceKm, trips.days)
  return { valueEur: cents(valueEur), allowanceEur, nonDeductibleEur: cents(Math.max(0, valueEur - allowanceEur)) }
}

function wertabgabe(valueEur: number) {
  const baseEur = cents(valueEur * (1 - NO_INPUT_VAT_SHARE))
  return { baseEur, vatEur: cents(baseEur * VAT_RATE), freeOfVatEur: cents(valueEur - baseEur) }
}
