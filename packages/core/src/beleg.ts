import type { ReceiptType } from './belegart.js'

export type BelegDaten = {
  readonly id: string
  readonly userId: string
  readonly dateiname: string
  readonly art?: ReceiptType
  readonly belegdatum?: string
  readonly zahlungsdatum?: string
  readonly steuerjahr: number | null
  readonly vorschlagVerworfen: boolean
}

export type VorschlagsHerkunft = 'zahlungsdatum' | 'belegdatum'

export interface SteuerjahrVorschlag {
  readonly steuerjahr: number
  readonly herkunft: VorschlagsHerkunft
}

function yearFromDate(iso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  return match === null ? null : Number(match[1])
}

export function steuerjahrVorschlag(daten: BelegDaten): SteuerjahrVorschlag | null {
  if (daten.zahlungsdatum !== undefined) {
    const year = yearFromDate(daten.zahlungsdatum)
    if (year !== null) return { steuerjahr: year, herkunft: 'zahlungsdatum' }
  }
  if (daten.belegdatum !== undefined) {
    const year = yearFromDate(daten.belegdatum)
    if (year !== null) return { steuerjahr: year, herkunft: 'belegdatum' }
  }
  return null
}

export type BelegZuordnung =
  | { readonly kind: 'ungebunden' }
  | { readonly kind: 'vorgeschlagen'; readonly vorschlag: SteuerjahrVorschlag }
  | { readonly kind: 'zugeordnet'; readonly steuerjahr: number }
  | { readonly kind: 'konflikt'; readonly zugeordnet: number; readonly vorschlag: SteuerjahrVorschlag }

export function assignmentFromData(daten: BelegDaten): BelegZuordnung {
  const vorschlag = steuerjahrVorschlag(daten)
  const currentTaxYear = daten.steuerjahr
  const isDismissed = daten.vorschlagVerworfen

  if (currentTaxYear !== null) {
    if (!isDismissed && vorschlag !== null && vorschlag.steuerjahr !== currentTaxYear) {
      return { kind: 'konflikt', zugeordnet: currentTaxYear, vorschlag }
    }
    return { kind: 'zugeordnet', steuerjahr: currentTaxYear }
  }
  if (vorschlag !== null) return { kind: 'vorgeschlagen', vorschlag }
  return { kind: 'ungebunden' }
}

export function assignReceipt<T extends BelegDaten>(daten: T, steuerjahr: number): T {
  if (!Number.isInteger(steuerjahr)) {
    throw new RangeError('steuerjahr must be an integer calendar year')
  }
  return {
    ...daten,
    steuerjahr,
    vorschlagVerworfen: false,
  }
}

export function dismissSuggestion<T extends BelegDaten>(daten: T): T {
  return { ...daten, vorschlagVerworfen: true }
}
