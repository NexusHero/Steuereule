import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import { DEFAULT_REASONING_BUDGET_TOKENS, type ResolvedAiSlotConfig } from './ai-runtime-config.service.js'

/** Room left for the visible answer on top of an Anthropic thinking budget. */
const MIN_ANSWER_TOKENS = 2048
import { FakeKiChatModel } from './fake-chat-model.js'

export const CHAT_MODEL_FACTORY = Symbol('CHAT_MODEL_FACTORY')

export type ChatModelFactory = (config: ResolvedAiSlotConfig) => BaseChatModel | null

const THINKING_LEVEL = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' } as const

export function createChatModelFromConfig(config: ResolvedAiSlotConfig): BaseChatModel | null {
  if (config.enabled && config.provider === 'fake') return new FakeKiChatModel()
  if (!config.enabled || config.provider === 'deterministic' || config.provider === 'fake' || !config.apiKey) {
    return null
  }

  // Gemini 3 models recommend temperature 1.0 by default to prevent tool-looping or degraded reasoning.
  const temperature = config.temperature ?? (config.provider === 'google-genai' ? 1.0 : 0.2)
  const withReasoning = config.reasoning === 'summary'
  const reasoningBudget = config.reasoningBudgetTokens ?? DEFAULT_REASONING_BUDGET_TOKENS

  switch (config.provider) {
    case 'google-genai':
      return new ChatGoogleGenerativeAI({
        model: config.model,
        apiKey: config.apiKey,
        temperature,
        ...(config.maxTokens !== undefined ? { maxOutputTokens: config.maxTokens } : {}),
        ...(withReasoning || config.thinkingLevel !== undefined
          ? {
              thinkingConfig: {
                ...(withReasoning ? { includeThoughts: true } : {}),
                ...(config.thinkingLevel !== undefined ? { thinkingLevel: THINKING_LEVEL[config.thinkingLevel] } : {}),
              },
            }
          : {}),
      })
    case 'anthropic':
      if (withReasoning) {
        // Extended thinking does not accept a custom temperature, and the answer needs room beyond the budget.
        return new ChatAnthropic({
          model: config.model,
          apiKey: config.apiKey,
          thinking: { type: 'enabled', budget_tokens: reasoningBudget },
          maxTokens: Math.max(config.maxTokens ?? 0, reasoningBudget + MIN_ANSWER_TOKENS),
        })
      }
      return new ChatAnthropic({
        model: config.model,
        apiKey: config.apiKey,
        temperature,
        ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      })
    case 'openai':
      return new ChatOpenAI({
        model: config.model,
        apiKey: config.apiKey,
        temperature,
        ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
        ...(config.baseUrl !== undefined ? { configuration: { baseURL: config.baseUrl } } : {}),
        // Reasoning summaries exist only on the Responses API; a custom base URL may not offer it.
        ...(withReasoning && config.baseUrl === undefined ? { useResponsesApi: true, reasoning: { summary: 'auto' as const } } : {}),
      })
  }
}
