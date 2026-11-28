import { ChatAnthropic } from '@langchain/anthropic'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import { thinksOnBudget } from '@steuereule/core'
import { DEFAULT_REASONING_BUDGET_TOKENS, type ResolvedAiSlotConfig } from './ai-runtime-config.service.js'

/** Room left for the visible answer on top of an Anthropic thinking budget. */
const MIN_ANSWER_TOKENS = 2048

/** Short provider hiccups (429, 503, a dropped connection) are retried with a back-off before a turn counts as failed. */
export const CHAT_MODEL_MAX_RETRIES = 2

export const CHAT_MODEL_FACTORY = Symbol('CHAT_MODEL_FACTORY')

export type ChatModelFactory = (config: ResolvedAiSlotConfig) => BaseChatModel | null

const THINKING_LEVEL = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' } as const

/** Claude up to 4.5 thinks on a token budget, every later model on `effort` (the rule lives in the core, ADR-0096). */
export function anthropicThinksOnBudget(model: string): boolean {
  return thinksOnBudget(model)
}

function createAnthropicModel(config: ResolvedAiSlotConfig, apiKey: string, temperature: number, reasoningBudget: number): BaseChatModel {
  const withReasoning = config.reasoning === 'summary'
  const base = { model: config.model, apiKey, maxRetries: CHAT_MODEL_MAX_RETRIES }
  // Thinking is paid from the same allowance as the answer, so the answer keeps room beyond it.
  const roomForThinking = Math.max(config.maxTokens ?? 0, reasoningBudget + MIN_ANSWER_TOKENS)

  if (anthropicThinksOnBudget(config.model)) {
    if (withReasoning) {
      // Extended thinking does not accept a custom temperature.
      return new ChatAnthropic({ ...base, thinking: { type: 'enabled', budget_tokens: reasoningBudget }, maxTokens: roomForThinking })
    }
    return new ChatAnthropic({ ...base, temperature, ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}) })
  }

  const effort = config.thinkingLevel === undefined ? {} : { outputConfig: { effort: config.thinkingLevel } }
  if (withReasoning) {
    // The summary has to be asked for: by default these models return the thinking blocks empty.
    return new ChatAnthropic({ ...base, ...effort, thinking: { type: 'adaptive', display: 'summarized' }, maxTokens: roomForThinking })
  }
  return new ChatAnthropic({ ...base, ...effort, ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}) })
}

export interface ChatModelFactoryOptions {
  /**
   * The scripted stand-in for the `fake` provider (AI_FAKE_KI, #450 D8). Whoever owns the script supplies
   * it: this module knows providers, not what an answer of the app looks like. Without one, `fake` has no model.
   */
  readonly fake?: (() => BaseChatModel) | undefined
}

/** The factory for a resolved slot: the provider's LangChain model, or null where the slot has none. */
export function chatModelFactory(options: ChatModelFactoryOptions = {}): ChatModelFactory {
  return (config) => (config.enabled && config.provider === 'fake' ? (options.fake?.() ?? null) : createProviderChatModel(config))
}

/** The models of the real providers only; `fake` yields none (see `chatModelFactory`). */
export const createChatModelFromConfig: ChatModelFactory = (config) => createProviderChatModel(config)

function createProviderChatModel(config: ResolvedAiSlotConfig): BaseChatModel | null {
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
        maxRetries: CHAT_MODEL_MAX_RETRIES,
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
      return createAnthropicModel(config, config.apiKey, temperature, reasoningBudget)
    case 'openai':
      return new ChatOpenAI({
        model: config.model,
        apiKey: config.apiKey,
        maxRetries: CHAT_MODEL_MAX_RETRIES,
        temperature,
        ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
        ...(config.baseUrl !== undefined ? { configuration: { baseURL: config.baseUrl } } : {}),
        // Reasoning summaries exist only on the Responses API; a custom base URL may not offer it.
        ...(withReasoning && config.baseUrl === undefined ? { useResponsesApi: true, reasoning: { summary: 'auto' as const } } : {}),
      })
  }
}
