// #450 Teil 1A / D8: the scripted fake model behind the KiPort — only outside production.
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { EnvAiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { createChatModelFromConfig } from '../src/ki/chat-model.factory.js'
import { FAKE_KI_DEFAULT_REPLY, FakeKiChatModel, assertFakeKiNotInProduction, fakeKiAnswer } from '../src/ki/fake-chat-model.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { SAMPLE_DIGEST } from './fixtures/sample-digest.js'

describe('fake KiPort (#450 D8)', () => {
  it('AI_FAKE_KI=1 selects the fake model for the advisor chat outside production', async () => {
    const config = await new EnvAiRuntimeConfigService({ AI_FAKE_KI: '1', NODE_ENV: 'test' }).resolveSlot('advisor_chat')
    expect(config).toMatchObject({ enabled: true, provider: 'fake' })
    expect(createChatModelFromConfig(config)).toBeInstanceOf(FakeKiChatModel)
  })

  it('in production the flag selects nothing, and the API refuses to start with it', async () => {
    const config = await new EnvAiRuntimeConfigService({ AI_FAKE_KI: '1', NODE_ENV: 'production' }).resolveSlot('advisor_chat')
    expect(config.provider).toBe('deterministic')
    expect(() => assertFakeKiNotInProduction({ AI_FAKE_KI: '1', NODE_ENV: 'production' })).toThrow(/refusing to start/)
    expect(() => assertFakeKiNotInProduction({ AI_FAKE_KI: '1', NODE_ENV: 'test' })).not.toThrow()
  })

  it('cannot be chosen as a provider name', async () => {
    const config = await new EnvAiRuntimeConfigService({ AI_ADVISOR_PROVIDER: 'fake', NODE_ENV: 'test' }).resolveSlot('advisor_chat')
    expect(config.provider).toBe('deterministic')
  })

  it('answers from a fixed script: keyword → drafts, after the tool round a fixed reply', () => {
    const first = fakeKiAnswer([new HumanMessage('Mein Arbeitsweg ist länger')])
    expect(first.tool_calls?.map((c) => c.args.field)).toEqual(['oneWayKm'])
    const homeOffice = fakeKiAnswer([new HumanMessage('Ich war oft im Homeoffice')])
    expect(homeOffice.tool_calls?.map((c) => c.args.field)).toEqual(['homeOfficeDays'])
    const after = fakeKiAnswer([new HumanMessage('Mein Arbeitsweg'), new AIMessage({ content: '', tool_calls: [] }), new ToolMessage({ content: 'ok', tool_call_id: 'fake-0' })])
    expect(after.content).toMatch(/38 km/)
    expect(fakeKiAnswer([new HumanMessage('Hallo')]).content).toBe(FAKE_KI_DEFAULT_REPLY)
  })

  it('drives the real LangGraph engine to a pending draft — never a write', async () => {
    const engine = new LangGraphAdvisorEngine(new EnvAiRuntimeConfigService({ AI_FAKE_KI: '1', NODE_ENV: 'test' }), createChatModelFromConfig)
    const events = []
    for await (const ev of engine.streamTurn({ message: 'Mein Arbeitsweg ist länger', activeScreen: 'commute', digest: SAMPLE_DIGEST, actionIdFactory: () => 'act-fake-1' })) {
      events.push(ev)
    }
    const action = events.find((e) => e.event === 'action')
    expect(action?.event === 'action' && action.data).toMatchObject({ actionId: 'act-fake-1', status: 'pending', screen: 'commute', field: 'oneWayKm', newValue: '38' })
  })
})
