// ADR-0096: the picker lists every chat model with a key, each with the depths it can do and what
// Gründlich and Max cost and how long the first word takes, measured from the owl's own answers.
import { describe, expect, it } from 'vitest'
import { InMemoryAdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AdvisorModelsService } from '../src/advisor/advisor-models.service.js'
import { AdvisorModelCatalog, type CatalogFetch } from '../src/llm/model-catalog.js'
import type { AiRuntimeConfigService, ResolvedAiSlotConfig } from '../src/llm/ai-runtime-config.service.js'

const STANDARD: ResolvedAiSlotConfig = { slot: 'advisor_chat', enabled: true, provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'a-key' }

function runtime(standard: ResolvedAiSlotConfig = STANDARD): AiRuntimeConfigService {
  return {
    async resolveLimits() {
      throw new Error('unused')
    },
    async isKillSwitchActive() {
      return false
    },
    async resolveSlot() {
      return standard
    },
    async chatProviderKeys() {
      return standard.enabled ? [{ provider: 'anthropic' as const, apiKey: 'a-key' }] : []
    },
  }
}

const anthropicModels: CatalogFetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }] }),
})

async function answers(repo: InMemoryAdvisorRepository, n: number, usage: Record<string, unknown>) {
  const conversation = await repo.createConversation('u', 2025)
  for (let i = 0; i < n; i++) {
    const msg = await repo.createMessage({ userId: 'u', taxYear: 2025, conversationId: conversation.id, role: 'assistant', content: '', meta: null, status: 'streaming' })
    await repo.finishMessage(msg.id, 'u', { content: 'x', status: 'complete', meta: null, reasoning: null, usage: { traceId: 't', durationMs: 1, ...usage } as never })
  }
}

describe('AdvisorModelsService', () => {
  it('lists the models with their depths, measured where enough answers exist', async () => {
    const repo = new InMemoryAdvisorRepository()
    await answers(repo, 5, { provider: 'anthropic', model: 'claude-sonnet-5-5', depth: 'gruendlich', inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 1000, firstTokenMs: 6000 })
    await answers(repo, 5, { provider: 'anthropic', model: 'claude-sonnet-5-5', depth: 'max', inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 7000, firstTokenMs: 15000 })
    const service = new AdvisorModelsService(runtime(), new AdvisorModelCatalog(anthropicModels), repo)
    const result = await service.list()
    expect(result.standard).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(result.models[0]).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      depths: [
        { depth: 'gruendlich', costFactor: 1, firstWordSeconds: 6, samples: 5 },
        { depth: 'max', costFactor: 3, firstWordSeconds: 15, samples: 5 },
      ],
    })
    // Not measured yet: the depths are there, without numbers.
    expect(result.models[1]).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', depths: [{ depth: 'gruendlich', samples: 0 }, { depth: 'max', samples: 0 }] })
  })

  it('offers no model when the chat runs without a model (rules only)', async () => {
    const service = new AdvisorModelsService(
      runtime({ slot: 'advisor_chat', enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }),
      new AdvisorModelCatalog(anthropicModels),
      new InMemoryAdvisorRepository(),
    )
    expect((await service.list()).models).toEqual([])
  })
})
