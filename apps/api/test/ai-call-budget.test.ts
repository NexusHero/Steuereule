// The day's model calls across all users are capped (ADR-0109); once spent, every model path answers as if no model were set up.
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { describe, expect, it } from 'vitest'
import type { AdvisorStreamEvent, AdvisorTurnResult } from '@steuereule/core'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'
import { DEFAULT_AI_DAILY_CALL_LIMIT, DEFAULT_AI_PAID_RESERVE_PERCENT, DEFAULT_AI_TURN_LIMITS, EnvAiRuntimeConfigService, freeCallLimit, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { resolveVisionModel } from '../src/receipt/parse/document-parse-steps.js'
import { SAMPLE_DIGEST as DIGEST } from './fixtures/sample-digest.js'

const shared = () => ({ rateLimitStorage: createResettableRateLimitStorage({ redisUrl: '' }) })

describe('EnvAiRuntimeConfigService.takeCallBudget', () => {
  it('lets calls through until the daily limit, then refuses', async () => {
    const config = new EnvAiRuntimeConfigService({ AI_DAILY_CALL_LIMIT: '2', AI_PAID_RESERVE_PERCENT: '0' }, shared())
    expect(await config.takeCallBudget()).toBe(true)
    expect(await config.takeCallBudget()).toBe(true)
    expect(await config.takeCallBudget()).toBe(false)
  })

  it('keeps a share for paid accounts: free calls stop before it, a paid call still gets the model (H2-40)', async () => {
    const config = new EnvAiRuntimeConfigService({ AI_DAILY_CALL_LIMIT: '10', AI_PAID_RESERVE_PERCENT: '30' }, shared())
    for (let i = 0; i < 7; i += 1) expect(await config.takeCallBudget('free')).toBe(true)
    expect(await config.takeCallBudget()).toBe(false)
    for (let i = 0; i < 3; i += 1) expect(await config.takeCallBudget('paid')).toBe(true)
    // The whole day's budget is still the ceiling for paid calls.
    expect(await config.takeCallBudget('paid')).toBe(false)
  })

  it('reserves 30 % by default and never leaves free accounts with nothing', () => {
    expect(freeCallLimit(DEFAULT_AI_DAILY_CALL_LIMIT, DEFAULT_AI_PAID_RESERVE_PERCENT)).toBe(7_000)
    expect(freeCallLimit(1, 90)).toBe(1)
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

function runtime(budget: boolean, tiers: (string | undefined)[] = []): AiRuntimeConfigService {
  return {
    resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
    isKillSwitchActive: async () => false,
    resolveSlot: async (slot) => ({ slot, enabled: true, provider: 'google-genai', model: 'm', apiKey: 'k' }),
    takeCallBudget: async (tier) => {
      tiers.push(tier)
      return budget
    },
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
    expect(done.meta.modelFailure).toMatchObject({ reason: 'unavailable', detail: 'Tageskontingent der SteuerEule für heute aufgebraucht' })
    expect(asked).toBe(1) // the factory is asked to build the model, but the budget check stops the call
  })

  it('the chat and the summary draw on the share of the tier the request names (H2-40)', async () => {
    const tiers: (string | undefined)[] = []
    const engine = new LangGraphAdvisorEngine(runtime(false, tiers), () => ({}) as BaseChatModel)
    for await (const _ev of engine.streamTurn({ message: 'Was ist mit Spenden?', digest: DIGEST, callTier: 'paid' })) void _ev
    expect(await engine.summarize({ transcript: 'Nutzer: Frage', previousSummary: null, callTier: 'paid' })).toBeNull()
    for await (const _ev of engine.streamTurn({ message: 'Was ist mit Spenden?', digest: DIGEST })) void _ev
    expect(tiers).toEqual(['paid', 'paid', 'free'])
  })

  it('a document read keeps its deterministic result', async () => {
    expect(await resolveVisionModel(runtime(false), () => ({ complete: async () => '' }))).toBeNull()
    expect(await resolveVisionModel(runtime(true), () => ({ complete: async () => '' }))).not.toBeNull()
  })
})
