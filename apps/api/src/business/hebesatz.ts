import { readFileSync } from 'node:fs'

/** One municipality of the official table (Statistische Ämter, Hebesätze der Realsteuern). */
export interface Municipality {
  readonly ags: string
  readonly name: string
  readonly land: string
  /** Gewerbesteuer-Hebesatz in percent. */
  readonly multiplierPercent: number
}

interface HebesatzFile {
  readonly year: number
  readonly status: 'published' | 'not_available'
  readonly reason?: string
  readonly fallbackYear?: number
  readonly source?: { readonly title: string; readonly url: string }
  readonly entries: readonly { readonly ags: string; readonly name: string; readonly land: string; readonly hebesatzGewerbesteuer: number }[]
}

/**
 * The table a year is looked up in: the year's own when published, otherwise the latest earlier year
 * the file names (the municipalities publish a year's values only in the following year). The app says
 * which year the value is from; the user can correct it (ADR-0101 §9).
 */
export interface HebesatzTable {
  readonly requestedYear: number
  readonly tableYear: number | null
  readonly note: string | null
  readonly source: string | null
  readonly municipalities: readonly Municipality[]
}

export type HebesatzLookup =
  | { readonly kind: 'found'; readonly municipality: Municipality; readonly tableYear: number; readonly note: string | null }
  | { readonly kind: 'choices'; readonly choices: readonly Municipality[]; readonly tableYear: number; readonly note: string | null }
  | { readonly kind: 'not_found'; readonly tableYear: number | null; readonly note: string | null }

const DEFAULT_BASE = new URL('../../assets/hebesaetze/', import.meta.url)

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase('de-DE')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()

/** Reads `assets/hebesaetze/<year>.json` once per year; a missing file is an empty, honest table. */
export class HebesatzDirectory {
  private readonly cache = new Map<number, HebesatzFile | null>()

  constructor(private readonly base: URL = DEFAULT_BASE) {}

  private file(year: number): HebesatzFile | null {
    if (!this.cache.has(year)) {
      try {
        this.cache.set(year, JSON.parse(readFileSync(new URL(`${year}.json`, this.base), 'utf8')) as HebesatzFile)
      } catch {
        this.cache.set(year, null)
      }
    }
    return this.cache.get(year) ?? null
  }

  table(year: number): HebesatzTable {
    const own = this.file(year)
    if (own?.status === 'published') return { requestedYear: year, tableYear: year, note: null, source: own.source?.title ?? null, municipalities: own.entries.map(toMunicipality) }
    const fallback = own?.fallbackYear !== undefined ? this.file(own.fallbackYear) : null
    if (own?.fallbackYear !== undefined && fallback?.status === 'published') {
      return {
        requestedYear: year,
        tableYear: own.fallbackYear,
        note: `Für ${year} ist die amtliche Tabelle noch nicht veröffentlicht; der Hebesatz ist der von ${own.fallbackYear}. Bitte mit dem Gewerbesteuerbescheid vergleichen und bei Bedarf korrigieren.`,
        source: fallback.source?.title ?? null,
        municipalities: fallback.entries.map(toMunicipality),
      }
    }
    return { requestedYear: year, tableYear: null, note: own?.reason ?? `Für ${year} liegt keine Hebesatz-Tabelle vor; bitte den Hebesatz selbst eintragen.`, source: null, municipalities: [] }
  }

  byAgs(year: number, ags: string): { readonly municipality: Municipality; readonly tableYear: number; readonly note: string | null } | null {
    const table = this.table(year)
    const municipality = table.municipalities.find((m) => m.ags === ags)
    return municipality && table.tableYear !== null ? { municipality, tableYear: table.tableYear, note: table.note } : null
  }

  /** By name (and Land, which tells apart the many „Neustadt“s); several matches come back as choices. */
  lookup(year: number, name: string, land?: string): HebesatzLookup {
    const table = this.table(year)
    if (table.tableYear === null) return { kind: 'not_found', tableYear: null, note: table.note }
    const wanted = normalize(name)
    const inLand = table.municipalities.filter((m) => land === undefined || land === '' || m.land === land.toUpperCase())
    const exact = inLand.filter((m) => normalize(m.name) === wanted)
    const candidates = exact.length > 0 ? exact : inLand.filter((m) => normalize(m.name).startsWith(wanted)).slice(0, 20)
    if (candidates.length === 1) return { kind: 'found', municipality: candidates[0]!, tableYear: table.tableYear, note: table.note }
    if (candidates.length === 0) return { kind: 'not_found', tableYear: table.tableYear, note: table.note }
    return { kind: 'choices', choices: candidates, tableYear: table.tableYear, note: table.note }
  }
}

function toMunicipality(e: HebesatzFile['entries'][number]): Municipality {
  return { ags: e.ags, name: e.name, land: e.land, multiplierPercent: e.hebesatzGewerbesteuer }
}
