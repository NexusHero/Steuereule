// ADR-0096: the user picks the chat model per conversation and Gründlich or Max per message. The
// engine builds the model the user picked with the depth it can do; the topic guard, the receipt
// scan and the fallback slot stay with the operator, and a fallback answering a Max question gets
// its own deepest setting.
import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import type { AdvisorDepth, AdvisorModelProvider, AdvisorTurnResult } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from '../src/llm/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine, MAX_DEPTH_OUTPUT_TOKENS } from '../src/ki/langgraph-advisor.engine.js'
import { SAMPLE_DIGEST as DIGEST } from './fixtures/sample-digest.js'

class ReplyModel extends BaseChatModel {
  constructor(
    private readonly outcome: AIMessage | Error,
    private readonly delayMs = 0,
  ) {
    super({})
  }
  _llmType(): string {
    return 'reply-test'
  }
  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.outcome instanceof Error) throw this.outcome
    return { generations: [{ text: String(this.outcome.content), message: this.outcome }] }
  }
  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const text = String(res.generations[0]!.message.content)
    yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) })
  }
}

const STANDARD: ResolvedAiSlotConfig = { slot: 'advisor_chat', enabled: true, provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'anthropic-key', thinkingLevel: 'medium', reasoning: 'summary', reasoningBudgetTokens: 2048 }

function runtime(keys: Partial<Record<AdvisorModelProvider, string>>, fallback: Partial<ResolvedAiSlotConfig> | null = null, turnTimeoutMs = DEFAULT_AI_TURN_LIMITS.turnTimeoutMs): AiRuntimeConfigService {
  return {
    async resolveLimits() {
      return { ...DEFAULT_AI_TURN_LIMITS, turnTimeoutMs }
    },
    async isKillSwitchActive() {
      return false
    },
    async resolveSlot(slot) {
      if (slot === 'fallback') {
        return fallback === null
          ? { slot, enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }
          : ({ slot, enabled: true, provider: 'google-genai', model: 'gemini-3.8-flash', apiKey: 'gemini-key', ...fallback } as ResolvedAiSlotConfig)
      }
      return slot === 'advisor_chat' ? STANDARD : { slot, enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }
    },
    async resolveChatChoice(provider, model) {
      const apiKey = keys[provider]
      return apiKey === undefined ? null : { ...STANDARD, provider, model, apiKey }
    },
  }
}

async function turn(engine: LangGraphAdvisorEngine, choice?: { provider: AdvisorModelProvider; model: string }, depth?: AdvisorDepth) {
  let done: AdvisorTurnResult | undefined
  for await (const ev of engine.streamTurn({ message: 'Was ist mit Spenden?', digest: DIGEST, ...(choice ? { chatChoice: choice } : {}), ...(depth ? { depth } : {}) })) {
    if (ev.event === 'done') done = ev.data as AdvisorTurnResult
  }
  return done!
}

describe('chat model and depth chosen by the user (ADR-0096)', () => {
  it('answers with the standard model at Gründlich when nothing is chosen', async () => {
    const built: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key' }), (config) => (built.push(config), new ReplyModel(new AIMessage('Ja.'))))
    const done = await turn(engine)
    expect(done.model).toBe('claude-sonnet-5-5')
    expect(built[0]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', thinkingLevel: 'medium' })
  })

  it('builds the model of the conversation with its own provider key', async () => {
    const built: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key', 'google-genai': 'gemini-key' }), (config) => (built.push(config), new ReplyModel(new AIMessage('Ja.'))))
    const done = await turn(engine, { provider: 'google-genai', model: 'gemini-3.8-pro' })
    expect(done).toMatchObject({ provider: 'google-genai', model: 'gemini-3.8-pro' })
    expect(built[0]).toMatchObject({ provider: 'google-genai', model: 'gemini-3.8-pro', apiKey: 'gemini-key' })
  })

  it('falls back to the standard model when the chosen provider has no key (any more)', async () => {
    const built: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key' }), (config) => (built.push(config), new ReplyModel(new AIMessage('Ja.'))))
    await turn(engine, { provider: 'openai', model: 'gpt-5' })
    expect(built[0]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
  })

  it('thinks at the deepest level the model offers for Max', async () => {
    const built: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key', 'google-genai': 'gemini-key' }), (config) => (built.push(config), new ReplyModel(new AIMessage('Ja.'))))
    await turn(engine, undefined, 'max')
    await turn(engine, { provider: 'google-genai', model: 'gemini-3.8-pro' }, 'max')
    await turn(engine, { provider: 'anthropic', model: 'claude-haiku-4-5' }, 'max')
    // Room to answer after thinking: with the usual 4096 tokens the answer came back empty.
    expect(built[0]).toMatchObject({ model: 'claude-sonnet-5-5', thinkingLevel: 'high', maxTokens: MAX_DEPTH_OUTPUT_TOKENS })
    expect(built[1]).toMatchObject({ model: 'gemini-3.8-pro', thinkingLevel: 'high', maxTokens: MAX_DEPTH_OUTPUT_TOKENS })
    expect(built[2]).toMatchObject({ model: 'claude-haiku-4-5', reasoningBudgetTokens: 16000, maxTokens: MAX_DEPTH_OUTPUT_TOKENS })
  })

  it('leaves a model without deeper thinking as it is when Max is asked', async () => {
    const built: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key', openai: 'openai-key' }), (config) => (built.push(config), new ReplyModel(new AIMessage('Ja.'))))
    await turn(engine, { provider: 'openai', model: 'gpt-4o-mini' }, 'max')
    expect(built[0]?.maxTokens).toBeUndefined()
  })

  it('gives Max the time of a task: thinking deeper takes longer than one question may', async () => {
    const slow = () => new ReplyModel(new AIMessage('Ja, nach § 9 EStG.'), 150)
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key' }, null, 50), slow)
    expect((await turn(engine, undefined, 'max')).mode).toBe('langgraph')
    expect((await turn(engine)).mode).toBe('deterministic_fallback')
  })

  it('gives the fallback model its own deepest setting when it answers a Max question', async () => {
    const built: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime({ anthropic: 'anthropic-key' }, {}), (config) => {
      built.push(config)
      return config.provider === 'anthropic' ? new ReplyModel(new Error('[529] overloaded')) : new ReplyModel(new AIMessage('Ja.'))
    })
    const done = await turn(engine, undefined, 'max')
    expect(done.provider).toBe('google-genai')
    expect(built.find((c) => c.provider === 'google-genai')).toMatchObject({ model: 'gemini-3.8-flash', thinkingLevel: 'high' })
  })
})
