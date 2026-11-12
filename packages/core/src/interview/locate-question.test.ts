import { describe, expect, it } from 'vitest'
import { ENTRIES, QUESTIONS } from './interview'
import { locateQuestion } from './locate-question'

describe('locateQuestion (#488)', () => {
  it.each([
    ['spenden', 'sonderausgaben', 'spenden'],
    ['spenden-betrag', 'sonderausgaben', 'spenden'],
    ['riester', 'sonderausgaben', 'riester'],
    ['riester-betrag', 'sonderausgaben', 'riester'],
    ['umzug', 'lebenslagen', 'umzug'],
    ['dhf-miete', 'lebenslagen', 'dhf'],
    ['haushalt-handwerker-betrag', 'haushalt', 'haushalt-gate'],
    ['fortbildung-kosten', 'segment-2', 'fortbildung'],
    ['beruf', 'berufsprofil', 'beruf'],
  ])('puts %s on the page %s, at the step %s', (question, entry, step) => {
    expect(locateQuestion(question)).toEqual({ entry, step })
  })

  it('knows no page for a question nothing asks', () => {
    expect(locateQuestion('gibt-es-nicht')).toBeNull()
  })

  it('finds a page for every question of the interview, or it could never be shown to the user', () => {
    const unplaced = Object.keys(QUESTIONS).filter((id) => locateQuestion(id) === null)
    // `gewerbe` is the end of the road for the self-employed: reached only from `job`, in the gate.
    expect(unplaced.filter((id) => id !== 'gewerbe')).toEqual([])
    expect(Object.keys(ENTRIES).length).toBeGreaterThan(0)
  })
})
