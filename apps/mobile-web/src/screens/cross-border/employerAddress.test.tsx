import { describe, expect, it } from 'vitest'
import { addressLines, postalCodeFrom } from './employerAddress'

describe('postalCodeFrom', () => {
  it.each([
    ['8001 Zürich', '8001'],
    [' 79539 Lörrach', '79539'],
    ['Zürich', ''],
    ['', ''],
  ])('reads %j as %j', (plzOrt, postalCode) => {
    expect(postalCodeFrom(plzOrt)).toBe(postalCode)
  })
})

describe('addressLines', () => {
  it('joins street, house number and suffix', () => {
    expect(addressLines({ street: 'Bahnhofstrasse', houseNumber: '12', houseNumberSuffix: 'a', postalCode: '8001', city: 'Zürich' })).toEqual({
      streetLine: 'Bahnhofstrasse 12a',
      cityLine: '8001 Zürich',
    })
  })

  it('leaves the number out when none was typed', () => {
    expect(addressLines({ street: 'Bahnhofstrasse', houseNumber: null, houseNumberSuffix: null, postalCode: '8001', city: 'Zürich' }).streetLine).toBe('Bahnhofstrasse')
  })
})
