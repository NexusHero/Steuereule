import { describe, expect, it } from 'vitest'
import { EnvAiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { anthropicThinksOnBudget, createChatModelFromConfig } from '../src/ki/chat-model.factory.js'

type BuiltModel = {
  temperature?: number
  thinking?: { type: string; budget_tokens?: number; display?: string }
  outputConfig?: { effort?: string }
} | null

async function anthropicModel(slot: 'advisor_chat' | 'advisor_guard', env: Record<string, string> = {}): Promise<BuiltModel> {
  const runtime = new EnvAiRuntimeConfigService({ AI_ADVISOR_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-anthropic-key', ...env })
  return createChatModelFromConfig(await runtime.resolveSlot(slot)) as BuiltModel
}

describe('Claude models: thinking and temperature follow the model generation', () => {
  it.each(['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-fable-5-2', 'claude-something-new'])(
    '%s decides its own thinking depth',
    (model) => expect(anthropicThinksOnBudget(model)).toBe(false),
  )

  it.each(['claude-haiku-4-5', 'claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4', 'claude-3-7-sonnet-20250219'])(
    '%s thinks on a token budget',
    (model) => expect(anthropicThinksOnBudget(model)).toBe(true),
  )

  it('the chat on a current model asks for adaptive thinking with a readable summary and sends no temperature', async () => {
    const model = await anthropicModel('advisor_chat', { AI_ADVISOR_MODEL: 'claude-sonnet-5-5' })

    expect(model?.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(model?.outputConfig).toEqual({ effort: 'medium' })
    expect(model?.temperature).toBeUndefined()
  })

  it('the topic guard on a current model sends no temperature and keeps its effort low', async () => {
    const model = await anthropicModel('advisor_guard')

    expect(model?.temperature).toBeUndefined()
    expect(model?.outputConfig).toEqual({ effort: 'low' })
  })

  it('the chat on a model up to 4.5 keeps the token budget', async () => {
    const model = await anthropicModel('advisor_chat', { AI_ADVISOR_MODEL: 'claude-haiku-4-5', AI_ADVISOR_REASONING_BUDGET: '3000' })

    expect(model?.thinking).toEqual({ type: 'enabled', budget_tokens: 3000 })
    expect(model?.outputConfig).toBeUndefined()
  })

  it('a model up to 4.5 without the line of thought keeps its temperature', async () => {
    const model = await anthropicModel('advisor_guard', { AI_GUARD_MODEL: 'claude-haiku-4-5' })

    expect(model?.temperature).toBe(0)
    expect(model?.outputConfig).toBeUndefined()
  })
})
