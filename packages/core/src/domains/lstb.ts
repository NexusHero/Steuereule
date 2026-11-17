export type WageTaxCertificateFieldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'
export type WageTaxCertificateFieldState =
  | { readonly kind: 'erfasst'; readonly value: number }
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }

export interface WageTaxCertificateData {
  readonly bruttoarbeitslohn: WageTaxCertificateFieldState
  readonly lohnsteuer: WageTaxCertificateFieldState
  readonly sozialversicherung: WageTaxCertificateFieldState
}

export const EMPTY_WAGE_TAX_CERTIFICATE: WageTaxCertificateData = {
  bruttoarbeitslohn: { kind: 'offen' },
  lohnsteuer: { kind: 'offen' },
  sozialversicherung: { kind: 'offen' },
}

export function isValidAmount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function setWageTaxCertificateField(
  data: WageTaxCertificateData,
  field: WageTaxCertificateFieldId,
  state: WageTaxCertificateFieldState,
): WageTaxCertificateData {
  if (state.kind === 'erfasst' && !isValidAmount(state.value)) {
    throw new RangeError(`lstb: "${field}" erfasst value must be a non-negative integer`)
  }
  return { ...data, [field]: state }
}

export type WageTaxCertificateConflict =
  | { readonly kind: 'lohnsteuer-uebersteigt-brutto'; readonly lohnsteuer: number; readonly bruttoarbeitslohn: number }
  | {
      readonly kind: 'sozialversicherung-uebersteigt-brutto'
      readonly sozialversicherung: number
      readonly bruttoarbeitslohn: number
    }
export type WageTaxCertificateStatus =
  | { readonly kind: 'unvollstaendig'; readonly open: readonly WageTaxCertificateFieldId[]; readonly unclear: readonly WageTaxCertificateFieldId[] }
  | { readonly kind: 'widerspruch'; readonly conflicts: readonly WageTaxCertificateConflict[] }
  | {
      readonly kind: 'vollstaendig'
      readonly bruttoarbeitslohn: number
      readonly lohnsteuer: number
      readonly sozialversicherung: number
    }
/**
 * Optional LStB lines next to the three required fields: church tax (Zeilen 6 und 7, ADR-0063) and the
 * tax-free employer subsidies to health and care insurance (Zeile 24 a–c, ADR-0090). Whole euros.
 */
export const LSTB_OPTIONAL_LINES = ['kirchensteuer', 'kirchensteuerEhegatte', 'zuschuesseKvPv'] as const
export type LstbOptionalLine = (typeof LSTB_OPTIONAL_LINES)[number]

/**
 * The insurance block of the LStB, line by line (ADR-0093): the employer's and the employee's pension
 * contribution (Zeilen 22, 23), the employee's health, care and unemployment insurance (Zeilen 25–27)
 * and the care part of the tax-free employer subsidy (Zeile 24c). Whole euros; the app adds, nobody else.
 */
export const LSTB_SOCIAL_LINES = ['rvArbeitnehmer', 'rvArbeitgeber', 'kvArbeitnehmer', 'pvArbeitnehmer', 'avArbeitnehmer', 'zuschussPv'] as const
export type LstbSocialLine = (typeof LSTB_SOCIAL_LINES)[number]

/** The lines whose sum is the employee's social security (`sozialversicherung`). */
export const LSTB_EMPLOYEE_SOCIAL_LINES = ['rvArbeitnehmer', 'kvArbeitnehmer', 'pvArbeitnehmer', 'avArbeitnehmer'] as const

/** Zeile 5, the withheld Solidaritätszuschlag: euros with cents, stored as a decimal string. */
export const LSTB_SOLI_LINE = 'solidaritaetszuschlag'

export type LstbLineValues = Readonly<Partial<Record<LstbSocialLine | 'zuschuesseKvPv', number | null | undefined>>>

/** The employee's social security as the sum of Zeilen 23, 25, 26 and 27; null until all four are recorded. */
export function lstbSocialSecurityFromLines(lines: LstbLineValues): number | null {
  let sum = 0
  for (const line of LSTB_EMPLOYEE_SOCIAL_LINES) {
    const value = lines[line]
    if (value === null || value === undefined) return null
    sum += value
  }
  return sum
}

