import { describe, expect, it } from 'vitest'
import { PROFESSION_VALUES } from './interview'
import { EMPLOYEE_LUMP_SUM_NOTE, PROFESSION_TIPS, professionTipsFor } from './profession-tips'

describe('profession tips', () => {
  const all = Object.values(PROFESSION_TIPS).flat()

  it('every occupation group has at least one tip', () => {
    for (const profession of PROFESSION_VALUES) expect(PROFESSION_TIPS[profession].length).toBeGreaterThan(0)
  })

  it('a Werbungskosten tip never promises money back on its own: it names the Arbeitnehmer-Pauschbetrag', () => {
    const werbungskosten = all.filter((tip) => tip.key !== 'zweitausbildung')
    for (const tip of werbungskosten) expect(tip.reason).toContain(EMPLOYEE_LUMP_SUM_NOTE)
    expect(EMPLOYEE_LUMP_SUM_NOTE).toContain('1.230 €')
  })

  it('every tip cites a source and states no figure of the user’s', () => {
    for (const tip of all) {
      expect(tip.sourceUrl).toMatch(/^https:\/\/www\.gesetze-im-internet\.de\//)
      expect(tip.message).not.toMatch(/\d+ ?€/)
    }
  })

  it('drops the training tip when the interview already says there are training costs', () => {
    expect(professionTipsFor('IT & Software', false).map((t) => t.key)).toContain('fortbildung')
    expect(professionTipsFor('IT & Software', true).map((t) => t.key)).not.toContain('fortbildung')
    expect(professionTipsFor(undefined, false)).toEqual([])
  })
})
