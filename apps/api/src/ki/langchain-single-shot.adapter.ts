import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { ResolvedAiSlotConfig } from './ai-runtime-config.service.js'
import { createChatModelFromConfig } from './chat-model.factory.js'
import { extractMessageText } from './llm-json.js'
import type { SingleShotModel } from './single-shot-model.js'

/** Adapts a LangChain chat model to the single-shot port. */
export function singleShotFromChatModel(model: BaseChatModel): SingleShotModel {
  return {
    async complete(prompt, options) {
      const answer = await model.invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)], { signal: options.signal })
      return extractMessageText(answer.content)
    },
  }
}

/** The production factory: the slot's LangChain chat model behind the single-shot port. */
export function createSingleShotModelFromConfig(config: ResolvedAiSlotConfig): SingleShotModel | null {
  const model = createChatModelFromConfig(config)
  return model ? singleShotFromChatModel(model) : null
}
