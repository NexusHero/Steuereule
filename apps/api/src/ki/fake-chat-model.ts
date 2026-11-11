// Fake model behind the KiPort (#450 Teil 1A, decision D8): fixed answers so the browser gates test
// the app, not a model. Only selectable with AI_FAKE_KI=1 outside production (assertFakeKiNotInProduction).
import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { AIMessage, AIMessageChunk, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'

interface ScriptedToolCall {
  readonly name: string
  readonly args: Record<string, unknown>
}

const COMMUTE_KM: ScriptedToolCall = {
  name: 'stage_field_draft',
  args: {
    screen: 'commute',
    field: 'oneWayKm',
    newValue: '38',
    label: 'Einfacher Arbeitsweg (Entfernungspauschale)',
    reason: 'Mit 38 km einfachem Arbeitsweg steigt deine Entfernungspauschale.',
    sourceId: 'estg-9-1',
  },
}

const HOME_OFFICE: ScriptedToolCall = {
  name: 'stage_field_draft',
  args: {
    screen: 'commute',
    field: 'homeOfficeDays',
    newValue: '60',
    label: 'Homeoffice-Tage',
    reason: '60 Tage im Homeoffice ergeben die Homeoffice-Pauschale.',
    sourceId: 'estg-4-5-6c',
  },
}

/** The script: keyword in the user's message → the tool calls of the first round. */
export const FAKE_KI_SCRIPT: ReadonlyArray<{ readonly keyword: RegExp; readonly calls: readonly ScriptedToolCall[]; readonly reply: string }> = [
  { keyword: /arbeitsweg|pendel/i, calls: [COMMUTE_KM], reply: 'Ich habe 38 km Arbeitsweg als Entwurf vorbereitet.' },
  { keyword: /homeoffice/i, calls: [HOME_OFFICE], reply: 'Ich habe 60 Homeoffice-Tage als Entwurf vorbereitet.' },
]

export const FAKE_KI_DEFAULT_REPLY = 'Ich bin die Test-Eule und antworte mit festem Text.'

function textOf(message: BaseMessage): string {
  return typeof message.content === 'string' ? message.content : ''
}

/** Decides the next answer from the conversation alone, so every run is identical. */
export function fakeKiAnswer(messages: readonly BaseMessage[]): AIMessage {
  const last = messages.at(-1)
  let lastHuman: BaseMessage | undefined
  for (const m of messages) if (m.getType() === 'human') lastHuman = m
  const entry = FAKE_KI_SCRIPT.find((e) => e.keyword.test(lastHuman ? textOf(lastHuman) : ''))
  if (last instanceof ToolMessage || last?.getType() === 'tool') {
    return new AIMessage(entry?.reply ?? FAKE_KI_DEFAULT_REPLY)
  }
  if (!entry) return new AIMessage(FAKE_KI_DEFAULT_REPLY)
  return new AIMessage({
    content: '',
    tool_calls: entry.calls.map((call, index) => ({ id: `fake-${index}`, name: call.name, args: { ...call.args } })),
  })
}

export class FakeKiChatModel extends BaseChatModel {
  constructor() {
    super({})
  }

  _llmType(): string {
    return 'fake-ki'
  }

  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = fakeKiAnswer(messages)
    return { generations: [{ text: textOf(message), message }] }
  }

  override async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    const message = fakeKiAnswer(messages)
    const text = textOf(message)
    const toolCallChunks = message.tool_calls?.map((tc, index) => ({
      name: tc.name,
      args: JSON.stringify(tc.args),
      index,
      ...(tc.id !== undefined ? { id: tc.id } : {}),
    }))
    yield new ChatGenerationChunk({
      text,
      message: new AIMessageChunk({ content: text, ...(toolCallChunks && toolCallChunks.length > 0 ? { tool_call_chunks: toolCallChunks } : {}) }),
    })
  }
}

/** D8: the fake model must never answer real users. */
export function assertFakeKiNotInProduction(env: NodeJS.ProcessEnv = process.env): void {
  const flag = env.AI_FAKE_KI?.trim().toLowerCase()
  if ((flag === '1' || flag === 'true') && env.NODE_ENV === 'production') {
    throw new Error('AI_FAKE_KI is set in production — refusing to start (the fake KiPort is for CI and tests only, #450 D8).')
  }
}
