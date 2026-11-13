import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import type { AdvisorTurnResult, CaseDigest } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'

/** Answers every round with a tool call, slowly, unless it was bound without tools; logs how it was bound. */
class SlowToolCaller extends BaseChatModel {
  constructor(
    private readonly log: (string | undefined)[],
    private readonly choice?: string,
  ) {
    super({})
  }
  _llmType(): string {
    return 'slow-tool-caller'
  }
  override bindTools(_tools: BindToolsInput[], options?: { tool_choice?: string }): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return new SlowToolCaller(this.log, options?.tool_choice) as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    this.log.push(this.choice)
    if (this.choice === 'none') return { generations: [{ text: 'Antwort aus dem, was da ist.', message: new AIMessage('Antwort aus dem, was da ist.') }] }
    await new Promise((resolve) => setTimeout(resolve, 700))
    const message = new AIMessage({ content: '', tool_calls: [{ name: 'lookup_tax_knowledge', args: { topic: 'kennzahlen' }, id: `c${this.log.length}`, type: 'tool_call' }] })
    return { generations: [{ text: '', message }] }
  }
  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const msg = res.generations[0]!.message as AIMessage
    const toolCallChunks = msg.tool_calls?.map((tc, index) => ({ name: tc.name, args: JSON.stringify(tc.args), index, ...(tc.id !== undefined ? { id: tc.id } : {}) }))
    yield new ChatGenerationChunk({ text: String(msg.content), message: new AIMessageChunk({ content: String(msg.content), ...(toolCallChunks && toolCallChunks.length > 0 ? { tool_call_chunks: toolCallChunks } : {}) }) })
  }
}

/** Calls one tool, then ends silently while tools are offered; answers only when bound without tools. */
class SilentAfterTools extends BaseChatModel {
  constructor(
    private readonly log: (string | undefined)[],
    private readonly choice?: string,
  ) {
    super({})
  }
  _llmType(): string {
    return 'silent-after-tools'
  }
  override bindTools(_tools: BindToolsInput[], options?: { tool_choice?: string }): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return new SilentAfterTools(this.log, options?.tool_choice) as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.log.push(this.choice)
    const afterTools = messages.some((m) => m._getType() === 'tool')
    const message = this.choice === 'none' ? new AIMessage('Elterngeld ist steuerfrei, unterliegt aber dem Progressionsvorbehalt.') : afterTools ? new AIMessage('') : new AIMessage({ content: '', tool_calls: [{ name: 'lookup_tax_knowledge', args: { topic: 'kennzahlen' }, id: 'c1', type: 'tool_call' }] })
    return { generations: [{ text: String(message.content), message }] }
  }
  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const msg = res.generations[0]!.message as AIMessage
    const toolCallChunks = msg.tool_calls?.map((tc, index) => ({ name: tc.name, args: JSON.stringify(tc.args), index, ...(tc.id !== undefined ? { id: tc.id } : {}) }))
    yield new ChatGenerationChunk({ text: String(msg.content), message: new AIMessageChunk({ content: String(msg.content), ...(toolCallChunks && toolCallChunks.length > 0 ? { tool_call_chunks: toolCallChunks } : {}) }) })
  }
}

const DIGEST: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  profession: 'IT & Software',
  lstbPersonA: { grossWageEur: 65000, wageTaxEur: 12500, socialSecurityEur: 12000 },
  crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: 'Nie', homeOfficeDays: 0, distanceKm: 15 },
  catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

const runtime = (turnTimeoutMs: number): AiRuntimeConfigService => ({
  async resolveLimits() {
    return { ...DEFAULT_AI_TURN_LIMITS, turnTimeoutMs, maxToolRounds: 10 }
  },
  async isKillSwitchActive() {
    return false
  },
  async resolveSlot(slot) {
    return { slot, enabled: true, provider: 'google-genai', model: 'gemini-test', apiKey: 'k' }
  },
})

describe('the answer before the time runs out', () => {
  it('stops offering tools once the reserve is reached, so the turn ends with an answer instead of a timeout', async () => {
    const log: (string | undefined)[] = []
    // 3 s budget: half of it (the reserve of 20 s does not fit) is for tools, then the model has to answer.
    const engine = new LangGraphAdvisorEngine(runtime(3000), () => new SlowToolCaller(log))
    const result = (await engine.runTurn({ message: 'Was kann ich absetzen?', digest: DIGEST })) as AdvisorTurnResult
    expect(result.mode).toBe('langgraph')
    expect(result.replyText).toBe('Antwort aus dem, was da ist.')
    expect(log.at(-1)).toBe('none')
    expect(log.filter((choice) => choice !== 'none').length).toBeGreaterThanOrEqual(2)
  })

  it('asks once more when the model ends silently after tools, instead of a stock sentence', async () => {
    const log: (string | undefined)[] = []
    const engine = new LangGraphAdvisorEngine(runtime(60_000), () => new SilentAfterTools(log))
    const result = (await engine.runTurn({ message: 'Muss ich Elterngeld versteuern?', digest: DIGEST })) as AdvisorTurnResult
    expect(result.replyText).toBe('Elterngeld ist steuerfrei, unterliegt aber dem Progressionsvorbehalt.')
    expect(log.at(-1)).toBe('none')
  })
})
