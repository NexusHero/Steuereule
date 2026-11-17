import { describe, expect, it } from 'vitest'
import { commuteDaysByWay, commuterAllowanceByWay } from './workdays'

const MO_FR = [1, 2, 3, 4, 5] as const

describe('days actually travelled (ADR-0093)', () => {
  it('takes the stated days of a way instead of the derived ones', () => {
    expect(commuteDaysByWay(2024, MO_FR, 220, [{ from: null, to: null, days: 180 }])).toEqual([180])
  })

  it('keeps the derived share for a way without stated days', () => {
    const [first, second] = commuteDaysByWay(2024, MO_FR, 220, [
      { from: null, to: '31.08.2024' },
      { from: '01.09.2024', to: null, days: 40 },
    ])
    expect(second).toBe(40)
    expect(first).toBe(commuteDaysByWay(2024, MO_FR, 220, [{ from: null, to: '31.08.2024' }, { from: '01.09.2024', to: null }])[0])
  })

  it('a way that only covers part of the year gets no allowance for the rest', () => {
    // An employer change on 1 September with a commute claimed for the last four months only.
    const [way] = commuterAllowanceByWay(2024, MO_FR, 220, [{ oneWayKm: 30, withCar: true, from: '01.09.2024', to: null, days: 40 }])
    expect(way).toEqual({ days: 40, allowance: Math.round(40 * (20 * 0.3 + 10 * 0.38)) })
    const [derived] = commuterAllowanceByWay(2024, MO_FR, 220, [{ oneWayKm: 30, withCar: true, from: '01.09.2024', to: null }])
    expect(derived!.days).toBeLessThan(90)
  })
})
