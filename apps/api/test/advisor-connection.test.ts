// #488: what the owl's turns find out about the model is what the connection shows.
import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { ModelConnectionService } from '../src/ki/model-connection.service.js'
import { buildAdvisorTestKit, collect, doneEvent, ScriptedAdvisorEngine, type ScriptStep } from './fakes/advisor-test-kit.js'

const USER = 'user-connection'
const YEAR = 2025
const config: AiRuntimeConfigService = {
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => false,
  resolveSlot: async (slot) => ({ slot, enabled: true, provider: 'google-genai', model: 'gemini-test', apiKey: 'k' }),
}

function build(script: readonly ScriptStep[]) {
  const connection = new ModelConnectionService(config, async () => ({ ok: true, status: 200 }))
  const kit = buildAdvisorTestKit(new ScriptedAdvisorEngine(script), connection)
  return { ...kit, connection }
}

describe('the connection shown in the chat (#488)', () => {
  it('is connected after the provider answered the check', async () => {
    const { service } = build([])
    expect(await service.connection()).toMatchObject({ state: 'connected', provider: 'Gemini', model: 'gemini-test' })
  })

  it('turns degraded when a turn ends with the reason of the model, and heals with the next good one', async () => {
    const failing = build([{ event: 'error', data: { code: 'ADVISOR_TURN_FAILED', message: 'abgebrochen', failure: { reason: 'unavailable', detail: 'Gemini · HTTP 503' } } }])
    await collect(failing.service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    expect(await failing.service.connection()).toMatchObject({ state: 'degraded', failure: { reason: 'unavailable' } })

    const healthy = build([doneEvent({ replyText: 'Antwort.', mode: 'langgraph' })])
    healthy.connection.recordTurn({ reason: 'timeout' })
    await collect(healthy.service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    expect((await healthy.service.connection()).state).toBe('connected')
  })

  it('counts an answer of the fixed rules that names a failure against the model', async () => {
    const { service } = build([doneEvent({ replyText: 'Regeln.', mode: 'deterministic_fallback', meta: { modelFailure: { reason: 'quota', detail: 'Gemini · HTTP 429' } } })])
    await collect(service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    expect(await service.connection()).toMatchObject({ state: 'degraded', failure: { reason: 'quota' } })
  })

  it('says rules-only when the service has no connection to ask', async () => {
    const kit = buildAdvisorTestKit(new ScriptedAdvisorEngine([]))
    expect((await kit.service.connection()).state).toBe('rules-only')
  })
})
