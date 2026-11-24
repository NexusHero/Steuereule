import { describe, expect, it } from 'vitest'
import { ADVISOR_MODEL_PROVIDERS } from '../interview/advisor-models'
import { MODEL_PROVIDERS, PRODUCT_LIMITS, formatCount, formatGigabytes, formatMegabytes, modelProviderList } from './product-limits'

describe('product limits', () => {
  it('name every model provider the owl can be set to, no more and no fewer', () => {
    expect(MODEL_PROVIDERS.map((p) => p.id).sort()).toEqual([...ADVISOR_MODEL_PROVIDERS].sort())
  })

  it('print the figures the way German copy writes them', () => {
    expect(formatMegabytes(PRODUCT_LIMITS.receiptFileBytes)).toBe('10 MB')
    expect(formatGigabytes(PRODUCT_LIMITS.receiptBytesPerAccount)).toBe('2 GB')
    expect(formatCount(PRODUCT_LIMITS.receiptsPerAccount)).toBe('5.000')
    expect(modelProviderList()).toBe('Google (Gemini), Anthropic (Claude) und OpenAI (GPT)')
  })
})
