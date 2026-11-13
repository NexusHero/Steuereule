// ADR-0069 §Themengrenze — the topic guard: one small model call per typed question, a verdict or,
// when there is none, the turn is let through (fail-open) with the reason.
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { describe, expect, it } from 'vitest'
import { EnvAiRuntimeConfigService, type ResolvedAiSlotConfig } from '../src/ki/ai-runtime-config.service.js'
import { AdvisorTopicGuard, GUARD_HISTORY_ENTRIES } from '../src/ki/advisor-topic-guard.js'

class AnsweringModel extends BaseChatModel {
  public seen: BaseMessage[] = []
  constructor(private readonly answer: string | Error | 'hang') {
    super({})
  }
  _llmType(): string {
    return 'guard-test'
  }
  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    this.seen = messages
    if (this.answer === 'hang') {
      await new Promise((_resolve, reject) => {
        if (options.signal?.aborted) reject(new Error('aborted'))
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    if (this.answer instanceof Error) throw this.answer
    const text = this.answer as string
    return { generations: [{ text, message: new AIMessage(text) }] }
  }
}

const GEMINI = { GEMINI_API_KEY: 'test-key', AI_ADVISOR_PROVIDER: 'google-genai' }

function guardWith(model: BaseChatModel | null, env: Record<string, string> = GEMINI) {
  const configs: ResolvedAiSlotConfig[] = []
  const guard = new AdvisorTopicGuard(new EnvAiRuntimeConfigService(env), (config) => {
    configs.push(config)
    return model
  })
  return { guard, configs }
}

describe('the advisor_guard slot', () => {
  it('uses the small model of the chat provider, without creativity and with a short leash', async () => {
    const config = await new EnvAiRuntimeConfigService({ ANTHROPIC_API_KEY: 'k', AI_ADVISOR_PROVIDER: 'anthropic' }).resolveSlot('advisor_guard')
    expect(config).toMatchObject({ enabled: true, provider: 'anthropic', model: 'claude-haiku-5-5', temperature: 0, thinkingLevel: 'low', timeoutMs: 5000 })
    expect(config.reasoning).toBeUndefined()
  })

  it('can be set up on its own', async () => {
    const config = await new EnvAiRuntimeConfigService({
      ...GEMINI,
      AI_GUARD_PROVIDER: 'openai',
      AI_GUARD_MODEL: 'gpt-guard',
      AI_GUARD_API_KEY: 'guard-key',
      AI_GUARD_TIMEOUT_MS: '2000',
    }).resolveSlot('advisor_guard')
    expect(config).toMatchObject({ provider: 'openai', model: 'gpt-guard', apiKey: 'guard-key', timeoutMs: 2000 })
  })

  it('is off with the scripted fake model and with the kill switch', async () => {
    expect((await new EnvAiRuntimeConfigService({ AI_FAKE_KI: '1', NODE_ENV: 'test' }).resolveSlot('advisor_guard')).enabled).toBe(false)
    expect((await new EnvAiRuntimeConfigService({ ...GEMINI, AI_KILL_SWITCH: '1' }).resolveSlot('advisor_guard')).enabled).toBe(false)
  })
})

describe('AdvisorTopicGuard', () => {
  it('returns the verdict, the category and the language of the question', async () => {
    const { guard } = guardWith(new AnsweringModel('{"verdict":"off_topic","category":"programming","language":"en"}'))
    expect(await guard.check({ message: 'Write me a Python script', history: [] })).toEqual({ verdict: 'off_topic', category: 'programming', language: 'en' })
  })

  it('reads a verdict wrapped in a code fence', async () => {
    const { guard } = guardWith(new AnsweringModel('```json\n{"verdict":"gray","category":"general_finance","language":"de"}\n```'))
    expect((await guard.check({ message: 'ETF oder Bausparvertrag?', history: [] })).verdict).toBe('gray')
  })

  it('shows the model the question as data, with the last two rounds before it', async () => {
    const model = new AnsweringModel('{"verdict":"tax","category":"tax","language":"de"}')
    const { guard } = guardWith(model)
    const history = [
      { role: 'user' as const, content: 'alt 1' },
      { role: 'assistant' as const, content: 'alt 2' },
      { role: 'user' as const, content: 'Was ist die Pendlerpauschale?' },
      { role: 'assistant' as const, content: '0,38 € ab dem ersten Kilometer.' },
      { role: 'user' as const, content: 'Und 2025?' },
      { role: 'assistant' as const, content: 'x'.repeat(5000) },
    ]
    await guard.check({ message: 'Und was heißt das genau?', history })
    const prompt = model.seen.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n')
    expect(GUARD_HISTORY_ENTRIES).toBe(4)
    expect(prompt).not.toContain('alt 1')
    expect(prompt).toContain('Was ist die Pendlerpauschale?')
    expect(prompt).toContain('<nachricht>\nUnd was heißt das genau?\n</nachricht>')
    expect(prompt).not.toContain('x'.repeat(1000))
  })

  it('lets the turn through when no guard is set up', async () => {
    const { guard } = guardWith(null, { AI_FAKE_KI: '1', NODE_ENV: 'test' })
    expect(await guard.check({ message: 'Hallo', history: [] })).toEqual({ verdict: 'unavailable', reason: 'not_configured' })
  })

  it('lets the turn through when the model fails', async () => {
    const { guard } = guardWith(new AnsweringModel(new Error('503')))
    expect(await guard.check({ message: 'Hallo', history: [] })).toEqual({ verdict: 'unavailable', reason: 'error' })
  })

  it('lets the turn through when the answer is no verdict', async () => {
    const { guard } = guardWith(new AnsweringModel('Das ist eine Steuerfrage.'))
    expect(await guard.check({ message: 'Hallo', history: [] })).toEqual({ verdict: 'unavailable', reason: 'unreadable' })
  })

  it('gives up after its timeout and lets the turn through', async () => {
    const { guard } = guardWith(new AnsweringModel('hang'), { ...GEMINI, AI_GUARD_TIMEOUT_MS: '30' })
    expect(await guard.check({ message: 'Hallo', history: [] })).toEqual({ verdict: 'unavailable', reason: 'timeout' })
  })

  it('stops when the user walks away', async () => {
    const { guard } = guardWith(new AnsweringModel('hang'))
    const controller = new AbortController()
    const pending = guard.check({ message: 'Hallo', history: [] }, controller.signal)
    controller.abort()
    expect(await pending).toEqual({ verdict: 'unavailable', reason: 'error' })
  })
})
