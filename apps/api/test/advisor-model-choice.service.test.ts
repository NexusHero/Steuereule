// ADR-0096: the model picked for a conversation and Gründlich/Max of a message reach the engine, and
// each answer records which model answered how deep, so the picker's cost factors can be measured.
import { describe, expect, it } from 'vitest'
import { buildAdvisorTestKit, collect, doneEvent, ScriptedAdvisorEngine } from './fakes/advisor-test-kit.js'

const USER = 'user-model-choice'
const YEAR = 2025

describe('model and depth of a turn (ADR-0096)', () => {
  it('hands the conversation’s model and the message’s depth to the engine', async () => {
    const engine = new ScriptedAdvisorEngine([doneEvent({ replyText: 'Ja.', provider: 'anthropic', model: 'claude-opus-5-5' })])
    const kit = buildAdvisorTestKit(engine)
    const conversation = await kit.service.createConversation(USER, YEAR)
    const picked = await kit.service.setConversationModel(USER, YEAR, conversation.id, { provider: 'anthropic', model: 'claude-opus-5-5' })
    expect(picked.chatModel).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' })

    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Lohnt sich das?', conversationId: conversation.id, depth: 'max' }))
    expect(engine.requests[0]).toMatchObject({ chatChoice: { provider: 'anthropic', model: 'claude-opus-5-5' }, depth: 'max' })
    expect(await kit.advisorRepo.recentUsage(10)).toEqual([expect.objectContaining({ provider: 'anthropic', model: 'claude-opus-5-5', depth: 'max' })])
  })

  it('uses the standard model at Gründlich when nothing is picked, and back to it after a reset', async () => {
    const engine = new ScriptedAdvisorEngine([doneEvent({ replyText: 'Ja.' })])
    const kit = buildAdvisorTestKit(engine)
    const conversation = await kit.service.createConversation(USER, YEAR)
    await kit.service.setConversationModel(USER, YEAR, conversation.id, { provider: 'google-genai', model: 'gemini-3.8-pro' })
    const reset = await kit.service.setConversationModel(USER, YEAR, conversation.id, null)
    expect(reset.chatModel).toBeNull()

    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Hallo', conversationId: conversation.id }))
    expect(engine.requests[0]?.chatChoice).toBeUndefined()
    expect(engine.requests[0]?.depth).toBeUndefined()
    expect((await kit.advisorRepo.recentUsage(10))[0]).toMatchObject({ depth: 'gruendlich' })
  })
})
