export const WARN_SCHWELLE_TAGE = 60

export const VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR = 25

export const VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT = 0.25

const ABGABEFRISTEN: Readonly<Record<number, string>> = {
  2024: '2025-07-31',
  2025: '2026-07-31',
  2026: '2027-07-31',
}

export type FristenJahr = 2024 | 2025 | 2026

export function istUnterstuetztesFristenJahr(jahr: number): jahr is FristenJahr {
  return Number.isInteger(jahr) && Object.prototype.hasOwnProperty.call(ABGABEFRISTEN, jahr)
}

export function abgabefristFuer(steuerjahr: number): string {
  if (!istUnterstuetztesFristenJahr(steuerjahr)) {
    throw new RangeError(`Unsupported tax year for the Abgabefrist (§ 149 Abs. 2 AO): ${steuerjahr}`)
  }
  return ABGABEFRISTEN[steuerjahr]!
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function tageSeit(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

export type FristenStufe = 'keine' | 'warnung' | 'abgelaufen'

/** Der ehrliche Fristen-Fakt für ein Steuerjahr an einem Stichtag — der Banner-Input, nie ein Status. */
export interface FristenWarnung {
  readonly stufe: FristenStufe
  readonly abgabefrist: string
  readonly verbleibendeTage: number
}

export function fristenWarnung(steuerjahr: number, heute: string): FristenWarnung {
  const abgabefrist = abgabefristFuer(steuerjahr)
  const verbleibendeTage = tageSeit(abgabefrist) - tageSeit(heute)
  const stufe: FristenStufe = verbleibendeTage < 0 ? 'abgelaufen' : verbleibendeTage <= WARN_SCHWELLE_TAGE ? 'warnung' : 'keine'
  return { stufe, abgabefrist, verbleibendeTage }
}
