import { describe, expect, it } from 'vitest'
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
