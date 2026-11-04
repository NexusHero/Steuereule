import type { Belegart } from './belegart.js'

export interface BelegDaten {
  readonly id: string
  readonly userId: string
  readonly dateiname: string
  readonly art?: Belegart
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

function jahrAusDatum(iso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  return match === null ? null : Number(match[1])
}

export function steuerjahrVorschlag(daten: BelegDaten): SteuerjahrVorschlag | null {
  if (daten.zahlungsdatum !== undefined) {
    const jahr = jahrAusDatum(daten.zahlungsdatum)
    if (jahr !== null) return { steuerjahr: jahr, herkunft: 'zahlungsdatum' }
  }
  if (daten.belegdatum !== undefined) {
    const jahr = jahrAusDatum(daten.belegdatum)
    if (jahr !== null) return { steuerjahr: jahr, herkunft: 'belegdatum' }
  }
  return null
}

export type BelegZuordnung =
  | { readonly kind: 'ungebunden' }
  | { readonly kind: 'vorgeschlagen'; readonly vorschlag: SteuerjahrVorschlag }
  | { readonly kind: 'zugeordnet'; readonly steuerjahr: number }
  | { readonly kind: 'konflikt'; readonly zugeordnet: number; readonly vorschlag: SteuerjahrVorschlag }

export function zuordnungAusDaten(daten: BelegDaten): BelegZuordnung {
  const vorschlag = steuerjahrVorschlag(daten)
  if (daten.steuerjahr !== null) {
    if (!daten.vorschlagVerworfen && vorschlag !== null && vorschlag.steuerjahr !== daten.steuerjahr) {
      return { kind: 'konflikt', zugeordnet: daten.steuerjahr, vorschlag }
    }
    return { kind: 'zugeordnet', steuerjahr: daten.steuerjahr }
  }
  if (vorschlag !== null) return { kind: 'vorgeschlagen', vorschlag }
  return { kind: 'ungebunden' }
}

export function ordneZu(daten: BelegDaten, steuerjahr: number): BelegDaten {
  if (!Number.isInteger(steuerjahr)) {
    throw new RangeError('steuerjahr must be an integer calendar year')
  }
  return { ...daten, steuerjahr, vorschlagVerworfen: false }
}

export function verwerfeVorschlag(daten: BelegDaten): BelegDaten {
  return { ...daten, vorschlagVerworfen: true }
}
