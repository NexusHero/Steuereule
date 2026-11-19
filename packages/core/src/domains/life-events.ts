/**
 * Lebensereignisse (ADR-0099 §4): markers on the timeline that explain jumps in the figures. Only derived
 * from data the app keeps; a change needs the year before to be known, so the first year in the app never
 * starts anything.
 */

export type LifeEventKind = 'zusammenveranlagung' | 'kind' | 'neuer-arbeitgeber' | 'grenzgaenger' | 'umzug' | 'immobilienkauf'

/** One person's working facts of a year. */
export interface LifeEventPerson {
  /** Employer names from the LStB and the Swiss Lohnausweis; empty when none is recorded. */
  readonly employers: readonly string[]
  /** The year has a Swiss Lohnausweis. */
  readonly crossBorder: boolean
  /** The year has wage facts at all (LStB or Lohnausweis). */
  readonly wage: boolean
}

export interface LifeEventYear {
  readonly year: number
  readonly filingType: 'einzel' | 'zusammen'
  readonly people: { readonly A: LifeEventPerson; readonly B: LifeEventPerson | null }
  /** The interview answered „Umzug“ with „Ja“. */
  readonly moved: boolean
}

export interface LifeEventsInput {
  readonly years: readonly LifeEventYear[]
  /** ISO birth dates of the household's children, from any year. */
  readonly childBirthDates: readonly string[]
  readonly propertyAcquisitions: ReadonlyArray<{ readonly propertyKey: string; readonly acquiredOn: string }>
}

export interface LifeEvent {
  readonly year: number
  readonly kind: LifeEventKind
  /** Whose event; null for the household's. */
  readonly person: 'A' | 'B' | null
  /** `neuer-arbeitgeber`: the names new this year. */
  readonly employers?: readonly string[]
  /** `kind`, `immobilienkauf`: the first date of the year (birth, purchase). */
  readonly date?: string
  /** `kind`, `immobilienkauf`: how many in the year. */
  readonly count?: number
}

const ORDER: readonly LifeEventKind[] = ['zusammenveranlagung', 'immobilienkauf', 'neuer-arbeitgeber', 'grenzgaenger', 'kind', 'umzug']

const normalised = (name: string) => name.trim().toLocaleLowerCase('de-DE')

function personEvents(year: number, person: 'A' | 'B', current: LifeEventPerson, previous: LifeEventPerson | null): LifeEvent[] {
  if (previous === null) return []
  const events: LifeEvent[] = []
  const before = new Set(previous.employers.map(normalised))
  const fresh = [...new Map(current.employers.filter((e) => !before.has(normalised(e))).map((e) => [normalised(e), e.trim()])).values()]
  if (before.size > 0 && fresh.length > 0) events.push({ year, kind: 'neuer-arbeitgeber', person, employers: fresh })
  // A start is only a start when the year before had a wage that was not Swiss.
  if (current.crossBorder && !previous.crossBorder && previous.wage) events.push({ year, kind: 'grenzgaenger', person })
  return events
}

/** Dated facts of the household within the shown years: one event per year, with the first date and the count. */
function datedEvents(kind: 'kind' | 'immobilienkauf', dates: readonly string[], from: number, to: number): LifeEvent[] {
  const byYear = new Map<number, string[]>()
  for (const date of new Set(dates)) {
    const y = Number(date.slice(0, 4))
    if (y >= from && y <= to) byYear.set(y, [...(byYear.get(y) ?? []), date])
  }
  return [...byYear.entries()].map(([year, list]) => ({ year, kind, person: null, date: [...list].sort()[0]!, count: list.length }))
}

export function lifeEvents(input: LifeEventsInput): LifeEvent[] {
  if (input.years.length === 0) return []
  const years = [...input.years].sort((a, b) => a.year - b.year)
  const byYear = new Map(years.map((y) => [y.year, y]))
  const events: LifeEvent[] = []
  for (const y of years) {
    const previous = byYear.get(y.year - 1) ?? null
    if (previous !== null && previous.filingType === 'einzel' && y.filingType === 'zusammen') events.push({ year: y.year, kind: 'zusammenveranlagung', person: null })
    events.push(...personEvents(y.year, 'A', y.people.A, previous?.people.A ?? null))
    if (y.people.B !== null) events.push(...personEvents(y.year, 'B', y.people.B, previous?.people.B ?? null))
    if (y.moved) events.push({ year: y.year, kind: 'umzug', person: null })
  }
  const from = years[0]!.year
  const to = years.at(-1)!.year
  events.push(...datedEvents('kind', input.childBirthDates, from, to))
  const purchases = new Map(input.propertyAcquisitions.map((p) => [p.propertyKey, p.acquiredOn]))
  events.push(...datedEvents('immobilienkauf', [...purchases.values()], from, to))
  const personRank = (p: LifeEvent['person']) => (p === null ? 0 : p === 'A' ? 1 : 2)
  return events.sort((a, b) => a.year - b.year || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || personRank(a.person) - personRank(b.person))
}
