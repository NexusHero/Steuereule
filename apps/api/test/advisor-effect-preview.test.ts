// ADR-0066: what the draft card says about the refund, from the two estimates of a preview.
import { describe, expect, it } from 'vitest'
import { effectFromEstimates } from '../src/advisor/advisor.service.js'
import type { TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'

const range = (from: number, to: number): TaxEstimateStatus => ({ kind: 'spanne', result: { from, to } }) as unknown as TaxEstimateStatus
const open: TaxEstimateStatus = { kind: 'offen', missing: ['bruttolohn'] }
const impossible: TaxEstimateStatus = { kind: 'nicht-moeglich', reason: 'besondere-lebenslage' }

describe('effectFromEstimates', () => {
  it('compares the middle of the two ranges', () => {
    expect(effectFromEstimates({ before: range(1900, 2100), after: range(2000, 2192) })).toEqual({ kind: 'computed', beforeRefundEur: 2000, afterRefundEur: 2096, deltaEur: 96 })
  })

  it('reports a draft that costs refund as it is', () => {
    expect(effectFromEstimates({ before: range(2000, 2000), after: range(1800, 1800) })).toMatchObject({ kind: 'computed', deltaEur: -200 })
  })

  it('reports no change as no change', () => {
    expect(effectFromEstimates({ before: range(2000, 2000), after: range(2000, 2000) })).toMatchObject({ kind: 'computed', deltaEur: 0 })
  })

  it('has no figure while the estimate is still open', () => {
    const effect = effectFromEstimates({ before: open, after: open })
    expect(effect).toMatchObject({ kind: 'not-computable' })
    expect(effect.kind === 'not-computable' && effect.hint).toContain('erst berechenbar')
  })

  it('has no difference to name when the draft makes the estimate possible in the first place', () => {
    const effect = effectFromEstimates({ before: open, after: range(2000, 2000) })
    expect(effect.kind === 'not-computable' && effect.hint).toContain('erstmals möglich')
  })

  it('says so when this kind of return has no estimate at all', () => {
    const effect = effectFromEstimates({ before: impossible, after: impossible })
    expect(effect.kind === 'not-computable' && effect.hint).toContain('keine automatische Schätzung')
  })

  it('has no figure when the preview did not run', () => {
    expect(effectFromEstimates(null)).toMatchObject({ kind: 'not-computable' })
  })
})
