// #451 slice 6: the `plan_steps` tool. The engine forwards each call as an SSE `plan` event with the
// full list, validates it (at most 8 steps, PII-free) and never writes anything itself.
import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import type { AdvisorStreamEvent, CaseDigest } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'

const digest: CaseDigest = {
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
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: 'Nie', homeOfficeDays: 0, distanceKm: 15 },
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

/** Plays back scripted answers and records the tool_choice each round streamed with. */
class PlanScriptModel extends BaseChatModel {
  public readonly toolChoices: unknown[] = []
  private calls = 0

  constructor(private readonly steps: AIMessage[]) {
    super({})
  }

  _llmType(): string {
    return 'plan-script'
  }

  override bindTools(_tools: BindToolsInput[], kwargs?: Partial<BaseChatModelCallOptions>): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    const choice = kwargs?.tool_choice ?? null
    // Each round records the tool_choice of the binding it actually streams from.
    const view = {
      stream: (input: BaseLanguageModelInput, options?: Partial<BaseChatModelCallOptions>) => {
        this.toolChoices.push(choice)
        return this.stream(input, options)
      },
    }
    return view as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }

  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const next = this.steps[this.calls++] ?? new AIMessage('Fertig.')
    return { generations: [{ text: typeof next.content === 'string' ? next.content : '', message: next }] }
  }

  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    const msg = (await this._generate(messages)).generations[0]!.message as AIMessage
    const text = typeof msg.content === 'string' ? msg.content : ''
    const toolCallChunks = msg.tool_calls?.map((tc, index) => ({ name: tc.name, args: JSON.stringify(tc.args), index, ...(tc.id !== undefined ? { id: tc.id } : {}) }))
    yield new ChatGenerationChunk({
      text,
      message: new AIMessageChunk({ content: text, ...(toolCallChunks?.length ? { tool_call_chunks: toolCallChunks } : {}) }),
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
    return { slot, enabled: true, provider: 'google-genai', model: 'gemini-3.8-flash', apiKey: 'test-only-key' }
  },
}

const deterministicRuntime: AiRuntimeConfigService = {
  ...runtime,
  async resolveSlot(slot) {
    return { slot, enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }
  },
}

const planCall = (id: string, steps: Array<{ text: string; status: string }>) =>
  new AIMessage({ content: '', tool_calls: [{ id, name: 'plan_steps', args: { steps } }] })

async function collect(stream: AsyncIterable<AdvisorStreamEvent>): Promise<AdvisorStreamEvent[]> {
  const out: AdvisorStreamEvent[] = []
  for await (const ev of stream) out.push(ev)
  return out
}

const plans = (events: AdvisorStreamEvent[]) => events.flatMap((e) => (e.event === 'plan' ? [e.data.steps] : []))

describe('plan_steps (#451 slice 6, decisions 16–19)', () => {
  it('forwards every plan_steps call as a plan event with the full list, status changing live', async () => {
    const model = new PlanScriptModel([
      planCall('p1', [
        { text: 'Arbeitsweg prüfen', status: 'laeuft' },
        { text: 'Spenden prüfen', status: 'offen' },
      ]),
      planCall('p2', [
        { text: 'Arbeitsweg prüfen', status: 'erledigt' },
        { text: 'Spenden prüfen', status: 'erledigt' },
      ]),
      new AIMessage('Beides geprüft: Arbeitsweg ist vollständig, Spenden fehlen noch.'),
    ])
    const engine = new LangGraphAdvisorEngine(runtime, () => model)
    const events = await collect(engine.streamTurn({ message: 'Prüf meinen Arbeitsweg und meine Spenden', digest }))

    expect(plans(events)).toEqual([
      [
        { text: 'Arbeitsweg prüfen', status: 'laeuft' },
        { text: 'Spenden prüfen', status: 'offen' },
      ],
      [
        { text: 'Arbeitsweg prüfen', status: 'erledigt' },
        { text: 'Spenden prüfen', status: 'erledigt' },
      ],
    ])
    // A plan is only a view: it never stages or writes a draft (decision 19).
    expect(events.some((e) => e.event === 'action' || e.event === 'twoPaths')).toBe(false)
  })

  it('rejects more than eight steps without emitting a plan', async () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({ text: `Schritt ${i + 1}`, status: 'offen' }))
    const model = new PlanScriptModel([planCall('p1', tooMany), new AIMessage('Ich prüfe es direkt.')])
    const engine = new LangGraphAdvisorEngine(runtime, () => model)
    expect(plans(await collect(engine.streamTurn({ message: 'Prüf alles', digest })))).toEqual([])
  })

  it('rejects a step text that carries PII (a Steuer-ID) without emitting a plan', async () => {
    const model = new PlanScriptModel([planCall('p1', [{ text: 'Steuer-ID 12345678901 prüfen', status: 'offen' }]), new AIMessage('Ok.')])
    const engine = new LangGraphAdvisorEngine(runtime, () => model)
    expect(plans(await collect(engine.streamTurn({ message: 'Prüf meine Daten', digest })))).toEqual([])
  })

  it('forces a plan on the first round of the „Was hab ich vergessen?“ quick start, and only there', async () => {
    const model = new PlanScriptModel([planCall('p1', [{ text: 'Belege durchsehen', status: 'laeuft' }]), new AIMessage('Fertig geprüft.')])
    const engine = new LangGraphAdvisorEngine(runtime, () => model)
    const events = await collect(engine.streamTurn({ message: 'Was hab ich vergessen?', digest, planRequired: true }))
    expect(model.toolChoices[0]).toBe('plan_steps')
    expect(model.toolChoices.slice(1).every((c) => c === null)).toBe(true)
    expect(plans(events)).toHaveLength(1)
  })

  it('does not force anything for an ordinary question', async () => {
    const model = new PlanScriptModel([new AIMessage('Der Arbeitnehmer-Pauschbetrag liegt bei 1.230 €.')])
    const engine = new LangGraphAdvisorEngine(runtime, () => model)
    const events = await collect(engine.streamTurn({ message: 'Wie hoch ist der Pauschbetrag?', digest }))
    expect(model.toolChoices.every((c) => c === null)).toBe(true)
    expect(plans(events)).toEqual([])
  })

  it('emits no plan in the deterministic fallback, even for the quick start (nothing faked)', async () => {
    const engine = new LangGraphAdvisorEngine(deterministicRuntime, () => null)
    const events = await collect(engine.streamTurn({ message: 'Was hab ich vergessen?', digest, planRequired: true }))
    expect(plans(events)).toEqual([])
    expect(events.at(-1)?.event).toBe('done')
  })
})
