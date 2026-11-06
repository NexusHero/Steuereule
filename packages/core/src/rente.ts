import { calculate, type CalculationStatus, type Item } from './berechnung'
import type { IncomeType } from './einkunftsarten'

export type PensionType =
  | 'GesetzlicheRente'
  | 'Betriebsrente'
  | 'PrivateRentenversicherung'
  | 'WitwenWaisenrente'
  | 'AuslaendischeRente'
export const PENSION_TYPES: readonly PensionType[] = [
  'GesetzlicheRente',
  'Betriebsrente',
  'PrivateRentenversicherung',
  'WitwenWaisenrente',
  'AuslaendischeRente',
]

export function isPensionType(value: string): value is PensionType {
  return (PENSION_TYPES as readonly string[]).includes(value)
}

const TAXABLE_SHARE_TABLE: Readonly<Record<number, number>> = {
  2006: 52, 2007: 54, 2008: 56, 2009: 58, 2010: 60,
  2011: 62, 2012: 64, 2013: 66, 2014: 68, 2015: 70,
  2016: 72, 2017: 74, 2018: 76, 2019: 78, 2020: 80,
  2021: 81, 2022: 82,
  2023: 82.5, 2024: 83, 2025: 83.5, 2026: 84, 2027: 84.5, 2028: 85, 2029: 85.5, 2030: 86,
  2031: 86.5, 2032: 87, 2033: 87.5, 2034: 88, 2035: 88.5, 2036: 89, 2037: 89.5, 2038: 90,
  2039: 90.5, 2040: 91, 2041: 91.5, 2042: 92, 2043: 92.5, 2044: 93, 2045: 93.5, 2046: 94,
  2047: 94.5, 2048: 95, 2049: 95.5, 2050: 96, 2051: 96.5, 2052: 97, 2053: 97.5, 2054: 98,
  2055: 98.5, 2056: 99, 2057: 99.5, 2058: 100,
}

export function taxableSharePercent(rentenbeginnJahr: number): number | null {
  if (!Number.isInteger(rentenbeginnJahr) || rentenbeginnJahr < 0) return null
  if (rentenbeginnJahr <= 2005) return 50
  if (rentenbeginnJahr > 2058) return null
  return TAXABLE_SHARE_TABLE[rentenbeginnJahr] ?? null
}

const INCOME_SHARE_TABLE: readonly (readonly [number, number, number])[] = [
  [0, 1, 59], [2, 3, 58], [4, 5, 57], [6, 8, 56], [9, 10, 55],
  [11, 12, 54], [13, 14, 53], [15, 16, 52], [17, 18, 51], [19, 20, 50],
  [21, 22, 49], [23, 24, 48], [25, 26, 47], [27, 27, 46], [28, 29, 45],
  [30, 31, 44], [32, 32, 43], [33, 34, 42], [35, 35, 41], [36, 37, 40],
  [38, 38, 39], [39, 40, 38], [41, 41, 37], [42, 42, 36], [43, 44, 35],
  [45, 45, 34], [46, 47, 33], [48, 48, 32], [49, 49, 31], [50, 50, 30],
  [51, 52, 29], [53, 53, 28], [54, 54, 27], [55, 56, 26], [57, 57, 25],
  [58, 58, 24], [59, 59, 23], [60, 61, 22], [62, 62, 21], [63, 63, 20],
  [64, 64, 19], [65, 66, 18], [67, 67, 17], [68, 68, 16], [69, 70, 15],
  [71, 71, 14], [72, 73, 13], [74, 74, 12], [75, 75, 11], [76, 77, 10],
  [78, 79, 9], [80, 80, 8], [81, 82, 7], [83, 84, 6], [85, 87, 5],
  [88, 91, 4], [92, 93, 3], [94, 96, 2],
]

export function incomePortionPercent(completedAge: number): number | null {
  if (!Number.isInteger(completedAge) || completedAge < 0) return null
  if (completedAge >= 97) return 1
  for (const [from, to, percent] of INCOME_SHARE_TABLE) {
    if (completedAge >= from && completedAge <= to) return percent
  }
  return null
}

