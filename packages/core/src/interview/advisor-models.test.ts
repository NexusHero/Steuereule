import { describe, expect, it } from 'vitest'
import {
  ADVISOR_DEPTHS,
  advisorModelCapabilities,
  advisorModelProfiles,
  depthSetting,
  modelPrice,
  thinksOnBudget,
  type AdvisorUsageSample,
} from './advisor-models'

describe('what each chat model can do (Gründlich / Max)', () => {
  it('offers Max on the current Claude models as effort „max“', () => {
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-fable-5-2']) {
      expect(advisorModelCapabilities('anthropic', model).depths).toEqual(ADVISOR_DEPTHS)
      expect(depthSetting('anthropic', model, 'max')).toEqual({ thinkingLevel: 'high' })
    }
    expect(depthSetting('anthropic', 'claude-sonnet-5-5', 'gruendlich')).toEqual({ thinkingLevel: 'medium' })
  })

  it('gives older Claude models that think on a token budget a bigger budget for Max', () => {
    expect(thinksOnBudget('claude-haiku-4-5')).toBe(true)
    expect(thinksOnBudget('claude-sonnet-5-5')).toBe(false)
    expect(depthSetting('anthropic', 'claude-haiku-4-5', 'gruendlich')).toEqual({ reasoningBudgetTokens: 2048 })
    expect(depthSetting('anthropic', 'claude-haiku-4-5', 'max')).toEqual({ reasoningBudgetTokens: 16000 })
  })

  it('caps Max at „high“ where a model knows no higher level (Gemini 3)', () => {
    expect(depthSetting('google-genai', 'gemini-3.8-flash', 'max')).toEqual({ thinkingLevel: 'high' })
    expect(depthSetting('google-genai', 'gemini-3.8-flash', 'gruendlich')).toEqual({ thinkingLevel: 'medium' })
  })

  it('hides Max where the app cannot set the depth at all', () => {
    expect(advisorModelCapabilities('openai', 'gpt-4o-mini').depths).toEqual(['gruendlich'])
    expect(advisorModelCapabilities('google-genai', 'gemini-2.5-pro').depths).toEqual(['gruendlich'])
    expect(depthSetting('openai', 'gpt-4o-mini', 'max')).toEqual({})
  })

  it('knows the token prices of the Claude models and none it was not told', () => {
    expect(modelPrice('anthropic', 'claude-sonnet-5-5')).toEqual({ inputUsdPerMTok: 2, outputUsdPerMTok: 10 })
    expect(modelPrice('anthropic', 'claude-opus-5-5')).toEqual({ inputUsdPerMTok: 4, outputUsdPerMTok: 20 })
    expect(modelPrice('google-genai', 'gemini-3.8-flash')).toEqual({ inputUsdPerMTok: 1.5, outputUsdPerMTok: 7.5 })
    expect(modelPrice('google-genai', 'gemini-3.8-pro')).toBeNull()
  })
})

describe('measured cost and wait, relative to the standard model with Gründlich', () => {
  const sample = (model: string, depth: 'gruendlich' | 'max', outputTokens: number, firstTokenMs: number): AdvisorUsageSample => ({
    provider: 'anthropic',
    model,
    depth,
    inputTokens: 10_000,
    cachedInputTokens: 0,
    outputTokens,
    firstTokenMs,
  })
  const many = (n: number, make: () => AdvisorUsageSample) => Array.from({ length: n }, make)
  const reference = { provider: 'anthropic' as const, model: 'claude-sonnet-5-5' }

  it('compares the median cost and first-word wait with the reference, rounded', () => {
    const samples = [
      ...many(5, () => sample('claude-sonnet-5-5', 'gruendlich', 1000, 6000)),
      // 10.000 × 2 $ + 7.000 × 10 $ against 10.000 × 2 $ + 1.000 × 10 $: 90 / 30 = 3×.
      ...many(5, () => sample('claude-sonnet-5-5', 'max', 7000, 15000)),
      // Opus costs twice the Sonnet price per token.
      ...many(5, () => sample('claude-opus-5-5', 'gruendlich', 1000, 8000)),
    ]
    const profiles = advisorModelProfiles(samples, reference)
    expect(profiles.get('anthropic:claude-sonnet-5-5:gruendlich')).toEqual({ costFactor: 1, firstWordSeconds: 6, samples: 5 })
    expect(profiles.get('anthropic:claude-sonnet-5-5:max')).toEqual({ costFactor: 3, firstWordSeconds: 15, samples: 5 })
    expect(profiles.get('anthropic:claude-opus-5-5:gruendlich')).toEqual({ costFactor: 2, firstWordSeconds: 8, samples: 5 })
  })

  it('says nothing about a setting with fewer than five answers, and no cost without prices', () => {
    const samples = [
      ...many(5, () => sample('claude-sonnet-5-5', 'gruendlich', 1000, 6000)),
      ...many(4, () => sample('claude-sonnet-5-5', 'max', 7000, 15000)),
      ...many(5, () => ({ ...sample('gemini-3.8-pro', 'gruendlich', 1000, 4000), provider: 'google-genai' as const })),
    ]
    const profiles = advisorModelProfiles(samples, reference)
    expect(profiles.has('anthropic:claude-sonnet-5-5:max')).toBe(false)
    expect(profiles.get('google-genai:gemini-3.8-pro:gruendlich')).toEqual({ firstWordSeconds: 4, samples: 5 })
  })

  it('measures Claude against Gemini 3.8 Flash when that is the standard', () => {
    const gemini = { provider: 'google-genai' as const, model: 'gemini-3.8-flash' }
    const samples = [
      ...many(5, () => ({ ...sample('gemini-3.8-flash', 'gruendlich', 1000, 5000), provider: 'google-genai' as const })),
      ...many(5, () => sample('claude-sonnet-5-5', 'gruendlich', 1000, 9000)),
    ]
    const profiles = advisorModelProfiles(samples, gemini)
    expect(profiles.get('google-genai:gemini-3.8-flash:gruendlich')).toEqual({ costFactor: 1, firstWordSeconds: 5, samples: 5 })
    // 10.000 × 2 $ + 1.000 × 10 $ against 10.000 × 1,5 $ + 1.000 × 7,5 $: 30 / 22,5 = 1,3×.
    expect(profiles.get('anthropic:claude-sonnet-5-5:gruendlich')).toEqual({ costFactor: 1.3, firstWordSeconds: 9, samples: 5 })
  })

  it('reads cached input at a tenth of the price', () => {
    const cached = (outputTokens: number): AdvisorUsageSample => ({ ...sample('claude-sonnet-5-5', 'max', outputTokens, 6000), cachedInputTokens: 10_000 })
    const samples = [...many(5, () => sample('claude-sonnet-5-5', 'gruendlich', 1000, 6000)), ...many(5, () => cached(1000))]
    // (10.000 × 0,2 $ + 1.000 × 10 $) / (10.000 × 2 $ + 1.000 × 10 $) = 12 / 30 = 0,4.
    expect(advisorModelProfiles(samples, reference).get('anthropic:claude-sonnet-5-5:max')?.costFactor).toBe(0.4)
  })
})
