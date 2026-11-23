import { describe, expect, it } from 'vitest'
import type { ChSalaryCertificateResponseDto } from '@steuereule/api-client'
import { EMPTY_CH_SALARY_CERTIFICATE_RESPONSE } from '../../test-msw-server'
import { grossComponentSum, isAdditionalGrossComponent, salaryAmountFrom, valueFromResponse, wageFieldValue } from './salaryCertificateAmounts'

const WITH_GROSS: ChSalaryCertificateResponseDto = {
  ...EMPTY_CH_SALARY_CERTIFICATE_RESPONSE,
  fields: EMPTY_CH_SALARY_CERTIFICATE_RESPONSE.fields.map((f) => (f.id === 'bruttolohn-total' ? { ...f, kind: 'erfasst' as const, value: 84000 } : f)),
}

describe('salaryAmountFrom', () => {
  it('reads a whole or printed CHF amount', () => {
    expect(salaryAmountFrom('84000', 'lohn')).toBe(84000)
    expect(salaryAmountFrom("84'000.60", 'lohn')).toBe(84001)
  })

  it('lets only Ziffer 7 be negative', () => {
    expect(salaryAmountFrom('-500', 'andere-leistungen')).toBe(-500)
    expect(salaryAmountFrom('-500', 'lohn')).toBeNull()
  })

  it.each(['', 'abc', '1,2,3'])('treats %j as not entered', (text) => {
    expect(salaryAmountFrom(text, 'lohn')).toBeNull()
  })
})

describe('grossComponentSum', () => {
  it('adds Ziffern 1–7 and skips empty, unreadable and other fields', () => {
    expect(grossComponentSum({ lohn: '80000', sitzungsgelder: '1000', 'andere-leistungen': '-200', kapitalleistungen: 'x', quellensteuer: '5000' })).toBe(80800)
  })

  it('is 0 without any component', () => {
    expect(grossComponentSum({})).toBe(0)
  })
})

describe('isAdditionalGrossComponent', () => {
  it('is true for Ziffern 2–7 only', () => {
    expect(isAdditionalGrossComponent('gehaltsnebenleistungen')).toBe(true)
    expect(isAdditionalGrossComponent('andere-leistungen')).toBe(true)
    expect(isAdditionalGrossComponent('lohn')).toBe(false)
    expect(isAdditionalGrossComponent('bruttolohn-total')).toBe(false)
  })
})

describe('valueFromResponse and wageFieldValue', () => {
  it('give a recorded Ziffer as text and as number', () => {
    expect(valueFromResponse(WITH_GROSS, 'bruttolohn-total')).toBe('84000')
    expect(wageFieldValue(WITH_GROSS, 'bruttolohn-total')).toBe(84000)
  })

  it('give empty and null for an open or unknown Ziffer', () => {
    expect(valueFromResponse(WITH_GROSS, 'lohn')).toBe('')
    expect(wageFieldValue(WITH_GROSS, 'lohn')).toBeNull()
    expect(wageFieldValue(WITH_GROSS, 'unbekannt')).toBeNull()
  })
})
