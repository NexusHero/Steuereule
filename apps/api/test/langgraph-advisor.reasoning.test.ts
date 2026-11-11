// #476: the owl's line of thought, what a turn cost, and a system prompt providers can cache.
import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { AdvisorStreamEvent, AdvisorTurnResult, CaseDigest } from '@steuereule/core'
import { Logger } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  DEFAULT_AI_TURN_LIMITS,
  EnvAiRuntimeConfigService,
  type AiProviderKind,
  type AiRuntimeConfigService,
  type ResolvedAiSlotConfig,
} from '../src/ki/ai-runtime-config.service.js'
import { createChatModelFromConfig } from '../src/ki/chat-model.factory.js'
import {
  buildStableSystemPrompt,
  buildSystemMessage,
  buildToolSchemas,
  toProviderToolSchema,
  extractReasoningText,
  LangGraphAdvisorEngine,
} from '../src/ki/langgraph-advisor.engine.js'

const digest: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: 65000, wageTaxEur: 12500, socialSecurityEur: 12000 },
  crossBorder: {
    isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null,
    healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null,
  },
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: 'Nie', homeOfficeDays: 0, distanceKm: 15 },
  catalogExpenses: {
    hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

/** Streams the given chunks round by round and remembers what it was asked. */
class ChunkedChatModel extends BaseChatModel {
  readonly seenMessages: BaseMessage[][] = []
  readonly toolChoices: unknown[] = []
  private round = 0

  constructor(private readonly rounds: ReadonlyArray<readonly AIMessageChunk[]>) {
    super({})
  }

  _llmType(): string {
    return 'chunked-test'
  }

  override bindTools(_tools: BindToolsInput[], kwargs?: Partial<BaseChatModelCallOptions>): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    this.toolChoices.push((kwargs as { tool_choice?: unknown } | undefined)?.tool_choice ?? null)
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }

  async _generate(): Promise<ChatResult> {
    throw new Error('not used')
  }

  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    this.seenMessages.push(messages)
    const chunks = this.rounds[this.round] ?? [new AIMessageChunk({ content: 'Fertig.' })]
    this.round += 1
    for (const message of chunks) {
      yield new ChatGenerationChunk({ text: typeof message.content === 'string' ? message.content : '', message })
    }
  }
}

function runtime(provider: AiProviderKind, extra: Partial<ResolvedAiSlotConfig> = {}): AiRuntimeConfigService {
  return {
    resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
    isKillSwitchActive: async () => false,
    resolveSlot: async (slot) => ({ slot, enabled: true, provider, model: 'test-model', apiKey: 'test-only-key', ...extra }),
  }
}

async function run(engine: LangGraphAdvisorEngine, extra: { planRequired?: boolean } = {}) {
  const events: AdvisorStreamEvent[] = []
  for await (const ev of engine.streamTurn({ message: 'Lohnt sich mein Arbeitsweg?', digest, ...extra })) events.push(ev)
  const done = events.find((e) => e.event === 'done')
  return { events, result: done?.data as AdvisorTurnResult }
}

const thinking = (text: string): AIMessageChunk => new AIMessageChunk({ content: [{ type: 'thinking', thinking: text }] })
/** Test chunks carry provider-shaped fields the constructor's types are narrower than. */
const chunkOf = (fields: Record<string, unknown>): AIMessageChunk => new AIMessageChunk(fields as never)

const answer = (text: string, usage?: { input: number; output: number; cached?: number }): AIMessageChunk =>
  chunkOf({
    content: text,
    ...(usage
      ? {
          usage_metadata: {
            input_tokens: usage.input,
            output_tokens: usage.output,
            total_tokens: usage.input + usage.output,
            ...(usage.cached !== undefined ? { input_token_details: { cache_read: usage.cached } } : {}),
          },
        }
      : {}),
  })

describe('extractReasoningText', () => {
  it('reads Anthropic and Gemini thinking parts', () => {
    expect(extractReasoningText({ content: [{ type: 'thinking', thinking: 'A' }, { type: 'text', text: 'Antwort' }] })).toBe('A')
  })

  it('reads standard reasoning blocks and OpenAI summaries', () => {
    expect(extractReasoningText({ content: [{ type: 'reasoning', reasoning: 'B' }] })).toBe('B')
    expect(extractReasoningText({ content: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'C' }] }] })).toBe('C')
    expect(extractReasoningText({ content: '', additional_kwargs: { reasoning: { summary: [{ text: 'D' }] } } })).toBe('D')
  })

  it('yields nothing for plain answers and for redacted thinking', () => {
    expect(extractReasoningText({ content: 'Nur eine Antwort' })).toBe('')
    expect(extractReasoningText({ content: [{ type: 'redacted_thinking', data: 'opaque' }] })).toBe('')
  })
})

