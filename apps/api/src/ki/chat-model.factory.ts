import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import type { ResolvedAiSlotConfig } from './ai-runtime-config.service.js'

export const CHAT_MODEL_FACTORY = Symbol('CHAT_MODEL_FACTORY')

export type ChatModelFactory = (config: ResolvedAiSlotConfig) => BaseChatModel | null

export function createChatModelFromConfig(config: ResolvedAiSlotConfig): BaseChatModel | null {
  if (!config.enabled || config.provider === 'deterministic' || !config.apiKey) {
    return null
  }

  const temperature = config.temperature ?? 0.2

  switch (config.provider) {
    case 'google-genai':
      return new ChatGoogleGenerativeAI({
        model: config.model,
        apiKey: config.apiKey,
        temperature,
        ...(config.maxTokens !== undefined ? { maxOutputTokens: config.maxTokens } : {}),
      })
    case 'anthropic':
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
      })
  }
}
