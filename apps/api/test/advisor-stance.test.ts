import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import type { AdvisorAssessmentBrief, AdvisorTurnRequest, CaseDigest } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from '../src/ki/ai-runtime-config.service.js'
import { buildCaseSystemPrompt } from '../src/ki/advisor-prompt.js'
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

/** Answers once, or fails; keeps every list of messages it was asked with. */
class RecordingModel extends BaseChatModel {
  public readonly seen: BaseMessage[][] = []
  constructor(private readonly outcome: AIMessage | Error = new AIMessage('Okay.')) {
    super({})
  }
  _llmType(): string {
    return 'recording-test'
  }
  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages)
    if (this.outcome instanceof Error) throw this.outcome
    return { generations: [{ text: String(this.outcome.content), message: this.outcome }] }
  }
  override async *_streamResponseChunks(messages: BaseMessage[], _options: this['ParsedCallOptions'], _runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const text = String(res.generations[0]!.message.content)
    yield new ChatGenerationChunk({ text, message: new AIMessageChunk({ content: text }) })
  }
}

function runtime(provider: ResolvedAiSlotConfig['provider'], fallback?: ResolvedAiSlotConfig['provider']): AiRuntimeConfigService {
  return {
    async resolveLimits() {
      return DEFAULT_AI_TURN_LIMITS
    },
    async isKillSwitchActive() {
      return false
    },
    async resolveSlot(slot) {
      if (slot === 'fallback') return fallback ? { slot, enabled: true, provider: fallback, model: 'second', apiKey: 'k2' } : { slot, enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }
      return { slot, enabled: true, provider, model: 'first', apiKey: 'k1' }
    },
  }
}

const systemText = (messages: BaseMessage[]): string => JSON.stringify(messages[0]!.content)
const STANCE = 'Beraterhaltung (gilt immer)'
const ADVOCATE = 'keinen Euro mehr zahlt, als das Gesetz verlangt'

async function turn(engine: LangGraphAdvisorEngine, extra: Partial<AdvisorTurnRequest> = {}) {
  await engine.runTurn({ message: 'Was kann ich absetzen?', digest: DIGEST, ...extra })
}

describe('the advisor stance is in every model call (#499, #501)', () => {
  const REQUESTS: readonly [string, Partial<AdvisorTurnRequest>][] = [
    ['a plain question', {}],
    ['with a mask open', { activeScreen: 'lstb' }],
    ['with the interview skill', { skill: 'berater-interview' }],
    ['the forgotten check', { planRequired: true }],
    ['the savings plan', { planRequired: true, task: 'savings-plan' }],
    ['the assessment check', { planRequired: true, task: 'assessment-check' }],
    ['with a history', { history: [{ role: 'user', content: 'Hallo' }, { role: 'assistant', content: 'Hallo!' }] }],
  ]

  it.each(REQUESTS)('%s', async (_name, extra) => {
    for (const provider of ['google-genai', 'anthropic', 'openai'] as const) {
      const model = new RecordingModel()
      await turn(new LangGraphAdvisorEngine(runtime(provider), () => model), extra)
      expect(model.seen.length, provider).toBeGreaterThan(0)
      for (const messages of model.seen) {
        expect(systemText(messages), provider).toContain(STANCE)
        expect(systemText(messages), provider).toContain(ADVOCATE)
      }
    }
  })

  it('also when the fallback model answers', async () => {
    const first = new RecordingModel(new Error('[503] overloaded'))
    const second = new RecordingModel()
    await turn(new LangGraphAdvisorEngine(runtime('google-genai', 'anthropic'), (config) => (config.model === 'first' ? first : second)))
    expect(second.seen.length).toBe(1)
    expect(systemText(second.seen[0]!)).toContain(STANCE)
  })
})

describe('the situation is the start of every case prompt (#501)', () => {
  it('comes first, with the user’s own words', () => {
    const text = buildCaseSystemPrompt(DIGEST, undefined, false, undefined, undefined, undefined, undefined, undefined, 'Wir bauen 2027 ein Haus.')
    expect(text.startsWith('Situation des Haushalts')).toBe(true)
    expect(text).toContain('Wir bauen 2027 ein Haus.')
  })

  it('reaches the model in a turn', async () => {
    const model = new RecordingModel()
    await turn(new LangGraphAdvisorEngine(runtime('google-genai'), () => model), { situation: 'Elternzeit ab März 2026.' })
    expect(systemText(model.seen[0]!)).toContain('Elternzeit ab März 2026.')
  })
})

describe('tasks of the owl (#501)', () => {
  const prompt = (task: 'savings-plan' | 'assessment-check', assessment?: AdvisorAssessmentBrief) => buildCaseSystemPrompt(DIGEST, undefined, true, undefined, undefined, undefined, task, assessment)

  it('the savings plan works through the levers the app found, in a fixed outline', () => {
    const text = prompt('savings-plan')
    expect(text).toContain('Sparplan')
    expect(text).toContain('Handwerker und haushaltsnahe Dienste')
    expect(text).toContain('Das kannst du jetzt mitnehmen')
    expect(text).toContain('Für das laufende und das nächste Jahr')
    expect(text).toContain('Nenne keinen Betrag, den kein Werkzeug gerechnet hat')
  })

  it('the assessment check invents nothing while no notice is recorded', () => {
    const text = prompt('assessment-check')
    expect(text).toContain('noch nicht in der App erfasst')
    expect(text).toContain('Erfinde keine Abweichungen')
  })

  it('the assessment check gets the app’s own figures and the deadline', () => {
    const text = prompt('assessment-check', { recorded: true, status: 'erfasst', deviations: [{ field: 'werbungskosten', assessedEur: 1230, calculatedEur: 2100, differenceEur: -870 }], calculationIncomplete: false, appealDaysLeft: 12 })
    expect(text).toContain('Abweichung „werbungskosten“: Bescheid 1230 €, Erklärung 2100 €, Unterschied -870 €')
    expect(text).toContain('noch 12 Tage')
    expect(text).toContain('formuliere den Einspruch aus')
  })

  it('says so when the deadline has passed', () => {
    expect(prompt('assessment-check', { recorded: true, status: 'erfasst', deviations: [], calculationIncomplete: false, appealDaysLeft: 0 })).toContain('abgelaufen')
  })

  it('no task, no task text', () => {
    expect(buildCaseSystemPrompt(DIGEST, undefined, false)).not.toContain('Aufgabe für diese Antwort')
  })
})