describe('LangGraphAdvisorEngine: reasoning and usage (#476)', () => {
  it('streams reasoning as its own events, never as part of the answer', async () => {
    const model = new ChunkedChatModel([[thinking('Erst die Pauschale '), thinking('prüfen.'), answer('Ja, das lohnt sich.')]])
    const { events, result } = await run(new LangGraphAdvisorEngine(runtime('anthropic'), () => model))

    const reasoning = events.filter((e) => e.event === 'reasoning').map((e) => (e.event === 'reasoning' ? e.data.text : ''))
    expect(reasoning).toEqual(['Erst die Pauschale ', 'prüfen.'])
    const tokens = events.filter((e) => e.event === 'token').map((e) => (e.event === 'token' ? e.data.text : '')).join('')
    expect(tokens).toBe('Ja, das lohnt sich.')
    expect(result.replyText).toBe('Ja, das lohnt sich.')
    expect(result.reasoning).toBe('Erst die Pauschale prüfen.')
  })

  it('separates the thoughts of two model rounds with a blank line', async () => {
    const toolCall = new AIMessageChunk({
      content: [{ type: 'thinking', thinking: 'Ich schlage die Quelle nach.' }],
      tool_call_chunks: [{ name: 'lookup_legal_source', args: JSON.stringify({ sourceId: 'estg-9-1' }), index: 0, id: 'c1' }],
    })
    const model = new ChunkedChatModel([[toolCall], [thinking('Jetzt antworte ich.'), answer('Antwort.')]])
    const { events, result } = await run(new LangGraphAdvisorEngine(runtime('anthropic'), () => model))

    expect(result.reasoning).toBe('Ich schlage die Quelle nach.\n\nJetzt antworte ich.')
    const streamed = events.filter((e) => e.event === 'reasoning').map((e) => (e.event === 'reasoning' ? e.data.text : '')).join('')
    expect(streamed).toBe(result.reasoning)
  })

  it('leaves reasoning out entirely when the model supplies none', async () => {
    const model = new ChunkedChatModel([[answer('Antwort.')]])
    const { events, result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(events.some((e) => e.event === 'reasoning')).toBe(false)
    expect(result.reasoning).toBeUndefined()
  })

  it('adds up token usage over all rounds, including cache hits', async () => {
    const toolCall = chunkOf({
      content: '',
      tool_call_chunks: [{ name: 'lookup_legal_source', args: JSON.stringify({ sourceId: 'estg-9-1' }), index: 0, id: 'c1' }],
      usage_metadata: { input_tokens: 1500, output_tokens: 40, total_tokens: 1540, input_token_details: { cache_read: 1200 } },
    })
    const model = new ChunkedChatModel([[toolCall], [answer('Antwort.', { input: 1600, output: 60, cached: 1200 })]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('anthropic'), () => model))
    expect(result.usage).toEqual({ inputTokens: 3100, outputTokens: 100, cachedInputTokens: 2400 })
  })

  it('reports no usage rather than zeros when the provider sends none', async () => {
    const model = new ChunkedChatModel([[answer('Antwort.')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.usage).toBeUndefined()
  })
})

describe('system prompt built for provider-side caching (#476)', () => {
  it('keeps the stable part free of anything about the case', () => {
    const stable = buildStableSystemPrompt()
    expect(stable).toBe(buildStableSystemPrompt())
    expect(stable).not.toContain('65000')
    expect(stable).not.toContain('CaseDigest')
    expect(stable).not.toContain('Aktive Maske')
  })

  it('marks the stable block as a cache breakpoint for Anthropic and puts the case after it', () => {
    const content = buildSystemMessage('anthropic', digest, 'commute').content as Array<Record<string, unknown>>
    expect(content).toHaveLength(2)
    expect(content[0]).toMatchObject({ type: 'text', text: buildStableSystemPrompt(), cache_control: { type: 'ephemeral' } })
    expect(content[1]!.cache_control).toBeUndefined()
    expect(content[1]!.text).toContain('Aktive Maske: commute')
    expect(content[1]!.text).toContain('"grossWageEur":65000')
  })

  it('gives the other providers one string that starts with the identical stable prefix', () => {
    const a = buildSystemMessage('google-genai', digest, 'commute').content as string
    const b = buildSystemMessage('openai', { ...digest, childrenCount: 3 }, 'interview').content as string
    const stable = buildStableSystemPrompt()
    expect(a.startsWith(stable)).toBe(true)
    expect(b.startsWith(stable)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('sends that system message to the model', async () => {
    const model = new ChunkedChatModel([[answer('Antwort.')]])
    await run(new LangGraphAdvisorEngine(runtime('anthropic'), () => model))
    const system = model.seenMessages[0]![0]!
    expect(system.getType()).toBe('system')
    expect(Array.isArray(system.content)).toBe(true)
  })
})

describe('a forced plan and Anthropic thinking (#476)', () => {
  it('forces plan_steps as tool choice where the provider allows it', async () => {
    const model = new ChunkedChatModel([[answer('Antwort.')]])
    await run(new LangGraphAdvisorEngine(runtime('anthropic'), () => model), { planRequired: true })
    expect(model.toolChoices).toContain('plan_steps')
  })

  it('asks for the plan in words instead when thinking is on, because Anthropic rejects a forced tool then', async () => {
    const model = new ChunkedChatModel([[answer('Antwort.')]])
    await run(new LangGraphAdvisorEngine(runtime('anthropic', { reasoning: 'summary' }), () => model), { planRequired: true })
    expect(model.toolChoices).not.toContain('plan_steps')
    const system = model.seenMessages[0]![0]!.content as Array<{ text: string }>
    expect(system[1]!.text).toContain('Rufe als Erstes `plan_steps` auf')
    // The request to plan is case-specific and must not break the cached prefix.
    expect(system[0]!.text).toBe(buildStableSystemPrompt())
  })
})

describe('reasoning configuration (#476)', () => {
  const env = (extra: Record<string, string>) =>
    new EnvAiRuntimeConfigService({ AI_ADVISOR_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only-key', ...extra })

  it('is off unless asked for', async () => {
    expect((await env({}).resolveSlot('advisor_chat')).reasoning).toBeUndefined()
    expect((await env({ AI_ADVISOR_REASONING: 'off' }).resolveSlot('advisor_chat')).reasoning).toBeUndefined()
  })

  it('applies to the chat slot only', async () => {
    const config = env({ AI_ADVISOR_REASONING: 'summary', AI_ADVISOR_REASONING_BUDGET: '4000' })
    expect(await config.resolveSlot('advisor_chat')).toMatchObject({ reasoning: 'summary', reasoningBudgetTokens: 4000 })
    expect((await config.resolveSlot('vision_ocr')).reasoning).toBeUndefined()
  })

  const slot = (provider: AiProviderKind, extra: Partial<ResolvedAiSlotConfig> = {}): ResolvedAiSlotConfig => ({
    slot: 'advisor_chat', enabled: true, provider, model: 'test-model', apiKey: 'test-only-key', ...extra,
  })

  it('turns on Anthropic thinking with room left for the answer', () => {
    const model = createChatModelFromConfig(slot('anthropic', { reasoning: 'summary', reasoningBudgetTokens: 3000, maxTokens: 1000 })) as unknown as {
      thinking: unknown
      maxTokens: number
    }
    expect(model.thinking).toEqual({ type: 'enabled', budget_tokens: 3000 })
    expect(model.maxTokens).toBeGreaterThan(3000)
  })

  it('asks Gemini to include its thoughts', () => {
    const model = createChatModelFromConfig(slot('google-genai', { reasoning: 'summary' })) as unknown as { thinkingConfig?: unknown }
    expect(model.thinkingConfig).toEqual({ includeThoughts: true })
  })

  it('changes nothing about the models when reasoning is off', () => {
    const anthropic = createChatModelFromConfig(slot('anthropic')) as unknown as { thinking: { type: string } }
    expect(anthropic.thinking.type).toBe('disabled')
    const gemini = createChatModelFromConfig(slot('google-genai')) as unknown as { thinkingConfig?: unknown }
    expect(gemini.thinkingConfig).toBeUndefined()
  })
})

describe('tool schemas as the providers accept them (#476)', () => {
  const containsKey = (node: unknown, key: string): boolean => {
    if (Array.isArray(node)) return node.some((item) => containsKey(item, key))
    if (node === null || typeof node !== 'object') return false
    return Object.entries(node as Record<string, unknown>).some(([k, v]) => k === key || containsKey(v, key))
  }

  it('hands no tool to the model with a keyword Gemini rejects', () => {
    // Found against the real API: `propertyNames` (from z.record) made Gemini answer 400, and every
    // turn fell back to the deterministic engine without a trace.
    for (const tool of buildToolSchemas()) {
      expect(containsKey(tool.schema, 'propertyNames'), `${tool.name} carries propertyNames`).toBe(false)
      expect(containsKey(tool.schema, '$schema'), `${tool.name} carries $schema`).toBe(false)
    }
  })

  it('keeps the shape of a record field, so the model still knows what to send', () => {
    const schema = toProviderToolSchema(z.object({ companionFields: z.record(z.string().max(100), z.string().max(200)).optional() }))
    expect(schema).toEqual({
      type: 'object',
      properties: { companionFields: { type: 'object', additionalProperties: { type: 'string', maxLength: 200 } } },
      additionalProperties: false,
    })
  })

  it('logs why a model call failed instead of falling back in silence', async () => {
    const warnings: string[] = []
    const original = Logger.prototype.warn
    Logger.prototype.warn = function (message: unknown) {
      warnings.push(String(message))
    }
    try {
      const failing = new ChunkedChatModel([])
      failing._streamResponseChunks = (() => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('[400] Invalid JSON payload received. Unknown name "propertyNames"')),
        }),
      })) as never
      const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => failing))
      expect(result.mode).toBe('deterministic_fallback')
      expect(warnings.join('\n')).toContain('google-genai/test-model')
      expect(warnings.join('\n')).toContain('propertyNames')
    } finally {
      Logger.prototype.warn = original
    }
  })
})
