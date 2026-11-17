import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../../src/ki/ai-runtime-config.service.js'

/** A model that answers each round with the prepared chunks and remembers what it was shown. */
export class ScriptedModel extends BaseChatModel {
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

/** A runtime with the model switched on, for engines built around a scripted model. */
export const runtime: AiRuntimeConfigService = {
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => false,
  resolveSlot: async (slot) => ({ slot, enabled: true, provider: 'google-genai', model: 'test-model', apiKey: 'test-only-key' }),
}
