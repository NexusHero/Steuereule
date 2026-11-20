// ADR-0101 §20, REQ-015 amended: the Gewerbe-Gate sits behind the server switch. Off (the default),
// the graph is exactly the old one; on, „Selbstständig“ and „Beides“ walk on through the Minimal-Gate.
import { describe, expect, it } from 'vitest'
import { gatedIncomeTypes } from '../domains/income-types'
import { ENTRIES, GATE_ACKNOWLEDGED, isReachable, isReachableFor, nextStep, nextStepFor, remainingSteps, remainingStepsFor } from './interview'

const ON = { selfEmployment: true } as const

describe('self-employment switch off (default): the Gewerbe-Gate as before', () => {
  it.each(['Selbstständig', 'Beides'])('%s still hits the gate', (job) => {
    expect(nextStep({ job })).toEqual({ kind: 'gate', id: 'gewerbe' })
    expect(nextStep({ job }, { selfEmployment: false })).toEqual({ kind: 'gate', id: 'gewerbe' })
  })

  it('Selbstständig stays terminal after the acknowledgement', () => {
    expect(nextStep({ job: 'Selbstständig', gewerbe: GATE_ACKNOWLEDGED })).toEqual({ kind: 'gate', id: 'gewerbe' })
    expect(remainingSteps({ job: 'Selbstständig' })).toBe(0)
  })

  it('Gewerbe is gated', () => {
    expect(gatedIncomeTypes({ job: 'Selbstständig' })).toEqual(['Gewerbe'])
    expect(gatedIncomeTypes({ job: 'Beides' }, { selfEmployment: false })).toEqual(['Gewerbe'])
  })
})

describe('self-employment switch on: the self-employed walk on', () => {
  it.each(['Selbstständig', 'Beides'])('%s goes on to „ausland“, never to the gate', (job) => {
    expect(nextStep({ job }, ON)).toEqual({ kind: 'question', id: 'ausland' })
    expect(isReachable({ job }, 'gewerbe', ON)).toBe(false)
    expect(isReachable({ job }, 'ausland', ON)).toBe(true)
  })

  it('counts the remaining Minimal-Gate questions instead of stopping at the gate', () => {
    expect(remainingSteps({ job: 'Selbstständig' }, ON)).toBe(3)
    expect(remainingStepsFor(ENTRIES['minimal-gate'], { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }, ON)).toBe(0)
    expect(nextStepFor(ENTRIES['minimal-gate'], { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }, ON)).toEqual({ kind: 'done' })
  })

  it('employees are not affected', () => {
    expect(nextStep({ job: 'Angestellt' }, ON)).toEqual(nextStep({ job: 'Angestellt' }))
    expect(isReachableFor(ENTRIES['minimal-gate'], { job: 'Angestellt' }, 'ausland', ON)).toBe(true)
  })

  it('Gewerbe is no longer gated; Krypto and Verkauf stay gated', () => {
    expect(gatedIncomeTypes({ job: 'Selbstständig' }, ON)).toEqual([])
    expect(gatedIncomeTypes({ job: 'Beides', einkuenfte: 'Kapitalerträge', 'kap-depot': 'Krypto' }, ON)).toEqual(['Kapital'])
  })
})
