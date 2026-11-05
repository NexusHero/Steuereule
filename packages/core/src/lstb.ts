export type WageTaxCertificateFieldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'
export type LstbFeldId = WageTaxCertificateFieldId

export type WageTaxCertificateFieldState =
  | { readonly kind: 'erfasst'; readonly wert: number }
  | { readonly kind: 'offen' }
  | { readonly kind: 'unklar' }

export type LstbFeldZustand = WageTaxCertificateFieldState

export interface WageTaxCertificateData {
  readonly bruttoarbeitslohn: WageTaxCertificateFieldState
  readonly lohnsteuer: WageTaxCertificateFieldState
  readonly sozialversicherung: WageTaxCertificateFieldState
}

export type LstbDaten = WageTaxCertificateData

export const EMPTY_WAGE_TAX_CERTIFICATE: WageTaxCertificateData = {
  bruttoarbeitslohn: { kind: 'offen' },
  lohnsteuer: { kind: 'offen' },
  sozialversicherung: { kind: 'offen' },
}
export const LEERES_LSTB = EMPTY_WAGE_TAX_CERTIFICATE

export function isValidAmount(wert: number): boolean {
  return Number.isFinite(wert) && Number.isInteger(wert) && wert >= 0
}

export function setWageTaxCertificateField(
  daten: WageTaxCertificateData,
  feld: WageTaxCertificateFieldId,
  zustand: WageTaxCertificateFieldState,
): WageTaxCertificateData {
  if (zustand.kind === 'erfasst' && !isValidAmount(zustand.wert)) {
    throw new RangeError(`lstb: "${feld}" erfasst value must be a non-negative integer`)
  }
  return { ...daten, [feld]: zustand }
}

export type WageTaxCertificateConflict =
  | { readonly art: 'lohnsteuer-uebersteigt-brutto'; readonly lohnsteuer: number; readonly bruttoarbeitslohn: number }
  | {
      readonly art: 'sozialversicherung-uebersteigt-brutto'
      readonly sozialversicherung: number
      readonly bruttoarbeitslohn: number
    }

export type LstbWiderspruch = WageTaxCertificateConflict

export type WageTaxCertificateStatus =
  | { readonly kind: 'unvollstaendig'; readonly offen: readonly WageTaxCertificateFieldId[]; readonly unklar: readonly WageTaxCertificateFieldId[] }
  | { readonly kind: 'widerspruch'; readonly widersprueche: readonly WageTaxCertificateConflict[] }
  | {
      readonly kind: 'vollstaendig'
      readonly bruttoarbeitslohn: number
      readonly lohnsteuer: number
      readonly sozialversicherung: number
    }

export type LstbZustand = WageTaxCertificateStatus

export const WAGE_TAX_CERTIFICATE_FIELDS: readonly WageTaxCertificateFieldId[] = [
  'bruttoarbeitslohn',
  'lohnsteuer',
  'sozialversicherung',
]
export const LSTB_FELDER = WAGE_TAX_CERTIFICATE_FIELDS

function conflicts(daten: WageTaxCertificateData): readonly WageTaxCertificateConflict[] {
  const brutto = (daten.bruttoarbeitslohn as { kind: 'erfasst'; wert: number }).wert
  const lohnsteuer = (daten.lohnsteuer as { kind: 'erfasst'; wert: number }).wert
  const sozialversicherung = (daten.sozialversicherung as { kind: 'erfasst'; wert: number }).wert

  const result: WageTaxCertificateConflict[] = []
  if (lohnsteuer > brutto) {
    result.push({ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer, bruttoarbeitslohn: brutto })
  }
  if (sozialversicherung > brutto) {
    result.push({ art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung, bruttoarbeitslohn: brutto })
  }
  return result
}

export function wageTaxCertificateStatus(daten: WageTaxCertificateData): WageTaxCertificateStatus {
  const offen: WageTaxCertificateFieldId[] = []
  const unklar: WageTaxCertificateFieldId[] = []
  let alleErfasst = true

  for (const feld of WAGE_TAX_CERTIFICATE_FIELDS) {
    const zustand = daten[feld]
    if (zustand.kind === 'offen') {
      alleErfasst = false
      offen.push(feld)
    } else if (zustand.kind === 'unklar') {
      alleErfasst = false
      unklar.push(feld)
    }
  }

  if (!alleErfasst) return { kind: 'unvollstaendig', offen, unklar }

  const brutto = (daten.bruttoarbeitslohn as { kind: 'erfasst'; wert: number }).wert
  const lohnsteuer = (daten.lohnsteuer as { kind: 'erfasst'; wert: number }).wert
  const sozialversicherung = (daten.sozialversicherung as { kind: 'erfasst'; wert: number }).wert
  const widerspr = conflicts(daten)
  if (widerspr.length > 0) return { kind: 'widerspruch', widersprueche: widerspr }

  return { kind: 'vollstaendig', bruttoarbeitslohn: brutto, lohnsteuer, sozialversicherung }
}

export const WAGE_TAX_CERTIFICATE_UNCLEAR = 'unklar'
export const LSTB_UNKLAR = WAGE_TAX_CERTIFICATE_UNCLEAR

export function serializeWageTaxCertificateField(zustand: WageTaxCertificateFieldState): string | null {
  switch (zustand.kind) {
    case 'offen':
      return null
    case 'unklar':
      return WAGE_TAX_CERTIFICATE_UNCLEAR
    case 'erfasst':
      return String(zustand.wert)
  }
}

export function deserializeWageTaxCertificateField(value: string | null): WageTaxCertificateFieldState {
  if (value === null) return { kind: 'offen' }
  if (value === WAGE_TAX_CERTIFICATE_UNCLEAR) return { kind: 'unklar' }
  const wert = Number(value)
  if (!isValidAmount(wert)) {
    throw new Error(`lstb: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return { kind: 'erfasst', wert }
}

// Backward-compatibility aliases
export {
  isValidAmount as istGueltigerBetrag,
  setWageTaxCertificateField as setzeLstbFeld,
  wageTaxCertificateStatus as lstbZustand,
  serializeWageTaxCertificateField as serialisiereLstbFeld,
  deserializeWageTaxCertificateField as deserialisiereLstbFeld,
}