/**
 * Zeile 24 has to be answered (an amount or an explicit 0) once Zeile 25 or 26 carries a contribution:
 * for a voluntarily insured employee those lines hold the whole contribution and Zeile 24 the employer's
 * tax-free part, which is not deductible (§ 10 Abs. 2 Satz 1 Nr. 1 EStG).
 */
export function lstbSubsidyQuestionOpen(lines: LstbLineValues): boolean {
  const filled = (value: number | null | undefined): boolean => value !== null && value !== undefined && value > 0
  return (filled(lines.kvArbeitnehmer) || filled(lines.pvArbeitnehmer)) && (lines.zuschuesseKvPv === null || lines.zuschuesseKvPv === undefined)
}

/** The code the estimate and the checklist name the open Zeile 24 by. */
export const LSTB_SUBSIDY_OPEN = 'zuschuesseKvPv'

export const WAGE_TAX_CERTIFICATE_FIELDS: readonly WageTaxCertificateFieldId[] = [
  'bruttoarbeitslohn',
  'lohnsteuer',
  'sozialversicherung',
]

function conflicts(data: WageTaxCertificateData): readonly WageTaxCertificateConflict[] {
  const gross = (data.bruttoarbeitslohn as { kind: 'erfasst'; value: number }).value
  const lohnsteuer = (data.lohnsteuer as { kind: 'erfasst'; value: number }).value
  const sozialversicherung = (data.sozialversicherung as { kind: 'erfasst'; value: number }).value

  const result: WageTaxCertificateConflict[] = []
  if (lohnsteuer > gross) {
    result.push({ kind: 'lohnsteuer-uebersteigt-brutto', lohnsteuer, bruttoarbeitslohn: gross })
  }
  if (sozialversicherung > gross) {
    result.push({ kind: 'sozialversicherung-uebersteigt-brutto', sozialversicherung, bruttoarbeitslohn: gross })
  }
  return result
}

export function wageTaxCertificateStatus(data: WageTaxCertificateData): WageTaxCertificateStatus {
  const open: WageTaxCertificateFieldId[] = []
  const unclear: WageTaxCertificateFieldId[] = []
  let allRecorded = true

  for (const field of WAGE_TAX_CERTIFICATE_FIELDS) {
    const state = data[field]
    if (state.kind === 'offen') {
      allRecorded = false
      open.push(field)
    } else if (state.kind === 'unklar') {
      allRecorded = false
      unclear.push(field)
    }
  }

  if (!allRecorded) return { kind: 'unvollstaendig', open, unclear }

  const gross = (data.bruttoarbeitslohn as { kind: 'erfasst'; value: number }).value
  const lohnsteuer = (data.lohnsteuer as { kind: 'erfasst'; value: number }).value
  const sozialversicherung = (data.sozialversicherung as { kind: 'erfasst'; value: number }).value
  const conflictsShort = conflicts(data)
  if (conflictsShort.length > 0) return { kind: 'widerspruch', conflicts: conflictsShort }

  return { kind: 'vollstaendig', bruttoarbeitslohn: gross, lohnsteuer, sozialversicherung }
}

export const WAGE_TAX_CERTIFICATE_UNCLEAR = 'unklar'

export function serializeWageTaxCertificateField(state: WageTaxCertificateFieldState): string | null {
  switch (state.kind) {
    case 'offen':
      return null
    case 'unklar':
      return WAGE_TAX_CERTIFICATE_UNCLEAR
    case 'erfasst':
      return String(state.value)
  }
}

export function deserializeWageTaxCertificateField(value: string | null): WageTaxCertificateFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === WAGE_TAX_CERTIFICATE_UNCLEAR) return { kind: 'unklar' }
  const rawValue = Number(value)
  if (!isValidAmount(rawValue)) {
    throw new Error(`lstb: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return { kind: 'erfasst', value: rawValue }
}
