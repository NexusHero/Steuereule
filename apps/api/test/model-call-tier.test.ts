// H2-40: a year the user paid for draws on the share of the day's model calls kept for paying accounts.
import { describe, expect, it } from 'vitest'
import { ModelCallTiers } from '../src/advisor/model-call-tier.js'

describe('ModelCallTiers', () => {
  it('names a paid year paid and every other year free', async () => {
    const tiers = new ModelCallTiers({ status: async (_userId: string, year: number) => (year === 2025 ? 'freigeschaltet' : 'offen') })
    expect(await tiers.tierOf('u', 2025)).toBe('paid')
    expect(await tiers.tierOf('u', 2024)).toBe('free')
  })

  it('counts a failing lookup as free instead of failing the turn', async () => {
    const tiers = new ModelCallTiers({ status: async () => Promise.reject(new Error('db down')) })
    expect(await tiers.tierOf('u', 2025)).toBe('free')
  })
})
