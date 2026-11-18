// ADR-0096: the models a user may pick are the chat models of every provider that has a key, asked
// from the provider itself and kept for a while. A provider that does not answer leaves its
// standard model in the list, never an empty picker.
import { describe, expect, it } from 'vitest'
import { AdvisorModelCatalog, type CatalogFetch } from '../src/ki/advisor-model-catalog.js'

const ANTHROPIC = { data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }, { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }], has_more: false }
const GOOGLE = {
  models: [
    { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/text-embedding-005', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-3.8-flash-image', displayName: 'Gemini Image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-nano-banana-2.1', displayName: 'Nano Banana 2.1', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-omni-flash-preview', displayName: 'Gemini Omni Flash Preview', supportedGenerationMethods: ['generateContent'] },
  ],
}

function fetchStub(responses: Record<string, unknown>, calls: string[] = []): CatalogFetch {
  return async (url, init) => {
    calls.push(url)
    const host = new URL(url).host
    if (host === 'api.anthropic.com') expect(init?.headers).toMatchObject({ 'x-api-key': 'a-key', 'anthropic-version': '2023-06-01' })
    if (host === 'generativelanguage.googleapis.com') expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'g-key' })
    const body = responses[host]
    if (body === undefined) return { ok: false, status: 503, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => body }
  }
}

const keys = [
  { provider: 'anthropic' as const, apiKey: 'a-key' },
  { provider: 'google-genai' as const, apiKey: 'g-key' },
]

describe('AdvisorModelCatalog', () => {
  it('lists the chat models of every provider with a key, without embedding or image models', async () => {
    const catalog = new AdvisorModelCatalog(fetchStub({ 'api.anthropic.com': ANTHROPIC, 'generativelanguage.googleapis.com': GOOGLE }))
    const models = await catalog.list(keys, { provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(models.map((m) => `${m.provider}:${m.model}`)).toEqual(['anthropic:claude-sonnet-5-5', 'anthropic:claude-opus-5-5', 'google-genai:gemini-3.8-flash'])
    expect(models[0]).toMatchObject({ label: 'Claude Sonnet 5.5' })
  })

  it('keeps the standard model when its provider does not answer, and asks again only after a while', async () => {
    const calls: string[] = []
    let now = 0
    const catalog = new AdvisorModelCatalog(fetchStub({}, calls), () => now)
    const models = await catalog.list(keys, { provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(models.map((m) => m.model)).toEqual(['claude-sonnet-5-5'])
    await catalog.list(keys, { provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(calls).toHaveLength(2)
    now = 7 * 60 * 60 * 1000
    await catalog.list(keys, { provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(calls).toHaveLength(4)
  })

  it('never puts a key into a URL, where it would land in logs', async () => {
    const calls: string[] = []
    const catalog = new AdvisorModelCatalog(fetchStub({ 'api.anthropic.com': ANTHROPIC, 'generativelanguage.googleapis.com': GOOGLE }, calls))
    await catalog.list(keys, { provider: 'anthropic', model: 'claude-sonnet-5-5' })
    for (const url of calls) {
      expect(url).not.toContain('a-key')
      expect(url).not.toContain('g-key')
    }
  })
})
