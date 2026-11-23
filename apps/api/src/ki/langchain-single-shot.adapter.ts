import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModelFromConfig, type ChatModelFactory } from './chat-model.factory.js'
import { extractMessageText } from './llm-json.js'
import type { SingleShotModel, SingleShotModelFactory } from './single-shot-model.js'

/** Adapts a LangChain chat model to the single-shot port. */
export function singleShotFromChatModel(model: BaseChatModel): SingleShotModel {
  return {
    async complete(prompt, options) {
      const answer = await model.invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)], { signal: options.signal })
      return extractMessageText(answer.content)
    },
  }
}

/** Turns a chat-model factory into a single-shot factory, so both resolve a slot the same way. */
export function singleShotFactoryFrom(chatModels: ChatModelFactory): SingleShotModelFactory {
  return (config) => {
    const model = chatModels(config)
    return model ? singleShotFromChatModel(model) : null
  }
}

/** The production factory: the slot's LangChain chat model behind the single-shot port. */
export const createSingleShotModelFromConfig: SingleShotModelFactory = singleShotFactoryFrom(createChatModelFromConfig)
