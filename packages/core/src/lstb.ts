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
  const wert = Number(value)
  if (!isValidAmount(wert)) {
    throw new Error(`lstb: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return { kind: 'erfasst', value: wert }
}
