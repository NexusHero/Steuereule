import { beforeEach, describe, expect, it } from 'vitest'
import { dismissEffect, observeMidpoint, rememberOpenedArea, resetEffectMemory } from './effectMemory'

describe('effectMemory (UX review H1 — Wirkungszeile)', () => {
  beforeEach(() => resetEffectMemory())

  it('takes the first figure as the baseline without an effect', () => {
    expect(observeMidpoint(2025, 600)).toBeNull()
    expect(observeMidpoint(2025, 600)).toBeNull()
  })

  it('reports the change and the area opened before it', () => {
    observeMidpoint(2025, 600)
    rememberOpenedArea(2025, 'sonderausgaben')
    expect(observeMidpoint(2025, 648)).toEqual({ deltaEur: 48, area: 'sonderausgaben' })
  })

  it('keeps the effect until the next change, then attributes the next one without an area', () => {
    observeMidpoint(2025, 600)
    rememberOpenedArea(2025, 'lstb')
    observeMidpoint(2025, 650)
    expect(observeMidpoint(2025, 650)).toEqual({ deltaEur: 50, area: 'lstb' })
    expect(observeMidpoint(2025, 620)).toEqual({ deltaEur: -30, area: null })
  })

  it('keeps years apart and can be dismissed', () => {
    observeMidpoint(2025, 600)
    observeMidpoint(2024, 100)
    expect(observeMidpoint(2025, 700)).toEqual({ deltaEur: 100, area: null })
    expect(observeMidpoint(2024, 100)).toBeNull()
    dismissEffect(2025)
    expect(observeMidpoint(2025, 700)).toBeNull()
  })
})
