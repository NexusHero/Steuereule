import { chatModelFactory, type ChatModelFactory } from '../llm/chat-model.factory.js'
import { FakeKiChatModel } from './fake-chat-model.js'

/**
 * The chat models of the app: the providers' own, and for `fake` the owl's scripted model (#450 D8).
 * The script speaks the owl's tools, so it lives here and not with the provider plumbing in `llm/`.
 */
export const createAdvisorChatModel: ChatModelFactory = chatModelFactory({ fake: () => new FakeKiChatModel() })
