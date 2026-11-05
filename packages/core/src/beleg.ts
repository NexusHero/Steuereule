import type { Belegart, ReceiptType } from './belegart.js'

export interface ReceiptData {
  readonly id: string
  readonly userId: string
  readonly filename: string
  readonly type?: ReceiptType
  readonly receiptDate?: string
  readonly paymentDate?: string
  readonly taxYear: number | null
  readonly suggestionDismissed: boolean
  // Backward compatibility fields
  readonly dateiname?: string
  readonly art?: Belegart
  readonly belegdatum?: string
  readonly zahlungsdatum?: string
  readonly steuerjahr?: number | null
  readonly vorschlagVerworfen?: boolean
}

export type BelegDaten = {
  readonly id: string
  readonly userId: string
  readonly dateiname: string
  readonly art?: Belegart
  readonly belegdatum?: string
  readonly zahlungsdatum?: string
  readonly steuerjahr: number | null
  readonly vorschlagVerworfen: boolean
}

export type SuggestionProvenance = 'paymentDate' | 'receiptDate'
export type VorschlagsHerkunft = 'zahlungsdatum' | 'belegdatum'

export interface TaxYearSuggestion {
  readonly taxYear: number
  readonly provenance: SuggestionProvenance
}

export interface SteuerjahrVorschlag {
  readonly steuerjahr: number
  readonly herkunft: VorschlagsHerkunft
}

function yearFromDate(iso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  return match === null ? null : Number(match[1])
}

export function steuerjahrVorschlag(daten: BelegDaten | ReceiptData): SteuerjahrVorschlag | null {
  const paymentDate = 'paymentDate' in daten && daten.paymentDate !== undefined ? daten.paymentDate : daten.zahlungsdatum
  if (paymentDate !== undefined) {
    const year = yearFromDate(paymentDate)
    if (year !== null) return { steuerjahr: year, herkunft: 'zahlungsdatum' }
  }
  const receiptDate = 'receiptDate' in daten && daten.receiptDate !== undefined ? daten.receiptDate : daten.belegdatum
  if (receiptDate !== undefined) {
    const year = yearFromDate(receiptDate)
    if (year !== null) return { steuerjahr: year, herkunft: 'belegdatum' }
  }
  return null
}

export function suggestTaxYear(data: ReceiptData | BelegDaten): TaxYearSuggestion | null {
  const res = steuerjahrVorschlag(data)
  if (res === null) return null
  return {
    taxYear: res.steuerjahr,
    provenance: res.herkunft === 'zahlungsdatum' ? 'paymentDate' : 'receiptDate',
  }
}

export type ReceiptAssignment =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'suggested'; readonly suggestion: TaxYearSuggestion }
  | { readonly kind: 'assigned'; readonly taxYear: number }
  | { readonly kind: 'conflict'; readonly assigned: number; readonly suggestion: TaxYearSuggestion }

export type BelegZuordnung =
  | { readonly kind: 'ungebunden' }
  | { readonly kind: 'vorgeschlagen'; readonly vorschlag: SteuerjahrVorschlag }
  | { readonly kind: 'zugeordnet'; readonly steuerjahr: number }
  | { readonly kind: 'konflikt'; readonly zugeordnet: number; readonly vorschlag: SteuerjahrVorschlag }

export function zuordnungAusDaten(daten: BelegDaten | ReceiptData): BelegZuordnung {
  const vorschlag = steuerjahrVorschlag(daten)
  const currentTaxYear = 'taxYear' in daten && daten.taxYear !== undefined ? daten.taxYear : (daten as BelegDaten).steuerjahr
  const isDismissed = 'suggestionDismissed' in daten && daten.suggestionDismissed !== undefined ? daten.suggestionDismissed : (daten as BelegDaten).vorschlagVerworfen

  if (currentTaxYear !== null) {
    if (!isDismissed && vorschlag !== null && vorschlag.steuerjahr !== currentTaxYear) {
      return { kind: 'konflikt', zugeordnet: currentTaxYear, vorschlag }
    }
    return { kind: 'zugeordnet', steuerjahr: currentTaxYear }
  }
  if (vorschlag !== null) return { kind: 'vorgeschlagen', vorschlag }
  return { kind: 'ungebunden' }
}

export const assignmentFromData = zuordnungAusDaten

export function ordneZu<T extends BelegDaten | ReceiptData>(daten: T, steuerjahr: number): T {
  if (!Number.isInteger(steuerjahr)) {
    throw new RangeError('steuerjahr must be an integer calendar year')
  }
  return {
    ...daten,
    steuerjahr,
    taxYear: steuerjahr,
    vorschlagVerworfen: false,
    suggestionDismissed: false,
  }
}

export const assignReceipt = ordneZu

export function verwerfeVorschlag<T extends BelegDaten | ReceiptData>(daten: T): T {
  return {
    ...daten,
    vorschlagVerworfen: true,
    suggestionDismissed: true,
  }
}

export const dismissSuggestion = verwerfeVorschlag
