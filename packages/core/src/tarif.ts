export type IncomeTaxYear = 2024 | 2025 | 2026

interface TariffCoefficients {
  readonly grundfreibetrag: number
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

const TAX_YEARS: Readonly<Record<IncomeTaxYear, TariffCoefficients>> = {
  2024: {
    grundfreibetrag: 11784,
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
    grundfreibetrag: 12096,
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
    grundfreibetrag: 12348,
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
export interface SoliFreigrenzen {
  readonly einzel: number
  readonly zusammen: number
}

const SOLI_FREIGRENZEN: Readonly<Record<IncomeTaxYear, SoliFreigrenzen>> = {
  2024: { einzel: 18130, zusammen: 36260 },
  2025: { einzel: 19950, zusammen: 39900 },
  2026: { einzel: 20350, zusammen: 40700 },
}

const SOLI_RATE = 0.055
const SOLI_MILDERUNG_RATE = 0.119

export type KirchensteuerFaktor = 0 | 0.08 | 0.09

export function soliFreigrenzen(year: IncomeTaxYear): SoliFreigrenzen {
  return SOLI_FREIGRENZEN[year]
}

export function isSupportedIncomeTaxYear(year: number): year is IncomeTaxYear {
  return Number.isInteger(year) && Object.prototype.hasOwnProperty.call(TAX_YEARS, year)
}

export function zoneBoundaries(year: IncomeTaxYear): readonly [number, number, number] {
  const c = TAX_YEARS[year]
  return [c.zone2Upper, c.zone3Upper, c.zone4Upper]
}

function grundtarif(zvE: number, c: TariffCoefficients): number {
  if (zvE <= c.grundfreibetrag) return 0
  if (zvE <= c.zone2Upper) {
    const y = (zvE - c.grundfreibetrag) / 10000
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

export function incomeTax(zuVersteuerndesEinkommen: number, year: number): number {
  if (!Number.isFinite(zuVersteuerndesEinkommen)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zuVersteuerndesEinkommen < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }

  const zvE = Math.floor(zuVersteuerndesEinkommen)
  return Math.floor(grundtarif(zvE, TAX_YEARS[year]))
}

export function splittingTarif(zveA: number, zveB: number, year: number): number {
  if (!Number.isFinite(zveA) || !Number.isFinite(zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (zveA < 0 || zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${year}`)
  }
  const haelfte = Math.floor((zveA + zveB) / 2)
  return 2 * incomeTax(haelfte, year)
}

export function solidaritaetszuschlag(bemessungsgrundlage: number, freigrenze: number): number {
  if (!Number.isFinite(bemessungsgrundlage) || !Number.isFinite(freigrenze)) {
    throw new RangeError('bemessungsgrundlage and freigrenze must be finite numbers')
  }
  if (bemessungsgrundlage < 0 || freigrenze < 0) {
    throw new RangeError('bemessungsgrundlage and freigrenze must not be negative')
  }
  const base = Math.floor(bemessungsgrundlage)
  if (base <= freigrenze) return 0
  const voll = SOLI_RATE * base
  const gemildert = SOLI_MILDERUNG_RATE * (base - freigrenze)
  return Math.floor(Math.min(voll, gemildert))
}

export function kirchensteuer(einkommensteuer: number, faktor: KirchensteuerFaktor): number {
  if (!Number.isFinite(einkommensteuer) || einkommensteuer < 0) {
    throw new RangeError('einkommensteuer must be a non-negative finite number')
  }
  if (faktor !== 0 && faktor !== 0.08 && faktor !== 0.09) {
    throw new RangeError('faktor must be one of 0, 0.08, 0.09')
  }
  return Math.floor(einkommensteuer * faktor)
}
