/**
 * Household rules (#452, ADR-0062): who is the same person across tax years, and which children an
 * account sees preselected in a new year. Pure; the API runs the migration with them.
 */

const UMLAUTS: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Case, blanks and umlaut spellings never make two people out of one. */
export function normalizePersonName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[äöüß]/g, (ch) => UMLAUTS[ch] ?? ch)
    .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]!
}

function daysApart(isoA: string, isoB: string): number {
  return Math.abs(Date.parse(`${isoA}T00:00:00Z`) - Date.parse(`${isoB}T00:00:00Z`)) / 86_400_000
}

export interface HouseholdEntry {
  /** Caller's id for the yearly record (e.g. the Kind row id). */
  readonly key: string
  readonly firstName: string
  readonly lastName: string
  /** ISO date. */
  readonly birthDate: string
}

export interface HouseholdMergePlan {
  /** One person per group of entries, in order of their first entry. */
  readonly persons: readonly { readonly keys: readonly string[] }[]
  /** Pairs of person indexes that look alike but are not the same: ask once. */
  readonly candidates: readonly (readonly [number, number])[]
}

/**
 * Same normalised name and the same birth date → one person. Alike but not the same (name ≤ 2 edits
 * apart with the same birth date, or the same name with birth dates at most 31 days apart) → two
 * people and one question.
 */
export function planHouseholdMerge(entries: readonly HouseholdEntry[]): HouseholdMergePlan {
  const groups: { name: string; birthDate: string; keys: string[] }[] = []
  for (const entry of entries) {
    const name = normalizePersonName(`${entry.firstName} ${entry.lastName}`)
    const group = groups.find((g) => g.name === name && g.birthDate === entry.birthDate)
    if (group) group.keys.push(entry.key)
    else groups.push({ name, birthDate: entry.birthDate, keys: [entry.key] })
  }
  const candidates: [number, number][] = []
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = groups[i]!
      const b = groups[j]!
      const nameAlike = a.birthDate === b.birthDate && levenshtein(a.name, b.name) <= 2
      const dateAlike = a.name === b.name && daysApart(a.birthDate, b.birthDate) <= 31
      if (nameAlike || dateAlike) candidates.push([i, j])
    }
  }
  return { persons: groups.map((g) => ({ keys: g.keys })), candidates }
}

/** Age in completed years on a given ISO date. */
export function ageOn(birthDate: string, isoDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** Children older than 25 at the start of the year are not preselected (decision 3); still selectable. */
export function isPreselectedForYear(birthDate: string, taxYear: number): boolean {
  return ageOn(birthDate, `${taxYear}-01-01`) <= 25
}

/** From the year a child turns 18 the mask asks about education (decision 4). */
export function asksForEducation(birthDate: string, taxYear: number): boolean {
  return ageOn(birthDate, `${taxYear}-12-31`) >= 18
}
