// The day's model calls across all users are capped (ADR-0109); once spent, every model path answers as if no model were set up.
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { describe, expect, it } from 'vitest'
import type { AdvisorStreamEvent, AdvisorTurnResult } from '@steuereule/core'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'
import { DEFAULT_AI_TURN_LIMITS, EnvAiRuntimeConfigService, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { resolveVisionModel } from '../src/receipt/parse/document-parse-steps.js'
import { SAMPLE_DIGEST as DIGEST } from './fixtures/sample-digest.js'

const shared = () => ({ rateLimitStorage: createResettableRateLimitStorage({ redisUrl: '' }) })

describe('EnvAiRuntimeConfigService.takeCallBudget', () => {
  it('lets calls through until the daily limit, then refuses', async () => {
    const config = new EnvAiRuntimeConfigService({ AI_DAILY_CALL_LIMIT: '2' }, shared())
    expect(await config.takeCallBudget()).toBe(true)
    expect(await config.takeCallBudget()).toBe(true)
    expect(await config.takeCallBudget()).toBe(false)
  })

  it('is shared by every instance of the service that counts on the same storage', async () => {
    const storage = shared()
    const a = new EnvAiRuntimeConfigService({ AI_DAILY_CALL_LIMIT: '1' }, storage)
    const b = new EnvAiRuntimeConfigService({ AI_DAILY_CALL_LIMIT: '1' }, storage)
    expect(await a.takeCallBudget()).toBe(true)
    expect(await b.takeCallBudget()).toBe(false)
  })

  it('has a generous default and no cap without a shared storage', async () => {
    expect(await new EnvAiRuntimeConfigService({}, shared()).takeCallBudget()).toBe(true)
    expect(await new EnvAiRuntimeConfigService({ AI_DAILY_CALL_LIMIT: '1' }).takeCallBudget()).toBe(true)
  })
})

function runtime(budget: boolean): AiRuntimeConfigService {
  return {
    resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
    isKillSwitchActive: async () => false,
    resolveSlot: async (slot) => ({ slot, enabled: true, provider: 'google-genai', model: 'm', apiKey: 'k' }),
    takeCallBudget: async () => budget,
  }
}

describe('with the budget spent', () => {
  it('the chat answers from the rules and says the owl is not available, without asking a model', async () => {
    let asked = 0
    const engine = new LangGraphAdvisorEngine(runtime(false), () => {
      asked += 1
      return {} as BaseChatModel // never called: the budget check comes first
    })
    const events: AdvisorStreamEvent[] = []
    for await (const ev of engine.streamTurn({ message: 'Was ist mit Spenden?', digest: DIGEST })) events.push(ev)
    const done = events.find((e) => e.event === 'done')!.data as AdvisorTurnResult
    expect(done.mode).toBe('deterministic_fallback')
    expect(done.meta.modelFailure).toMatchObject({ reason: 'unavailable' })
    expect(asked).toBe(1) // the factory is asked to build the model, but the budget check stops the call
  })

  it('a document read keeps its deterministic result', async () => {
    expect(await resolveVisionModel(runtime(false), () => ({ complete: async () => '' }))).toBeNull()
    expect(await resolveVisionModel(runtime(true), () => ({ complete: async () => '' }))).not.toBeNull()
  })
})
