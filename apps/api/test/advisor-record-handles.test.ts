// ADR-0066: rental objects and children are addressed by a neutral name. The service knows which
// stored record „Objekt 2“ is; the model is told the names only.
import { describe, expect, it } from 'vitest'
import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { AdvisorMessageMeta, AdvisorStreamEvent } from '@steuereule/core'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { buildAdvisorTestKit, collect } from './fakes/advisor-test-kit.js'

const USER = 'user-handles'
const YEAR = 2025

/** A model that answers each round with the prepared chunks and remembers what it was shown. */
class ScriptedModel extends BaseChatModel {
  readonly seen: string[] = []
  private round = 0
  constructor(private readonly rounds: ReadonlyArray<AIMessageChunk>) {
    super({})
  }
  _llmType(): string {
    return 'scripted-test'
  }
  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }
  async _generate(): Promise<ChatResult> {
    throw new Error('not used')
  }
  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    this.seen.push(JSON.stringify(messages.map((m) => m.content)))
    const message = this.rounds[this.round] ?? new AIMessageChunk({ content: 'Fertig.' })
    this.round += 1
    yield new ChatGenerationChunk({ text: typeof message.content === 'string' ? message.content : '', message })
  }
}

const runtime: AiRuntimeConfigService = {
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => false,
  resolveSlot: async (slot) => ({ slot, enabled: true, provider: 'google-genai', model: 'test-model', apiKey: 'test-only-key' }),
}

const stage = (args: Record<string, unknown>): AIMessageChunk =>
  new AIMessageChunk({ content: '', tool_call_chunks: [{ name: 'stage_field_draft', args: JSON.stringify(args), index: 0, id: 'c0' }] } as never)

const metaOf = (events: readonly AdvisorStreamEvent[]): AdvisorMessageMeta => {
  const done = events.find((e) => e.event === 'done')
  if (!done) throw new Error('the turn did not finish')
  return (done.data as { assistantMessage: { meta: AdvisorMessageMeta } }).assistantMessage.meta
}

describe('the owl fills a rental object it was only told the name of', () => {
  it('writes „Objekt 2“ to the second stored object and leaves the first alone', async () => {
    const model = new ScriptedModel([
      stage({ screen: 'vermietung', field: 'mieteinnahmen', newValue: '9.600 €', label: 'Mieteinnahmen', instance: 'Objekt 2' }),
      new AIMessageChunk({ content: 'Vorbereitet.' }),
    ])
    const kit = buildAdvisorTestKit(new LangGraphAdvisorEngine(runtime, () => model))
    const first = await kit.rentalRepo.create(USER, YEAR)
    const second = await kit.rentalRepo.create(USER, YEAR)

    const events = await collect(kit.service.streamMessage(USER, YEAR, { message: 'Objekt 2 brachte 9.600 Euro Miete.' }))
    const action = metaOf(events).action!
    expect(action).toMatchObject({ screen: 'vermietung', field: 'mieteinnahmen', newValue: '9600' })
    expect(model.seen.join(' ')).toContain('Objekt 1, Objekt 2')
    expect(model.seen.join(' ')).not.toContain(second.id)

    await kit.service.applyAction(USER, YEAR, action.actionId)
    const stored = await kit.rentalRepo.listForUserAndYear(USER, YEAR)
    expect(stored.find((o) => o.id === second.id)?.mieteinnahmen).toBe('9600')
    expect(stored.find((o) => o.id === first.id)?.mieteinnahmen ?? null).toBeNull()
  })

  it('prepares nothing while no object exists, and says where to create it', async () => {
    const model = new ScriptedModel([
      stage({ screen: 'vermietung', field: 'mieteinnahmen', newValue: '9600', label: 'Mieteinnahmen', instance: 'Objekt 1' }),
      new AIMessageChunk({ content: 'Ich habe die Miete vorbereitet.' }),
    ])
    const kit = buildAdvisorTestKit(new LangGraphAdvisorEngine(runtime, () => model))

    const events = await collect(kit.service.streamMessage(USER, YEAR, { message: 'Ich habe 9.600 Euro Miete eingenommen.' }))
    const meta = metaOf(events)
    expect(meta.action).toBeUndefined()
    expect(meta.notStaged).toEqual([{ label: 'Mieteinnahmen', reason: expect.stringContaining('Maske Vermietung'), screen: 'vermietung' }])
    expect(await kit.rentalRepo.listForUserAndYear(USER, YEAR)).toHaveLength(0)
  })
})
