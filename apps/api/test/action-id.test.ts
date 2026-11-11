import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { newActionId } from '../src/common/action-id.js'
import { checkPiiFree } from '../src/ki/ki.adapter.js'

describe('newActionId', () => {
  it('never looks like a Steuer-ID to the PII boundary', () => {
    for (let i = 0; i < 20_000; i++) {
      const actionId = newActionId()
      expect(() => checkPiiFree({ actions: [{ actionId }] })).not.toThrow()
    }
  })
})

// #450 P5: the scan corpus failed about every fifth LStB scan with "IBAN detected": the staged
// draft carries the receipt's UUID, and a UUID like `ab12cdef-3f4e-…` matches the IBAN shape.
describe('checkPiiFree and record ids', () => {
  it('does not take a receipt UUID for an IBAN', () => {
    expect(() => checkPiiFree({ lstbScan: { receiptId: 'ab12cdef-3456-7890-abcd-ef1234567890' } })).not.toThrow()
    for (let i = 0; i < 20_000; i++) {
      const receiptId = randomUUID()
      expect(() => checkPiiFree({ receiptId, actions: [{ actionId: newActionId(), receiptId }] })).not.toThrow()
    }
  })

  it('still finds a real IBAN next to a UUID', () => {
    expect(() => checkPiiFree({ receiptId: randomUUID(), note: 'DE89 3704 0044 0532 0130 00' })).toThrow(/IBAN/)
    expect(() => checkPiiFree({ note: 'de89370400440532013000' })).toThrow(/IBAN/)
  })
})
