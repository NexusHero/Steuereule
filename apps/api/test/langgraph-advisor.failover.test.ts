import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import type { AdvisorStreamEvent, AdvisorTurnResult, CaseDigest } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from '../src/ki/ai-runtime-config.service.js'
import { CHAT_MODEL_MAX_RETRIES, createChatModelFromConfig } from '../src/ki/chat-model.factory.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'

const DIGEST: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  profession: 'IT & Software',
  lstbPersonA: { grossWageEur: 65000, wageTaxEur: 12500, socialSecurityEur: 12000 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 15,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

/** Answers with one reply, or fails with the given error. */
class OneShotModel extends BaseChatModel {
  public calls = 0
  constructor(private readonly outcome: AIMessage | Error) {
    super({})
  }
  _llmType(): string {
    return 'one-shot-test'
  }
  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    this.calls++
    if (this.outcome instanceof Error) throw this.outcome
    return { generations: [{ text: String(this.outcome.content), message: this.outcome }] }
  }
  override async *_streamResponseChunks(messages: BaseMessage[], _options: this['ParsedCallOptions'], _runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const text = String(res.generations[0]!.message.content)
    yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) })
  }
}

const GEMINI = { provider: 'google-genai', model: 'gemini-test', apiKey: 'primary-key' } as const

function runtime(fallback: Partial<ResolvedAiSlotConfig> | null): AiRuntimeConfigService {
  return {
    async resolveLimits() {
      return DEFAULT_AI_TURN_LIMITS
    },
    async isKillSwitchActive() {
      return false
    },
    async resolveSlot(slot) {
      if (slot === 'fallback') {
        return fallback === null
          ? { slot, enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }
          : ({ slot, enabled: true, provider: 'anthropic', model: 'claude-test', apiKey: 'second-key', ...fallback } as ResolvedAiSlotConfig)
      }
      return { slot, enabled: true, ...GEMINI }
    },
  }
}

async function run(engine: LangGraphAdvisorEngine) {
  const events: AdvisorStreamEvent[] = []
  for await (const ev of engine.streamTurn({ message: 'Was ist mit Spenden?', digest: DIGEST })) events.push(ev)
  return { events, done: events.find((e) => e.event === 'done')?.data as AdvisorTurnResult }
}

describe('model failover (#493)', () => {
  it('asks the fallback model when the first one fails before its first word, and says so', async () => {
    const primary = new OneShotModel(new Error('[429 Too Many Requests] quota'))
    const second = new OneShotModel(new AIMessage('Spenden sind abziehbar.'))
    const engine = new LangGraphAdvisorEngine(runtime({}), (config) => (config.provider === 'google-genai' ? primary : second))
    const { events, done } = await run(engine)
    expect(done.mode).toBe('langgraph')
    expect(done.provider).toBe('anthropic')
    expect(done.replyText).toContain('Spenden sind abziehbar')
    expect(done.primaryFailure).toMatchObject({ reason: 'quota' })
    expect(events.some((e) => e.event === 'status' && e.data.text.includes('Gemini antwortet nicht. Die Eule fragt Claude'))).toBe(true)
    expect(primary.calls).toBe(1)
    expect(second.calls).toBe(1)
  })

  it('does not fail over to the same model with the same key', async () => {
    const primary = new OneShotModel(new Error('503 unavailable'))
    const engine = new LangGraphAdvisorEngine(runtime(GEMINI), () => primary)
    const { done } = await run(engine)
    expect(done.mode).toBe('deterministic_fallback')
    expect(primary.calls).toBe(1)
  })

  it('answers from the rules, with the reason, when no fallback model is set up', async () => {
    const engine = new LangGraphAdvisorEngine(runtime(null), () => new OneShotModel(new Error('[503] overloaded')))
    const { done } = await run(engine)
    expect(done.mode).toBe('deterministic_fallback')
    expect(done.meta.modelFailure).toMatchObject({ reason: 'unavailable' })
  })

  it('answers from the rules when the fallback model fails too', async () => {
    const engine = new LangGraphAdvisorEngine(runtime({}), () => new OneShotModel(new Error('[503] overloaded')))
    const { done } = await run(engine)
    expect(done.mode).toBe('deterministic_fallback')
  })

  it('does not hand a blocked question to another model', async () => {
    const second = new OneShotModel(new AIMessage('Antwort'))
    const engine = new LangGraphAdvisorEngine(runtime({}), (config) => (config.provider === 'google-genai' ? new OneShotModel(new Error('response was blocked by safety')) : second))
    await run(engine)
    expect(second.calls).toBe(0)
  })
})

describe('retries', () => {
  it('every provider client is built to retry short failures before a turn counts as failed', () => {
    expect(CHAT_MODEL_MAX_RETRIES).toBeGreaterThan(0)
    for (const provider of ['google-genai', 'anthropic', 'openai'] as const) {
      const model = createChatModelFromConfig({ slot: 'advisor_chat', enabled: true, provider, model: 'm', apiKey: 'k' }) as unknown as { maxRetries?: number; caller?: { maxRetries?: number } }
      expect(model.maxRetries ?? model.caller?.maxRetries, provider).toBe(CHAT_MODEL_MAX_RETRIES)
    }
  })
})
