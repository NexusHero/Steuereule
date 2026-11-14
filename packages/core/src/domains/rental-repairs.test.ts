import { describe, expect, it } from 'vitest'
import { checkRentalRepairs } from './rental-repairs'

describe('repairs after buying a rented building (§ 6 Abs. 1 Nr. 1a EStG)', () => {
  it('counts net repairs in the three years after the purchase against 15 % of the building', () => {
    const result = checkRentalRepairs({ acquiredOn: '2024-04-01', buildingCostEur: 200_000, repairs: [{ doneOn: '2024-06-01', netEur: 18_000 }, { doneOn: '2027-04-02', netEur: 50_000 }, { doneOn: '2027-04-01', netEur: 1_000 }] })
    expect(result).toEqual({ windowEnd: '2027-04-01', limitEur: 30_000, withinWindowEur: 19_000, exceeds: false, roomLeftEur: 11_000 })
  })

  it('says when the limit is crossed', () => {
    expect(checkRentalRepairs({ acquiredOn: '2024-04-01', buildingCostEur: 200_000, repairs: [{ doneOn: '2025-01-10', netEur: 30_001 }] })).toMatchObject({ exceeds: true, roomLeftEur: 0 })
    expect(checkRentalRepairs({ acquiredOn: '2024-04-01', buildingCostEur: 200_000, repairs: [{ doneOn: '2025-01-10', netEur: 30_000 }] })).toMatchObject({ exceeds: false, roomLeftEur: 0 })
  })

  it('refuses what it cannot read', () => {
    expect(() => checkRentalRepairs({ acquiredOn: '01.04.2024', buildingCostEur: 1, repairs: [] })).toThrow(RangeError)
    expect(() => checkRentalRepairs({ acquiredOn: '2024-04-01', buildingCostEur: 0, repairs: [] })).toThrow(RangeError)
  })
})
