import { ELSTER_YEARS, type ElsterForm, type ElsterLine, type ElsterYear } from './types'

/**
 * Lines of the Anlage S and G read off Mein ELSTER (ADR-0101 §22). No official public copy names their
 * Zeilen and Kennzahlen (research self-employed-forms.md), so the app takes them from a file the
 * operator fills from Mein ELSTER (`apps/api/assets/elster-lines/<form>-<year>.json`) and checks it here.
 * Without a file the form stays `not_available` and the help shows the amounts without lines.
 */

/** The values the app computes for these forms; a file may only place these. */
export const SUPPLIED_LINE_IDS: Readonly<Record<'anlage-s' | 'anlage-g', readonly string[]>> = {
  'anlage-s': ['anlage-s.gewinn', 'anlage-s.veraeusserungsgewinn'],
  'anlage-g': ['anlage-g.gewinn', 'anlage-g.veraeusserungsgewinn', 'anlage-g.messbetrag', 'anlage-g.gewerbesteuer'],
}

export interface SuppliedLines {
  readonly form: 'anlage-s' | 'anlage-g'
  readonly year: ElsterYear
  /** When and where the lines were read („Mein ELSTER, Formular … 2025, abgelesen am …“). */
  readonly source: string
  readonly lines: readonly ElsterLine[]
  /** SHA-256 of the file, so a changed file shows. */
  readonly sha256: string
}

/** Checks a file's content: the form, a year the app offers, a source, and lines only for known values. */
/** `sha256` of the file is computed by the caller (the API), so the core stays free of Node modules. */
export function parseSuppliedLines(raw: string, sha256 = ''): { readonly ok: true; readonly supplied: SuppliedLines } | { readonly ok: false; readonly errors: readonly string[] } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ['Die Datei ist kein gültiges JSON.'] }
  }
  const errors: string[] = []
  const v = value as { form?: unknown; year?: unknown; source?: unknown; lines?: unknown }
  const form = v.form === 'anlage-s' || v.form === 'anlage-g' ? v.form : null
  if (form === null) errors.push('„form“ ist anlage-s oder anlage-g.')
  const year = (ELSTER_YEARS as readonly unknown[]).includes(v.year) ? (v.year as ElsterYear) : null
  if (year === null) errors.push(`„year“ ist eines von ${ELSTER_YEARS.join(', ')}.`)
  if (typeof v.source !== 'string' || v.source.trim().length < 10) errors.push('„source“ sagt, wo und wann die Zeilen abgelesen wurden.')
  if (!Array.isArray(v.lines) || v.lines.length === 0) errors.push('„lines“ ist eine nicht leere Liste.')
  const lines: ElsterLine[] = []
  const seen = new Set<string>()
  for (const [index, row] of (Array.isArray(v.lines) ? v.lines : []).entries()) {
    const r = row as { id?: unknown; zeile?: unknown; kennzahlen?: unknown; label?: unknown }
    const at = `Zeile ${index + 1}`
    if (typeof r.id !== 'string' || (form !== null && !SUPPLIED_LINE_IDS[form].includes(r.id))) errors.push(`${at}: „id“ ist einer von ${form ? SUPPLIED_LINE_IDS[form].join(', ') : '…'}.`)
    else if (seen.has(r.id)) errors.push(`${at}: „${r.id}“ steht doppelt.`)
    if (typeof r.zeile !== 'string' || !/^\d{1,3}[a-z]?$/.test(r.zeile)) errors.push(`${at}: „zeile“ ist eine Zeilennummer wie "4" oder "96a".`)
    if (!Array.isArray(r.kennzahlen) || r.kennzahlen.some((k) => typeof k !== 'string' || !/^\d{2,3}$/.test(k))) errors.push(`${at}: „kennzahlen“ ist eine Liste zwei- bis dreistelliger Kennzahlen.`)
    if (typeof r.label !== 'string' || r.label.trim() === '') errors.push(`${at}: „label“ ist die Beschriftung aus Mein ELSTER.`)
    if (errors.length === 0 && form !== null && year !== null) {
      seen.add(r.id as string)
      lines.push({ id: r.id as string, form, year, zeile: r.zeile as string, kennzahlen: r.kennzahlen as string[], label: (r.label as string).trim(), euerKeys: [] })
    }
  }
  if (errors.length > 0 || form === null || year === null) return { ok: false, errors }
  return { ok: true, supplied: { form, year, source: (v.source as string).trim(), lines, sha256 } }
}

const registry = new Map<string, SuppliedLines>()
const listeners: (() => void)[] = []

/** Registers a checked file; the catalogue then answers `published` for its form and year. */
export function registerSuppliedLines(supplied: SuppliedLines): void {
  registry.set(`${supplied.form}:${supplied.year}`, supplied)
  for (const l of listeners) l()
}

export function suppliedLinesFor(form: ElsterForm, year: ElsterYear): SuppliedLines | undefined {
  return registry.get(`${form}:${year}`)
}

/** Test seam and reload: forget every registered file. */
export function clearSuppliedLines(): void {
  registry.clear()
  for (const l of listeners) l()
}

/** The catalogue drops its cache when the registry changes. */
export function onSuppliedLinesChange(listener: () => void): void {
  listeners.push(listener)
}
