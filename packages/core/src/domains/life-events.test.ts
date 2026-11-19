import { describe, expect, it } from 'vitest'
import { lifeEvents, type LifeEventYear } from './life-events'

// ADR-0099 §4 — markers on the timeline, derived only from data the app already keeps; no own input.

const person = (employers: string[], crossBorder = false, wage = true) => ({ employers, crossBorder, wage })
const year = (y: number, filingType: 'einzel' | 'zusammen', A: ReturnType<typeof person>, B: ReturnType<typeof person> | null = null, moved = false): LifeEventYear => ({
  year: y,
  filingType,
  people: { A, B },
  moved,
})

const MOCK: LifeEventYear[] = [
  year(2022, 'einzel', person(['Muster GmbH']), person(['Beispiel AG'])),
  year(2023, 'zusammen', person(['Muster GmbH']), person(['Beispiel AG'])),
  year(2024, 'zusammen', person(['Muster GmbH', 'Grenz AG'], true), person(['Beispiel AG'])),
  year(2025, 'zusammen', person(['Grenz AG'], true), person(['Beispiel AG']), true),
  year(2026, 'zusammen', person([], false, false), null),
]

describe('lifeEvents', () => {
  it('derives the mock’s markers from the data', () => {
    const events = lifeEvents({ years: MOCK, childBirthDates: ['2025-03-14'], propertyAcquisitions: [{ propertyKey: 'p1', acquiredOn: '2023-04-01' }] })
    expect(events.map((e) => [e.year, e.kind, e.person])).toEqual([
      [2023, 'zusammenveranlagung', null],
      [2023, 'immobilienkauf', null],
      [2024, 'neuer-arbeitgeber', 'A'],
      [2024, 'grenzgaenger', 'A'],
      [2025, 'kind', null],
      [2025, 'umzug', null],
    ])
    expect(events.find((e) => e.kind === 'neuer-arbeitgeber')).toMatchObject({ employers: ['Grenz AG'] })
    expect(events.find((e) => e.kind === 'kind')).toMatchObject({ count: 1, date: '2025-03-14' })
  })

  it('invents nothing: without data there is no event', () => {
    expect(lifeEvents({ years: [], childBirthDates: [], propertyAcquisitions: [] })).toEqual([])
    // The first year in the app is no change: nothing is known about the year before it.
    expect(lifeEvents({ years: [year(2024, 'zusammen', person(['Grenz AG'], true))], childBirthDates: [], propertyAcquisitions: [] })).toEqual([])
  })

  it('needs a known employer the year before for a new one', () => {
    const years = [year(2023, 'einzel', person([])), year(2024, 'einzel', person(['Neu GmbH']))]
    expect(lifeEvents({ years, childBirthDates: [], propertyAcquisitions: [] })).toEqual([])
  })

  it('needs a year with a German wage before a first Swiss one to call it a start', () => {
    const years = [year(2023, 'einzel', person([], false, false)), year(2024, 'einzel', person([], true))]
    expect(lifeEvents({ years, childBirthDates: [], propertyAcquisitions: [] })).toEqual([])
  })

  it('shows births and purchases only within the years the Verlauf shows, each once', () => {
    const events = lifeEvents({ years: MOCK, childBirthDates: ['2019-05-01', '2025-03-14', '2025-03-14'], propertyAcquisitions: [{ propertyKey: 'p1', acquiredOn: '2023-04-01' }, { propertyKey: 'p1', acquiredOn: '2023-04-01' }] })
    expect(events.filter((e) => e.kind === 'kind')).toHaveLength(1)
    expect(events.filter((e) => e.kind === 'immobilienkauf')).toHaveLength(1)
  })
})
