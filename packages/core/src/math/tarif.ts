export type IncomeTaxYear = 2022 | 2023 | 2024 | 2025 | 2026

export interface TariffCoefficients {
  readonly basicAllowance: number
  readonly zone2Upper: number
  readonly zone2C1: number
  readonly zone2C2: number
  readonly zone3Upper: number
  readonly zone3C1: number
  readonly zone3C2: number
  readonly zone3Const: number
  readonly zone4Upper: number
  readonly zone4Rate: number
  readonly zone4Sub: number
  readonly zone5Rate: number
  readonly zone5Sub: number
}

export const TAX_YEARS: Readonly<Record<IncomeTaxYear, TariffCoefficients>> = {
  2022: {
    basicAllowance: 10347,
    zone2Upper: 14926,
    zone2C1: 1088.67,
    zone2C2: 1400,
    zone3Upper: 58596,
    zone3C1: 206.43,
    zone3C2: 2397,
    zone3Const: 869.32,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 9336.45,
    zone5Rate: 0.45,
    zone5Sub: 17671.2,
  },
  2023: {
    basicAllowance: 10908,
    zone2Upper: 15999,
    // § 32a EStG 2023 (Inflationsausgleichsgesetz): 979,18 / 192,59 / 966,53. The 2021 values
    // stood here before and overstated the tax between 10.909 € and 62.809 € (#450 Teil 6).
    zone2C1: 979.18,
    zone2C2: 1400,
    zone3Upper: 62809,
    zone3C1: 192.59,
    zone3C2: 2397,
    zone3Const: 966.53,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 9972.98,
    zone5Rate: 0.45,
    zone5Sub: 18307.73,
  },
  2024: {
    basicAllowance: 11784,
    zone2Upper: 17005,
    zone2C1: 954.8,
    zone2C2: 1400,
    zone3Upper: 66760,
    zone3C1: 181.19,
    zone3C2: 2397,
    zone3Const: 991.21,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 10636.31,
    zone5Rate: 0.45,
    zone5Sub: 18971.06,
  },
  2025: {
    basicAllowance: 12096,
    zone2Upper: 17443,
    zone2C1: 932.3,
    zone2C2: 1400,
    zone3Upper: 68480,
    zone3C1: 176.64,
    zone3C2: 2397,
    zone3Const: 1015.13,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 10911.92,
    zone5Rate: 0.45,
    zone5Sub: 19246.67,
  },
  2026: {
    basicAllowance: 12348,
    zone2Upper: 17799,
    zone2C1: 914.51,
    zone2C2: 1400,
    zone3Upper: 69878,
    zone3C1: 173.1,
    zone3C2: 2397,
    zone3Const: 1034.87,
    zone4Upper: 277825,
    zone4Rate: 0.42,
    zone4Sub: 11135.63,
    zone5Rate: 0.45,
    zone5Sub: 19470.38,
  },
}

/** Solidaritätszuschlag-Freigrenzen (§3 Abs. 3 SolZG) je Jahr: Einzel- / Zusammenveranlagung. */
export interface SoliExemptionLimits {
  readonly single: number
  readonly joint: number
}

const SOLI_EXEMPTION_LIMITS: Readonly<Record<IncomeTaxYear, SoliExemptionLimits>> = {
  2022: { single: 16956, joint: 33912 },
  2023: { single: 17543, joint: 35086 },
  2024: { single: 18130, joint: 36260 },
  2025: { single: 19950, joint: 39900 },
  2026: { single: 20350, joint: 40700 },
}

const SOLI_RATE = 0.055
const SOLI_RELIEF_RATE = 0.119

export type ChurchTaxFactor = 0 | 0.08 | 0.09

export function soliExemptionLimits(year: IncomeTaxYear): SoliExemptionLimits {
  return SOLI_EXEMPTION_LIMITS[year]
}

export function isSupportedIncomeTaxYear(year: number): year is IncomeTaxYear {
  return Number.isInteger(year) && Object.prototype.hasOwnProperty.call(TAX_YEARS, year)
}

export function zoneBoundaries(year: IncomeTaxYear): readonly [number, number, number] {
  const c = TAX_YEARS[year]
  return [c.zone2Upper, c.zone3Upper, c.zone4Upper]
}

function basicTariff(zvE: number, c: TariffCoefficients): number {
  if (zvE <= c.basicAllowance) return 0
  if (zvE <= c.zone2Upper) {
    const y = (zvE - c.basicAllowance) / 10000
    return (c.zone2C1 * y + c.zone2C2) * y
  }
  if (zvE <= c.zone3Upper) {
    const z = (zvE - c.zone2Upper) / 10000
    return (c.zone3C1 * z + c.zone3C2) * z + c.zone3Const
  }
  if (zvE <= c.zone4Upper) {
    return c.zone4Rate * zvE - c.zone4Sub
  }
  return c.zone5Rate * zvE - c.zone5Sub
}

export function incomeTax(taxableIncome: number, year: number): number {
  if (!Number.isFinite(taxableIncome)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (taxableIncome < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }

  const zvE = Math.floor(taxableIncome)
  return Math.floor(basicTariff(zvE, TAX_YEARS[year]))
}

export function splittingTariff(zveA: number, zveB: number, year: number): number {
  if (!Number.isFinite(zveA) || !Number.isFinite(zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zveA < 0 || zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }
  const half = Math.floor((zveA + zveB) / 2)
  return 2 * incomeTax(half, year)
}

/**
 * Income tax under the progression clause (§ 32b EStG): wage replacement benefits (Arbeitslosengeld,
 * Elterngeld, Krankengeld …) are not taxed, but the rate of tax on the remaining taxable income is
 * the average rate that taxable income plus those benefits would bear (Abs. 2). The special rate is
 * used unrounded and the tax rounded down to whole euros like the tariff; how the tax office
 * rounds the rate is not checked against the law here.
 */
export function progressionClauseTax(zvE: number, exemptIncome: number, year: number, splitting = false): number {
  if (!Number.isFinite(exemptIncome) || exemptIncome < 0) {
    throw new RangeError('exemptIncome must be a non-negative finite number')
  }
  const tariff = (value: number) => (splitting ? splittingTariff(value, 0, year) : incomeTax(value, year))
  const base = Math.floor(zvE)
  const extra = Math.floor(exemptIncome)
  if (extra === 0) return tariff(base)
  const widened = base + extra
  if (base <= 0) return 0
  return Math.floor((base * tariff(widened)) / widened)
}


export function solidaritaetszuschlag(assessmentBasis: number, exemptionLimit: number): number {
  if (!Number.isFinite(assessmentBasis) || !Number.isFinite(exemptionLimit)) {
    throw new RangeError('bemessungsgrundlage and freigrenze must be finite numbers')
  }
  if (assessmentBasis < 0 || exemptionLimit < 0) {
    throw new RangeError('bemessungsgrundlage and freigrenze must not be negative')
  }
  const base = Math.floor(assessmentBasis)
  if (base <= exemptionLimit) return 0
  const full = SOLI_RATE * base
  const reduced = SOLI_RELIEF_RATE * (base - exemptionLimit)
  return Math.floor(Math.min(full, reduced))
}

export function kirchensteuer(incomeTaxAmount: number, factor: ChurchTaxFactor): number {
  if (!Number.isFinite(incomeTaxAmount) || incomeTaxAmount < 0) {
    throw new RangeError('einkommensteuer must be a non-negative finite number')
  }
  if (factor !== 0 && factor !== 0.08 && factor !== 0.09) {
    throw new RangeError('faktor must be one of 0, 0.08, 0.09')
  }
  return Math.floor(incomeTaxAmount * factor)
}
