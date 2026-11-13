import { describe, expect, it } from 'vitest'
import { furtherWorkExpensesEur, furtherWorkExpensesKz380 } from './work-expenses'

describe('further Werbungskosten', () => {
  it('adds professional bodies, work tools, account fees and other expenses', () => {
    const x = { professionalBodiesEur: 120, workEquipmentEur: 110, accountFeesEur: 16, otherWorkExpensesEur: 40 }
    expect(furtherWorkExpensesEur(x)).toBe(286)
    expect(furtherWorkExpensesKz380(x)).toBe(56)
  })

  it('counts nothing that was not entered', () => {
    expect(furtherWorkExpensesEur(null)).toBe(0)
    expect(furtherWorkExpensesEur({ workEquipmentEur: null })).toBe(0)
  })
})
