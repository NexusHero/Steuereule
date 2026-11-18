import { describe, expect, it } from 'vitest'
import { formatDraftValue, isWithinEmployeeAllowance } from './draft-display'

const NBSP = '\u00A0'

describe('isWithinEmployeeAllowance', () => {
  const zeroWorkExpense = { screen: 'commute', deltaEur: 0, sourceId: 'estg-9-1' } as const

  it('is true for a work expense that changes nothing because the Arbeitnehmer-Pauschbetrag covers it', () => {
    expect(isWithinEmployeeAllowance(zeroWorkExpense)).toBe(true)
    expect(isWithinEmployeeAllowance({ screen: 'interview', deltaEur: 0, sourceId: 'estg-4-5-6c' })).toBe(true)
  })

  it('is false for a wage or other income field, even under a § 9 source', () => {
    expect(isWithinEmployeeAllowance({ ...zeroWorkExpense, screen: 'chLohnausweis' })).toBe(false)
    expect(isWithinEmployeeAllowance({ ...zeroWorkExpense, screen: 'lstb' })).toBe(false)
    expect(isWithinEmployeeAllowance({ ...zeroWorkExpense, screen: 'rente' })).toBe(false)
  })

  it('is false when the draft has an effect, an open effect or another source', () => {
    expect(isWithinEmployeeAllowance({ ...zeroWorkExpense, deltaEur: 12 })).toBe(false)
    expect(isWithinEmployeeAllowance({ ...zeroWorkExpense, effect: 'not-computable' })).toBe(false)
    expect(isWithinEmployeeAllowance({ ...zeroWorkExpense, sourceId: 'estg-10b' })).toBe(false)
  })
})

describe('formatDraftValue', () => {
  it('shows a Swiss salary amount in CHF with thousands separators', () => {
    expect(formatDraftValue('chLohnausweis', 'bruttolohn-total', '119580')).toBe(`119.580${NBSP}CHF`)
    expect(formatDraftValue('chLohnausweis', 'saeule3aChf', '7056')).toBe(`7.056${NBSP}CHF`)
  })

  it('shows other amounts in euros', () => {
    expect(formatDraftValue('lstb', 'bruttoarbeitslohn', '45000')).toBe(`45.000${NBSP}€`)
    expect(formatDraftValue('commute', 'workEquipmentEur', '480')).toBe(`480${NBSP}€`)
    expect(formatDraftValue('lstb', 'solidaritaetszuschlag', '12.5')).toBe(`12,50${NBSP}€`)
    expect(formatDraftValue('interview', 'fortbildung-kosten', '1500')).toBe(`1.500${NBSP}€`)
    expect(formatDraftValue('kind', 'swissFamilyAllowanceEur', '2400')).toBe(`2.400${NBSP}€`)
  })

  it('reformats an amount that already names its currency', () => {
    expect(formatDraftValue('chLohnausweis', 'krankenkasseChf', '3600 CHF')).toBe(`3.600${NBSP}CHF`)
    expect(formatDraftValue('interview', 'spenden-betrag', '1200 €')).toBe(`1.200${NBSP}€`)
  })

  it('leaves values that are not amounts as they are', () => {
    expect(formatDraftValue('commute', 'oneWayKm', '12')).toBe('12')
    expect(formatDraftValue('chLohnausweis', 'krankentaggeldArbeitgeberProzent', '50')).toBe('50')
    expect(formatDraftValue('chLohnausweis', 'arbeitgeberName', 'Muster AG')).toBe('Muster AG')
    expect(formatDraftValue('lstb', 'bruttoarbeitslohn', 'unklar')).toBe('unklar')
    expect(formatDraftValue('interview', 'homeoffice', '60')).toBe('60')
    expect(formatDraftValue('unknown', 'x', '1000')).toBe('1000')
  })
})
