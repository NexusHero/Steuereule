// #476: the owl's line of thought, what a turn cost, and a system prompt providers can cache.
import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import { buildRecordHandles, type AdvisorPreviewTarget, type AdvisorStreamEvent, type AdvisorTurnRequest, type AdvisorTurnResult, type CaseDigest } from '@steuereule/core'
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
  unresolvedRejections,
} from '../src/ki/langgraph-advisor.engine.js'
import { AI_WRITABLE_FIELDS, describeAiWritableFields, validateStageTarget } from '../src/ki/advisor-safety.js'

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

async function run(engine: LangGraphAdvisorEngine, extra: Partial<Pick<AdvisorTurnRequest, 'planRequired' | 'records' | 'previewEffect' | 'notes'>> = {}) {
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
    expect(stable).not.toContain('PII-freier Fall-Überblick')
    expect(stable).not.toContain('"grossWageEur"')
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

  it('is on unless switched off (#481)', async () => {
    expect((await env({}).resolveSlot('advisor_chat')).reasoning).toBe('summary')
    expect((await env({ AI_ADVISOR_REASONING: 'off' }).resolveSlot('advisor_chat')).reasoning).toBeUndefined()
  })

  it('thinks at the medium level by default (#481)', async () => {
    expect((await env({}).resolveSlot('advisor_chat')).thinkingLevel).toBe('medium')
    expect((await env({ AI_ADVISOR_THINKING_LEVEL: 'high' }).resolveSlot('advisor_chat')).thinkingLevel).toBe('high')
    expect((await env({ AI_ADVISOR_THINKING_LEVEL: 'auto' }).resolveSlot('advisor_chat')).thinkingLevel).toBeUndefined()
    expect((await env({ AI_ADVISOR_THINKING_LEVEL: 'unsinn' }).resolveSlot('advisor_chat')).thinkingLevel).toBe('medium')
    expect((await env({ AI_ADVISOR_THINKING_LEVEL: 'low' }).resolveSlot('advisor_chat')).thinkingLevel).toBe('low')
    expect((await env({}).resolveSlot('vision_ocr')).thinkingLevel).toBeUndefined()
  })

  it('hands Gemini the level and the wish to see the thoughts', () => {
    const model = createChatModelFromConfig({ slot: 'advisor_chat', enabled: true, provider: 'google-genai', model: 'test-model', apiKey: 'test-only-key', reasoning: 'summary', thinkingLevel: 'low' }) as unknown as { thinkingConfig?: unknown }
    expect(model.thinkingConfig).toEqual({ includeThoughts: true, thinkingLevel: 'LOW' })
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

describe('the owl knows the real field names (#476, found by playing a customer against Gemini)', () => {
  it('lists the fields of every screen it may write, with the allowed answers of interview questions', () => {
    const catalog = describeAiWritableFields()
    expect(catalog).toContain('- lstb: ')
    expect(catalog).toContain('bruttoarbeitslohn')
    expect(catalog).toContain('oneWayKm')
    expect(catalog).toMatch(/homeoffice \(„[^“]+“ \|/)
    expect(catalog).toContain('weg (ganze Zahl 0–999)')
    expect(catalog).toContain('kind [braucht `instance`]')
    // The model wrote „Pkw“; the mask only takes the exact values.
    expect(catalog).toContain('transport („pkw“ | „oepnv“ | „andere“)')
    expect(catalog).toContain('registeredWithMeAllYear („true“ | „false“)')
    expect(catalog).toContain('rentenart („GesetzlicheRente“')
  })

  it('offers no protected screen and no protected field', () => {
    const catalog = describeAiWritableFields()
    for (const forbidden of ['- profil', '- stammdaten', '- kopplung', 'steuerId', 'iban', 'firstName']) {
      expect(catalog, forbidden).not.toContain(forbidden)
    }
    expect(AI_WRITABLE_FIELDS.profil).toBeUndefined()
  })

  it('puts the list into the stable, cacheable part of the system prompt', () => {
    expect(buildStableSystemPrompt()).toContain(describeAiWritableFields())
  })

  it('offers the training cost amount and tells the model how to record it', () => {
    expect(describeAiWritableFields()).toContain('fortbildung-kosten (ganze Zahl 0–100000)')
    expect(validateStageTarget('interview', 'fortbildung-kosten')).toEqual({ ok: true, screen: 'interview' })
    const prompt = buildStableSystemPrompt()
    expect(prompt).toContain('`interview.fortbildung-kosten`')
    // Found in the customer run: vacation and sick days were never asked for, so commute days were too high.
    expect(prompt).toContain('`commute.vacationDays`')
    expect(prompt).toContain('`commute.sickDays`')
  })

  it('refuses a field name guessed from the case overview and names the valid ones', () => {
    const guessed = validateStageTarget('lstb', 'grossWageEur')
    expect(guessed.ok).toBe(false)
    if (!guessed.ok) {
      expect(guessed.error).toContain('UNKNOWN_FIELD')
      expect(guessed.error).toContain('bruttoarbeitslohn')
      expect(guessed.locked).toBeUndefined()
    }
    expect(validateStageTarget('lstb', 'bruttoarbeitslohn')).toEqual({ ok: true, screen: 'lstb' })
    expect(validateStageTarget('commute', 'oneWayKm')).toEqual({ ok: true, screen: 'commute' })
  })

  it('still treats a protected field as locked, not as unknown', () => {
    const locked = validateStageTarget('lstb', 'steuerId')
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.error).toContain('AI_WRITE_FORBIDDEN')
  })

  it('never leaves a draft behind for a field that does not exist', async () => {
    const guess = chunkOf({
      content: '',
      tool_call_chunks: [{ name: 'stage_field_draft', args: JSON.stringify({ screen: 'lstb', field: 'grossWageEur', newValue: '62000', label: 'Bruttolohn' }), index: 0, id: 'c1' }],
    })
    const model = new ChunkedChatModel([[guess], [answer('Das Feld gibt es so nicht.')]])
    const { events, result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(events.some((e) => e.event === 'action')).toBe(false)
    expect(result.meta.action).toBeUndefined()
    // The model was told which names exist.
    const toolResult = model.seenMessages[1]!.at(-1)!
    expect(String(toolResult.content)).toContain('bruttoarbeitslohn')
  })

  it('makes the model answer in words once the tool rounds are used up', async () => {
    const model = new ChunkedChatModel([[answer('Antwort.')]])
    await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(model.toolChoices).toContain('none')
  })
})

describe('values are checked against the field catalogue before a draft exists (ADR-0066)', () => {
  const stage = (args: Record<string, unknown>): AIMessageChunk =>
    chunkOf({ content: '', tool_call_chunks: [{ name: 'stage_field_draft', args: JSON.stringify({ label: 'Entwurf', ...args }), index: 0, id: 'c1' }] })

  it('stores the tidied value in the draft, for the main field and for companions', async () => {
    const model = new ChunkedChatModel([
      [stage({ screen: 'commute', field: 'oneWayKm', newValue: '38', companionFields: { transport: 'Pkw', workdays: '1, 2,3,4,5' } })],
      [answer('Entwurf angelegt.')],
    ])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action).toMatchObject({ field: 'oneWayKm', newValue: '38', companionFields: { transport: 'pkw', workdays: '1,2,3,4,5' } })
  })

  it('turns an amount written with separators and currency into plain digits', async () => {
    const model = new ChunkedChatModel([[stage({ screen: 'lstb', field: 'bruttoarbeitslohn', newValue: '62.000 €' })], [answer('ok')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action?.newValue).toBe('62000')
  })

  it('makes no draft for a value the field cannot hold, and tells the model why', async () => {
    const model = new ChunkedChatModel([[stage({ screen: 'rente', field: 'rentenart', newValue: 'Gesetzliche Altersrente' })], [answer('Das ging nicht.')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action).toBeUndefined()
    const toolResult = String(model.seenMessages[1]!.at(-1)!.content)
    expect(toolResult).toContain('INVALID_VALUE')
    expect(toolResult).toContain('GesetzlicheRente')
  })

  it('refuses the whole draft when one companion value is wrong', async () => {
    const model = new ChunkedChatModel([
      [stage({ screen: 'commute', field: 'oneWayKm', newValue: '38', companionFields: { transport: 'Fahrrad' } })],
      [answer('Das ging nicht.')],
    ])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action).toBeUndefined()
  })
})

describe('several drafts in one answer (ADR-0066)', () => {
  const call = (index: number, args: Record<string, unknown>) => ({ name: 'stage_field_draft', args: JSON.stringify(args), index, id: `c${index}` })
  const stageAll = (...calls: Array<Record<string, unknown>>): AIMessageChunk => chunkOf({ content: '', tool_call_chunks: calls.map((args, i) => call(i, args)) })

  const HOMEOFFICE = { screen: 'commute', field: 'homeOfficeDays', newValue: '30', label: 'Homeoffice-Tage' }
  const HANDWERKER = { screen: 'interview', field: 'haushalt-handwerker-betrag', newValue: '5000', label: 'Handwerkerkosten', companionFields: { 'haushalt-gate': 'Ja' } }
  const SPENDEN = { screen: 'interview', field: 'spenden-betrag', newValue: '200', label: 'Spenden', companionFields: { spenden: 'Ja' } }

  it('keeps every draft of one message: three things said, three drafts made', async () => {
    // The customer run: „30 Tage Homeoffice, 5.000 € Handwerker, 200 € Spenden“ left one draft and a
    // reply that claimed three.
    const model = new ChunkedChatModel([[stageAll(HOMEOFFICE, HANDWERKER, SPENDEN)], [answer('Drei Entwürfe.')]])
    const { events, result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))

    expect(result.meta.action).toBeUndefined()
    expect(result.meta.actions?.map((a) => `${a.screen}.${a.field}=${a.newValue}`)).toEqual([
      'commute.homeOfficeDays=30',
      'interview.haushalt-handwerker-betrag=5000',
      'interview.spenden-betrag=200',
    ])
    expect(new Set(result.meta.actions?.map((a) => a.actionId)).size).toBe(3)
    expect(events.filter((e) => e.event === 'action')).toHaveLength(3)
  })

  it('collects drafts over several tool rounds too', async () => {
    const model = new ChunkedChatModel([[stageAll(HOMEOFFICE)], [stageAll(SPENDEN)], [answer('Zwei Entwürfe.')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.actions).toHaveLength(2)
  })

  it('keeps a single draft where it always was', async () => {
    const model = new ChunkedChatModel([[stageAll(SPENDEN)], [answer('Ein Entwurf.')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action?.field).toBe('spenden-betrag')
    expect(result.meta.actions).toBeUndefined()
  })

  it('treats a second draft for the same field as a correction, not as a second draft', async () => {
    const model = new ChunkedChatModel([[stageAll(HOMEOFFICE)], [stageAll({ ...HOMEOFFICE, newValue: '45' })], [answer('Korrigiert.')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action?.newValue).toBe('45')
    expect(result.meta.actions).toBeUndefined()
  })

  it('says under the answer what could not be prepared, when the model does not get it right', async () => {
    const model = new ChunkedChatModel([
      [stageAll(SPENDEN, { screen: 'rente', field: 'rentenart', newValue: 'Gesetzliche Altersrente', label: 'Rentenart' })],
      [answer('Ich habe beides vorbereitet.')],
    ])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action?.field).toBe('spenden-betrag')
    expect(result.meta.notStaged).toHaveLength(1)
    expect(result.meta.notStaged![0]).toMatchObject({ label: 'Rentenart' })
    expect(result.meta.notStaged![0]!.reason).toContain('GesetzlicheRente')
    expect(result.meta.notStaged![0]!.reason).not.toMatch(/^[A-Z_]+:/)
  })

  it('forgets a refusal once the corrected draft went through', async () => {
    const model = new ChunkedChatModel([
      [stageAll({ screen: 'rente', field: 'rentenart', newValue: 'Gesetzliche Altersrente', label: 'Rentenart' })],
      [stageAll({ screen: 'rente', field: 'rentenart', newValue: 'GesetzlicheRente', label: 'Rentenart' })],
      [answer('Vorbereitet.')],
    ])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.action?.newValue).toBe('GesetzlicheRente')
    expect(result.meta.notStaged).toBeUndefined()
  })

  it('stops a model that keeps producing drafts', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ screen: 'chLohnausweis', field: ['lohn', 'gehaltsnebenleistungen', 'unregelmaessige-leistungen', 'kapitalleistungen', 'beteiligungsrechte', 'sitzungsgelder', 'andere-leistungen', 'bruttolohn-total', 'ahv-beitraege', 'berufliche-vorsorge'][i]!, newValue: '100', label: `Feld ${i}` }))
    const model = new ChunkedChatModel([[stageAll(...many)], [answer('Viele.')]])
    const { result } = await run(new LangGraphAdvisorEngine(runtime('google-genai'), () => model))
    expect(result.meta.actions).toHaveLength(8)
  })
})

describe('unresolvedRejections', () => {
  it('lists each refused draft once', () => {
    const rejected = [
      { label: 'Miete', screen: 'vermietung', reason: 'kein Objekt' },
      { label: 'Miete', screen: 'vermietung', reason: 'kein Objekt' },
    ]
    expect(unresolvedRejections(rejected, [])).toEqual([{ label: 'Miete', reason: 'kein Objekt' }])
  })
})

describe('rental objects and children by their neutral name (ADR-0066)', () => {
  const stage = (args: Record<string, unknown>): AIMessageChunk =>
    chunkOf({ content: '', tool_call_chunks: [{ name: 'stage_field_draft', args: JSON.stringify(args), index: 0, id: 'c0' }] })
  const RENT = { screen: 'vermietung', field: 'mieteinnahmen', newValue: '9600', label: 'Mieteinnahmen' }
  const two = { vermietung: buildRecordHandles('vermietung', ['rent-a', 'rent-b']) }
  const engineWith = (model: ChunkedChatModel) => new LangGraphAdvisorEngine(runtime('google-genai'), () => model)

  it('puts the stored record behind „Objekt 2“ into the draft', async () => {
    const model = new ChunkedChatModel([[stage({ ...RENT, instance: 'Objekt 2' })], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model), { records: two })
    expect(result.meta.action).toMatchObject({ screen: 'vermietung', field: 'mieteinnahmen', instance: 'rent-b', newValue: '9600', label: 'Mieteinnahmen (Objekt 2)' })
  })

  it('never shows the model the id', async () => {
    const model = new ChunkedChatModel([[stage({ ...RENT, instance: 'Objekt 2' })], [answer('Vorbereitet.')]])
    await run(engineWith(model), { records: two })
    const seen = JSON.stringify(model.seenMessages.map((round) => round.map((m) => m.content)))
    expect(seen).toContain('Objekt 1, Objekt 2')
    expect(seen).not.toContain('rent-a')
    expect(seen).not.toContain('rent-b')
  })

  it('needs no name while there is one record', async () => {
    const model = new ChunkedChatModel([[stage(RENT)], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model), { records: { vermietung: buildRecordHandles('vermietung', ['only']) } })
    expect(result.meta.action?.instance).toBe('only')
  })

  it('asks instead of guessing when several records fit', async () => {
    const model = new ChunkedChatModel([[stage(RENT)], [answer('Für welches Objekt?')]])
    const { result } = await run(engineWith(model), { records: two })
    expect(result.meta.action).toBeUndefined()
    // A question to the user is not a failure to report.
    expect(result.meta.notStaged).toBeUndefined()
    expect(JSON.stringify(model.seenMessages[1]!.map((m) => m.content))).toContain('RECORD_REQUIRED')
  })

  it('refuses an invented record', async () => {
    const model = new ChunkedChatModel([[stage({ ...RENT, instance: 'Ferienwohnung Sylt' })], [answer('Hm.')]])
    const { result } = await run(engineWith(model), { records: two })
    expect(result.meta.action).toBeUndefined()
    expect(result.meta.notStaged?.[0]?.reason).toContain('Objekt 1, Objekt 2')
  })

  it('sends the user to the mask when no record exists: the owl creates none', async () => {
    const model = new ChunkedChatModel([[stage({ ...RENT, instance: 'Objekt 1' })], [answer('Lege das Objekt bitte an.')]])
    const { events, result } = await run(engineWith(model))
    expect(result.meta.action).toBeUndefined()
    expect(result.meta.notStaged).toEqual([{ label: 'Mieteinnahmen', reason: expect.stringContaining('Maske Vermietung'), screen: 'vermietung' }])
    expect(events.find((e) => e.event === 'ui_command')?.data).toMatchObject({ openMask: 'vermietung' })
  })

  it('addresses a child the same way, and tidies „Ja“ into the stored form', async () => {
    const model = new ChunkedChatModel([
      [stage({ screen: 'kind', field: 'childBenefitToMeAllYear', newValue: 'Ja', label: 'Kindergeld ganzjährig', instance: 'Kind 1' })],
      [answer('Vorbereitet.')],
    ])
    const { result } = await run(engineWith(model), { records: { kind: buildRecordHandles('kind', ['child-1']) } })
    expect(result.meta.action).toMatchObject({ screen: 'kind', instance: 'child-1', newValue: 'true' })
  })

  it('ignores an instance on a mask that has only one record per case', async () => {
    const model = new ChunkedChatModel([[stage({ screen: 'commute', field: 'homeOfficeDays', newValue: '30', label: 'Homeoffice-Tage', instance: '1' })], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model))
    expect(result.meta.action?.instance).toBeNull()
  })
})

describe('the effect of a draft comes from the app\'s estimate (ADR-0066)', () => {
  const stage = (args: Record<string, unknown>): AIMessageChunk =>
    chunkOf({ content: '', tool_call_chunks: [{ name: 'stage_field_draft', args: JSON.stringify(args), index: 0, id: 'c0' }] })
  const SPENDEN = { screen: 'interview', field: 'spenden-betrag', newValue: '300', label: 'Spenden', companionFields: { spenden: 'Ja' } }
  const engineWith = (model: ChunkedChatModel) => new LangGraphAdvisorEngine(runtime('google-genai'), () => model)

  it('takes the figures from the estimate and marks them as computed', async () => {
    const asked: AdvisorPreviewTarget[] = []
    const model = new ChunkedChatModel([[stage(SPENDEN)], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model), {
      previewEffect: async (target) => {
        asked.push(target)
        return { kind: 'computed', beforeRefundEur: 2000, afterRefundEur: 2096, deltaEur: 96 }
      },
    })
    expect(result.meta.action).toMatchObject({ effect: 'computed', beforeRefundEur: 2000, afterRefundEur: 2096, deltaEur: 96 })
    // The whole draft is previewed, the gate before the amount it opens.
    expect(asked).toEqual([{ screen: 'interview', instance: null, values: [['spenden', 'Ja'], ['spenden-betrag', '300']] }])
    expect(JSON.stringify(model.seenMessages[1]!.map((m) => m.content))).toContain('\\"deltaEur\\":96')
  })

  it('shows no figure when the estimate cannot say, and tells why', async () => {
    const model = new ChunkedChatModel([[stage(SPENDEN)], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model), {
      previewEffect: async () => ({ kind: 'not-computable', hint: 'Wirkung erst berechenbar, wenn die Lohnsteuerbescheinigung da ist.' }),
    })
    expect(result.meta.action).toMatchObject({ effect: 'not-computable', deltaEur: 0, beforeRefundEur: 0, afterRefundEur: 0, effectHint: expect.stringContaining('Lohnsteuerbescheinigung') })
  })

  it('still makes the draft when the preview breaks, without inventing a figure', async () => {
    const model = new ChunkedChatModel([[stage(SPENDEN)], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model), {
      previewEffect: async () => {
        throw new Error('database away')
      },
    })
    expect(result.meta.action).toMatchObject({ newValue: '300', effect: 'not-computable', deltaEur: 0 })
  })

  it('keeps the approximation, unmarked, where no estimate is offered', async () => {
    const model = new ChunkedChatModel([[stage(SPENDEN)], [answer('Vorbereitet.')]])
    const { result } = await run(engineWith(model))
    expect(result.meta.action?.effect).toBeUndefined()
  })

  it('answers a what-if question from the estimate as well', async () => {
    const model = new ChunkedChatModel([
      [chunkOf({ content: '', tool_call_chunks: [{ name: 'simulate_tax_delta', args: JSON.stringify({ screen: 'commute', field: 'homeOfficeDays', newValue: '60' }), index: 0, id: 'c0' }] })],
      [answer('Das brächte 120 €.')],
    ])
    await run(engineWith(model), { previewEffect: async () => ({ kind: 'computed', beforeRefundEur: 100, afterRefundEur: 220, deltaEur: 120 }) })
    const toolResult = JSON.stringify(model.seenMessages[1]!.map((m) => m.content))
    expect(toolResult).toContain('\\"effect\\":\\"computed\\"')
    expect(toolResult).toContain('\\"deltaEur\\":120')
  })
})

describe('the finished answer is checked without a model (ADR-0066 §7)', () => {
  const engineWith = (model: ChunkedChatModel) => new LangGraphAdvisorEngine(runtime('google-genai'), () => model)
  const simulate = chunkOf({ content: '', tool_call_chunks: [{ name: 'simulate_tax_delta', args: JSON.stringify({ screen: 'commute', field: 'homeOfficeDays', newValue: '60' }), index: 0, id: 'c0' }] })

  it('says so when the text names an effect no tool computed', async () => {
    const { result } = await run(engineWith(new ChunkedChatModel([[answer('Das bringt dir rund 450 € Erstattung.')]])))
    expect(result.meta.notices?.map((n) => n.kind)).toEqual(['unbacked-amount'])
  })

  it('accepts a figure a tool reported in this turn', async () => {
    const model = new ChunkedChatModel([[simulate], [answer('Das bringt dir 120 € Erstattung.')]])
    const { result } = await run(engineWith(model), { previewEffect: async () => ({ kind: 'computed', beforeRefundEur: 100, afterRefundEur: 220, deltaEur: 120 }) })
    expect(result.meta.notices).toBeUndefined()
  })

  it('corrects a claim to have written something', async () => {
    const { result } = await run(engineWith(new ChunkedChatModel([[answer('Ich habe deine Homeoffice-Tage eingetragen.')]])))
    expect(result.meta.notices?.map((n) => n.kind)).toContain('claims-write')
  })

  it('leaves an ordinary answer without notices', async () => {
    const { result } = await run(engineWith(new ChunkedChatModel([[answer('Die Entfernungspauschale gilt für die einfache Strecke.')]])))
    expect(result.meta.notices).toBeUndefined()
  })
})

describe('summarising a conversation (#481)', () => {
  /** A model that answers a plain call with one prepared text and remembers what it was shown. */
  class OneShotModel extends BaseChatModel {
    readonly seen: string[] = []
    constructor(private readonly reply: string) {
      super({})
    }
    _llmType(): string {
      return 'one-shot-test'
    }
    async _generate(messages: BaseMessage[]): Promise<ChatResult> {
      this.seen.push(messages.map((m) => String(m.content)).join('\n---\n'))
      const message = new AIMessageChunk({ content: this.reply })
      return { generations: [{ text: this.reply, message }] }
    }
  }
  const TRANSCRIPT = 'Nutzer: Mein Arbeitsweg sind 38 km.\nEule: Vorbereitet. [Vorschlag „Entfernung“ → 38: übernommen]'

  it('asks the model without tools and returns its summary', async () => {
    const model = new OneShotModel('- Arbeitsweg 38 km, übernommen')
    const engine = new LangGraphAdvisorEngine(runtime('google-genai'), () => model)
    expect(await engine.summarize({ transcript: TRANSCRIPT, previousSummary: 'Früher: 300 € Spende.' })).toBe('- Arbeitsweg 38 km, übernommen')
    expect(model.seen[0]).toContain('erfinde nichts dazu')
    expect(model.seen[0]).toContain('Früher: 300 € Spende.')
    expect(model.seen[0]).toContain('38 km')
  })

  it('asks for the quick variant of the model: no line of thought for a summary', async () => {
    const configs: ResolvedAiSlotConfig[] = []
    const engine = new LangGraphAdvisorEngine(runtime('google-genai', { reasoning: 'summary', thinkingLevel: 'medium' }), (config) => {
      configs.push(config)
      return new OneShotModel('Kurz.')
    })
    await engine.summarize({ transcript: TRANSCRIPT, previousSummary: null })
    expect(configs[0]).toMatchObject({ thinkingLevel: 'low' })
    expect(configs[0]!.reasoning).toBeUndefined()
  })

  it('has no summary without a real model', async () => {
    const engine = new LangGraphAdvisorEngine(runtime('deterministic'), () => new OneShotModel('x'))
    expect(await engine.summarize({ transcript: TRANSCRIPT, previousSummary: null })).toBeNull()
  })

  it('throws away a summary that carries an identifier', async () => {
    const engine = new LangGraphAdvisorEngine(runtime('google-genai'), () => new OneShotModel('IBAN DE89370400440532013000 genannt'))
    expect(await engine.summarize({ transcript: TRANSCRIPT, previousSummary: null })).toBeNull()
  })

  it('has no summary when the model fails, instead of failing the turn', async () => {
    const engine = new LangGraphAdvisorEngine(runtime('google-genai'), () => {
      throw new Error('provider away')
    })
    expect(await engine.summarize({ transcript: TRANSCRIPT, previousSummary: null })).toBeNull()
  })
})

describe('the owl keeps project notes itself (#481)', () => {
  const callTool = (name: string, args: Record<string, unknown>, index = 0) => ({ name, args: JSON.stringify(args), index, id: `n${index}` })
  const tools = (...calls: Array<ReturnType<typeof callTool>>): AIMessageChunk => chunkOf({ content: '', tool_call_chunks: calls })
  const engineWith = (model: ChunkedChatModel) => new LangGraphAdvisorEngine(runtime('google-genai'), () => model)
  const NOTES = [
    { handle: 'Notiz 1', id: 'note-id-aaa', text: 'Arbeitsweg 38 km.' },
    { handle: 'Notiz 2', id: 'note-id-bbb', text: 'Fahrtenbuch wird nachgereicht.' },
  ]

  it('notes something new, tidied to one line', async () => {
    const model = new ChunkedChatModel([[tools(callTool('remember_note', { text: '  Arbeitszimmer geprüft:\n lohnt sich nicht ' }))], [answer('Gemerkt.')]])
    const { result } = await run(engineWith(model), { notes: NOTES })
    expect(result.meta.noteChanges).toEqual([{ kind: 'added', text: 'Arbeitszimmer geprüft: lohnt sich nicht' }])
  })

  it('tells the model the notes of the year by name, never by id', async () => {
    const model = new ChunkedChatModel([[answer('Hallo.')]])
    await run(engineWith(model), { notes: NOTES })
    const seen = JSON.stringify(model.seenMessages[0]!.map((m) => m.content))
    expect(seen).toContain('Notiz 2: Fahrtenbuch wird nachgereicht.')
    expect(seen).not.toContain('note-id-bbb')
  })

  it('replaces and forgets a note by its name', async () => {
    const model = new ChunkedChatModel([
      [tools(callTool('replace_note', { note: 'Notiz 1', text: 'Arbeitsweg 40 km.' }, 0), callTool('forget_note', { note: 'Notiz 2' }, 1))],
      [answer('Aktualisiert.')],
    ])
    const { result } = await run(engineWith(model), { notes: NOTES })
    expect(result.meta.noteChanges).toEqual([
      { kind: 'replaced', noteId: 'note-id-aaa', text: 'Arbeitsweg 40 km.', previousText: 'Arbeitsweg 38 km.' },
      { kind: 'removed', noteId: 'note-id-bbb', text: 'Fahrtenbuch wird nachgereicht.' },
    ])
  })

  it('refuses a note it does not know, one with an identifier, and one too long', async () => {
    const model = new ChunkedChatModel([
      [
        tools(
          callTool('forget_note', { note: 'Notiz 9' }, 0),
          callTool('remember_note', { text: 'Konto DE89370400440532013000' }, 1),
          callTool('remember_note', { text: 'x'.repeat(250) }, 2),
        ),
      ],
      [answer('Hm.')],
    ])
    const { result } = await run(engineWith(model), { notes: NOTES })
    expect(result.meta.noteChanges).toBeUndefined()
    const toolResults = JSON.stringify(model.seenMessages[1]!.map((m) => m.content))
    expect(toolResults).toContain('UNKNOWN_NOTE')
    expect(toolResults).toContain('persönlichen Daten')
    expect(toolResults).toContain('höchstens 200 Zeichen')
  })

  it('does not note the same thing twice, and stops at the limit', async () => {
    const twice = new ChunkedChatModel([[tools(callTool('remember_note', { text: 'Arbeitsweg 38 km.' }))], [answer('Schon bekannt.')]])
    expect((await run(engineWith(twice), { notes: NOTES })).result.meta.noteChanges).toBeUndefined()

    const full = Array.from({ length: 20 }, (_, i) => ({ handle: `Notiz ${i + 1}`, id: `n-${i}`, text: `Notiz ${i}` }))
    const over = new ChunkedChatModel([[tools(callTool('remember_note', { text: 'Noch eine.' }))], [answer('Voll.')]])
    const { result } = await run(engineWith(over), { notes: full })
    expect(result.meta.noteChanges).toBeUndefined()
    expect(JSON.stringify(over.seenMessages[1]!.map((m) => m.content))).toContain('TOO_MANY_NOTES')
  })
})

describe('a model that does not answer says why (#486)', () => {
  /** A model that streams `before` and then fails with `error`. */
  class FailingModel extends BaseChatModel {
    constructor(private readonly before: string[], private readonly error: Error) {
      super({})
    }
    _llmType(): string {
      return 'failing-test'
    }
    override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
      return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
    }
    async _generate(): Promise<ChatResult> {
      throw this.error
    }
    override async *_streamResponseChunks(): AsyncGenerator<ChatGenerationChunk> {
      for (const text of this.before) yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) })
      throw this.error
    }
  }
  const quota = new Error('[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent?alt=sse: [429 Too Many Requests] Resource has been exhausted')
  const engineWith = (model: BaseChatModel) => new LangGraphAdvisorEngine(runtime('google-genai'), () => model)

  it('answers from the rules when the model fails before the first word, and keeps the reason with the answer', async () => {
    const { result, events } = await run(engineWith(new FailingModel([], quota)))
    expect(result.mode).toBe('deterministic_fallback')
    expect(result.meta.modelFailure).toEqual({ reason: 'quota', detail: 'Gemini · HTTP 429' })
    expect(events.some((e) => e.event === 'error')).toBe(false)
  })

  it('ends with an error that names the reason when the model breaks off halfway', async () => {
    const { events } = await run(engineWith(new FailingModel(['Die Entfernungs'], new Error('[GoogleGenerativeAI Error]: Error reading from the stream'))))
    const error = events.find((e) => e.event === 'error')
    expect(error?.data).toMatchObject({ code: 'ADVISOR_TURN_FAILED', failure: { reason: 'network', detail: 'Gemini' } })
    expect(error).toBeDefined()
    expect((error!.data as { message: string }).message).toContain('Verbindung zum Sprachmodell')
  })

  it('does not blame the model when no model is configured at all', async () => {
    const { result } = await run(new LangGraphAdvisorEngine(runtime('deterministic'), () => new FailingModel([], quota)))
    expect(result.meta.modelFailure).toBeUndefined()
  })
})
