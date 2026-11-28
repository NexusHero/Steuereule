import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import type { ResolvedAiSlotConfig } from '../src/llm/ai-runtime-config.service.js'
import { singleShotFactoryFrom, singleShotFromChatModel } from '../src/llm/langchain-single-shot.adapter.js'

function recordingModel(content: AIMessage['content']) {
  const calls: { messages: BaseMessage[]; signal: AbortSignal | undefined }[] = []
  const model = {
    async invoke(messages: BaseMessage[], options?: { signal?: AbortSignal }) {
      calls.push({ messages, signal: options?.signal })
      return new AIMessage({ content })
    },
  }
  return { calls, model: model as unknown as BaseChatModel }
}

describe('singleShotFromChatModel', () => {
  it('sends exactly one system and one user message and passes the abort signal through', async () => {
    const { calls, model } = recordingModel('{"ok":true}')
    const signal = AbortSignal.timeout(1_000)

    const answer = await singleShotFromChatModel(model).complete({ system: 'Nur JSON.', user: 'Belegtext' }, { signal })

    expect(answer).toBe('{"ok":true}')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.messages.map((m) => [m.getType(), m.content])).toEqual([
      ['system', 'Nur JSON.'],
      ['human', 'Belegtext'],
    ])
    expect(calls[0]!.signal).toBe(signal)
  })

  it('joins the text parts of a structured answer and drops non-text parts', async () => {
    const { model } = recordingModel([
      { type: 'text', text: '{"a":' },
      { type: 'image_url', image_url: 'x' },
      { type: 'text', text: '1}' },
    ])

    const answer = await singleShotFromChatModel(model).complete({ system: 's', user: 'u' }, { signal: AbortSignal.timeout(1_000) })

    expect(answer).toBe('{"a":1}')
  })
})

describe('singleShotFactoryFrom', () => {
  const slot = { slot: 'vision_ocr', enabled: true, provider: 'anthropic', model: 'm', apiKey: 'k' } as ResolvedAiSlotConfig

  it('resolves the slot through the chat-model factory it was given', async () => {
    const { model } = recordingModel('ok')
    const seen: ResolvedAiSlotConfig[] = []
    const factory = singleShotFactoryFrom((config) => {
      seen.push(config)
      return model
    })

    const answer = await factory(slot)!.complete({ system: 's', user: 'u' }, { signal: AbortSignal.timeout(1_000) })

    expect(answer).toBe('ok')
    expect(seen).toEqual([slot])
  })

  it('has no model when the chat-model factory has none', () => {
    expect(singleShotFactoryFrom(() => null)(slot)).toBeNull()
  })
})
