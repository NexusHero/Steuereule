import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import { ADVISOR_SKILL_IDS, isAdvisorSkillId, type AdvisorTurnResult, type CaseDigest } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { skillPrompt } from '../src/ki/advisor-skills.js'

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

/** Plays the given replies in order and keeps what it was asked. */
class ScriptedModel extends BaseChatModel {
  public readonly seen: BaseMessage[][] = []
  private index = 0
  constructor(private readonly replies: AIMessage[]) {
    super({})
  }
  _llmType(): string {
    return 'scripted-skill-test'
  }
  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages)
    const next = this.replies[this.index++] ?? new AIMessage('Fertig.')
    return { generations: [{ text: String(next.content), message: next }] }
  }
  override async *_streamResponseChunks(messages: BaseMessage[], _options: this['ParsedCallOptions'], _runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const msg = res.generations[0]!.message as AIMessage
    const toolCallChunks = msg.tool_calls?.map((tc, index) => ({ name: tc.name, args: JSON.stringify(tc.args), index, ...(tc.id !== undefined ? { id: tc.id } : {}) }))
    yield new ChatGenerationChunk({
      text: String(msg.content),
      message: new AIMessageChunk({ content: String(msg.content), ...(toolCallChunks && toolCallChunks.length > 0 ? { tool_call_chunks: toolCallChunks } : {}) }),
    })
  }
}

const runtime: AiRuntimeConfigService = {
  async resolveLimits() {
    return DEFAULT_AI_TURN_LIMITS
  },
  async isKillSwitchActive() {
    return false
  },
  async resolveSlot(slot) {
    return { slot, enabled: true, provider: 'google-genai', model: 'gemini-test', apiKey: 'test-key' }
  },
}

const ROUND = {
  questions: [
    { text: 'Hattest du Fortbildungskosten?', options: ['Ja', 'Nein'], recommended: 'Ja' },
    { text: 'Gab es einen Umzug?', options: ['Ja', 'Nein', 'Teils'], recommended: 'Vielleicht' },
  ],
}

async function run(model: ScriptedModel, skill?: 'berater-interview') {
  const engine = new LangGraphAdvisorEngine(runtime, () => model)
  return (await engine.runTurn({ message: 'Fang bitte an.', digest: DIGEST, ...(skill ? { skill } : {}) })) as AdvisorTurnResult
}

const systemText = (messages: BaseMessage[]): string => JSON.stringify(messages[0]!.content)

describe('skills (#495)', () => {
  it('knows its skills by id', () => {
    expect(ADVISOR_SKILL_IDS).toContain('berater-interview')
    expect(isAdvisorSkillId('berater-interview')).toBe(true)
    expect(isAdvisorSkillId('shell')).toBe(false)
    expect(skillPrompt('berater-interview')).toContain('ask_questions')
  })

  it('tells the model about the skill only while it is on', async () => {
    const on = new ScriptedModel([new AIMessage('Okay.')])
    await run(on, 'berater-interview')
    expect(systemText(on.seen[0]!)).toContain('Berater-Interview')
    const off = new ScriptedModel([new AIMessage('Okay.')])
    await run(off)
    expect(systemText(off.seen[0]!)).not.toContain('Berater-Interview')
  })

  it('turns a round of questions into answers to tap, and drops a recommendation that is not an answer', async () => {
    const model = new ScriptedModel([
      new AIMessage({ content: '', tool_calls: [{ name: 'ask_questions', args: ROUND, id: 'call-1', type: 'tool_call' }] }),
      new AIMessage('Los geht’s mit der ersten Runde.'),
    ])
    const result = await run(model, 'berater-interview')
    expect(result.meta.questionRound?.questions).toHaveLength(2)
    expect(result.meta.questionRound?.questions[0]).toEqual({ text: 'Hattest du Fortbildungskosten?', options: ['Ja', 'Nein'], recommended: 'Ja' })
    expect(result.meta.questionRound?.questions[1]).toEqual({ text: 'Gab es einen Umzug?', options: ['Ja', 'Nein', 'Teils'] })
  })

  it('refuses a round with too few answers instead of showing it', async () => {
    const model = new ScriptedModel([
      new AIMessage({ content: '', tool_calls: [{ name: 'ask_questions', args: { questions: [{ text: 'Ja?', options: ['Ja'] }] }, id: 'call-2', type: 'tool_call' }] }),
      new AIMessage('Dann so.'),
    ])
    const result = await run(model, 'berater-interview')
    expect(result.meta.questionRound).toBeUndefined()
  })
})
