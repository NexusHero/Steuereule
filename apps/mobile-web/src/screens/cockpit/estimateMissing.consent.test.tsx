import { describe, expect, it } from 'vitest'
import { missingItems } from './estimateMissing'

describe('estimate: the partner has not agreed to the joint year (decision 3)', () => {
  it('is a known item of Person B without a mask of A to open', () => {
    expect(missingItems(['personB.zustimmung'])).toEqual([{ id: 'zustimmung', raw: 'personB.zustimmung', person: 'B', known: true, target: null }])
  })
})
