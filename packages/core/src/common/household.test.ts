import { describe, expect, it } from 'vitest'
import { asksForEducation, isPreselectedForYear, normalizePersonName, planHouseholdMerge } from './household'

describe('normalizePersonName (#452)', () => {
  it('ignores case, blanks and umlaut spellings', () => {
    expect(normalizePersonName('  Jürgen  Müller ')).toBe('juergen mueller')
    expect(normalizePersonName('JUERGEN mueller')).toBe('juergen mueller')
    expect(normalizePersonName('Groß')).toBe('gross')
  })
})

const entry = (key: string, firstName: string, lastName: string, birthDate: string) => ({ key, firstName, lastName, birthDate })

describe('planHouseholdMerge (#452 decision 5, AC 4)', () => {
  it('merges entries with the same name and the same birth date into one person', () => {
    const plan = planHouseholdMerge([
      entry('2024', 'Mila', 'Brenner', '2019-05-12'),
      entry('2025', 'mila', 'BRENNER', '2019-05-12'),
      entry('2025b', 'Noah', 'Brenner', '2021-01-02'),
    ])
    expect(plan.persons.map((p) => p.keys)).toEqual([['2024', '2025'], ['2025b']])
    expect(plan.candidates).toEqual([])
  })

  it('keeps a typo as two people and asks exactly once', () => {
    const plan = planHouseholdMerge([
      entry('2024', 'Mila', 'Brenner', '2019-05-12'),
      entry('2025', 'Milla', 'Brenner', '2019-05-12'),
      entry('2026', 'Milla', 'Brenner', '2019-05-12'),
    ])
    expect(plan.persons.map((p) => p.keys)).toEqual([['2024'], ['2025', '2026']])
    expect(plan.candidates).toEqual([[0, 1]])
  })

  it('asks once about the same name with a birth date one day apart', () => {
    const plan = planHouseholdMerge([entry('a', 'Mila', 'Brenner', '2019-05-12'), entry('b', 'Mila', 'Brenner', '2019-05-13')])
    expect(plan.persons).toHaveLength(2)
    expect(plan.candidates).toEqual([[0, 1]])
  })

  it('does not ask about clearly different people', () => {
    const plan = planHouseholdMerge([entry('a', 'Mila', 'Brenner', '2019-05-12'), entry('b', 'Noah', 'Brenner', '2021-03-01')])
    expect(plan.candidates).toEqual([])
  })

  it('is stable when run twice (repeatable migration)', () => {
    const entries = [entry('a', 'Mila', 'Brenner', '2019-05-12'), entry('b', 'Mila', 'Brenner', '2019-05-12')]
    expect(planHouseholdMerge(entries)).toEqual(planHouseholdMerge(entries))
  })
})

describe('age rules (#452 decision 3/4)', () => {
  it('preselects children up to 25 at the start of the year, not older ones', () => {
    expect(isPreselectedForYear('2001-01-01', 2026)).toBe(true) // 25 on 1 Jan 2026
    expect(isPreselectedForYear('2000-12-31', 2026)).toBe(true) // 25 on 1 Jan 2026 (birthday the day before)
    expect(isPreselectedForYear('2000-01-01', 2026)).toBe(false) // 26 on 1 Jan 2026
    expect(isPreselectedForYear('1999-06-01', 2026)).toBe(false)
  })

  it('asks for the education from the year a child turns 18', () => {
    expect(asksForEducation('2008-12-31', 2026)).toBe(true)
    expect(asksForEducation('2009-01-01', 2026)).toBe(false)
  })
})