export function usedTaxableShare(kind: PensionType): boolean {
  return kind !== 'PrivateRentenversicherung'
}

export type PensionFieldId = 'jahresbetrag' | 'rentenbeginnJahr' | 'alterBeiRentenbeginn'
export const PENSION_FIELDS: readonly PensionFieldId[] = ['jahresbetrag', 'rentenbeginnJahr', 'alterBeiRentenbeginn']
export type PensionFieldState =
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }
  | { readonly kind: 'erfasst'; readonly value: number }

/** The guided mask's data. */
export interface PensionData {
  readonly kind: PensionType | null
  readonly jahresbetrag: PensionFieldState
  readonly rentenbeginnJahr: PensionFieldState
  readonly alterBeiRentenbeginn: PensionFieldState
}

export const EMPTY_PENSION: PensionData = {
  kind: null,
  jahresbetrag: { kind: 'offen' },
  rentenbeginnJahr: { kind: 'offen' },
  alterBeiRentenbeginn: { kind: 'offen' },
}

export function isValidPensionAmount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function setPensionField(data: PensionData, field: PensionFieldId, state: PensionFieldState): PensionData {
  if (state.kind === 'erfasst' && !isValidPensionAmount(state.value)) {
    throw new RangeError(`rente: "${field}" erfasst value must be a non-negative integer`)
  }
  return { ...data, [field]: state }
}

export function setPensionType(data: PensionData, kind: PensionType | null): PensionData {
  if (kind !== null && !isPensionType(kind)) {
    throw new RangeError(`rente: "${kind}" is not a declared Rentenart`)
  }
  return { ...data, kind }
}

export const PENSION_UNCLEAR = 'unklar'

export function serializePensionField(state: PensionFieldState): string | null {
  switch (state.kind) {
    case 'offen':
      return null
    case 'unklar':
      return PENSION_UNCLEAR
    case 'erfasst':
      return String(state.value)
  }
}

export function deserializePensionField(value: string | null): PensionFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === PENSION_UNCLEAR) return { kind: 'unklar' }
  const rawValue = Number(value)
  if (!isValidPensionAmount(rawValue)) {
    throw new Error(`rente: stored value "${value}" is neither offen, unklar, nor a valid integer`)
  }
  return { kind: 'erfasst', value: rawValue }
}

function taxableShareSource(rentenbeginnJahr: number, percent: number): string {
  return `§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn ${rentenbeginnJahr}: ${percent} %`
}

function incomeShareSource(alter: number, percent: number): string {
  return `§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit ${alter} Jahren: ${percent} %`
}

export function pensionAsCoreLineItem(pension: PensionData): Item | null {
  if (pension.kind === null || pension.jahresbetrag.kind !== 'erfasst') return null
  const jahresbetrag = pension.jahresbetrag.value

  if (usedTaxableShare(pension.kind)) {
    if (pension.rentenbeginnJahr.kind !== 'erfasst') return null
    const percent = taxableSharePercent(pension.rentenbeginnJahr.value)
    if (percent === null) return null
    return {
      id: 'rente',
      incomeType: 'Rente',
      amount: Math.round(jahresbetrag * (percent / 100)),
      source: { kind: 'regel', rule: taxableShareSource(pension.rentenbeginnJahr.value, percent) },
    }
  }

  if (pension.alterBeiRentenbeginn.kind !== 'erfasst') return null
  const percentValue = incomePortionPercent(pension.alterBeiRentenbeginn.value)
  if (percentValue === null) return null
  return {
    id: 'rente',
    incomeType: 'Rente',
    amount: Math.round(jahresbetrag * (percentValue / 100)),
    source: { kind: 'regel', rule: incomeShareSource(pension.alterBeiRentenbeginn.value, percentValue) },
  }
}

export function pensionStatus(pension: PensionData, gated: readonly IncomeType[]): CalculationStatus {
  const coreItems = pensionAsCoreLineItem(pension)
  const items: Item[] = coreItems === null ? [] : [coreItems]
  const openItems = coreItems === null ? 1 : 0
  return calculate({ items, openItems, conflicts: [], gated })
}
