import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from '../src/ki/ai-runtime-config.service.js'
import { ModelConnectionService } from '../src/ki/model-connection.service.js'

const slot = (extra: Partial<ResolvedAiSlotConfig> = {}): ResolvedAiSlotConfig => ({ slot: 'advisor_chat', enabled: true, provider: 'google-genai', model: 'gemini-test', apiKey: 'secret-key-value', ...extra })
const config = (resolved: ResolvedAiSlotConfig, killSwitch = false): AiRuntimeConfigService => ({
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => killSwitch,
  resolveSlot: async () => resolved,
})
const answering = (status: number) => vi.fn(async (_url: string, _init: { headers: Record<string, string>; signal: AbortSignal }) => ({ ok: status >= 200 && status < 300, status }))

describe('the connection of the owl to its model (#488)', () => {
  it('is connected when the provider knows the model and accepts the key, and says which one', async () => {
    const fetchImpl = answering(200)
    const connection = await new ModelConnectionService(config(slot()), fetchImpl).check()
    expect(connection).toMatchObject({ state: 'connected', provider: 'Gemini', model: 'gemini-test' })
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test')
  })

  it('sends the key in a header, never in the address', async () => {
    const fetchImpl = answering(200)
    await new ModelConnectionService(config(slot()), fetchImpl).check()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).not.toContain('secret-key-value')
    expect(init.headers['x-goog-api-key']).toBe('secret-key-value')
  })

  it.each([
    [400, 'not-configured'],
    [403, 'not-configured'],
    [404, 'not-configured'],
    [429, 'quota'],
    [503, 'unavailable'],
  ])('is unavailable with the reason when the provider answers %i', async (status, reason) => {
    const connection = await new ModelConnectionService(config(slot()), answering(status)).check()
    expect(connection.state).toBe('unavailable')
    expect(connection.failure).toEqual({ reason, detail: `Gemini · HTTP ${status}` })
  })

  it('is unavailable when the provider cannot be reached, and when it takes too long', async () => {
    const down = await new ModelConnectionService(config(slot()), vi.fn(async () => { throw new TypeError('fetch failed') })).check()
    expect(down).toMatchObject({ state: 'unavailable', failure: { reason: 'network' } })
    const slow = await new ModelConnectionService(config(slot()), vi.fn(async () => { throw Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }) })).check()
    expect(slow).toMatchObject({ state: 'unavailable', failure: { reason: 'timeout' } })
  })

  it('answers with the fixed rules when no model is set up, or the kill switch is on, without asking anybody', async () => {
    const fetchImpl = answering(200)
    expect(await new ModelConnectionService(config(slot({ enabled: false, provider: 'deterministic', apiKey: null })), fetchImpl).check()).toMatchObject({ state: 'rules-only', provider: null })
    expect(await new ModelConnectionService(config(slot(), true), fetchImpl).check()).toMatchObject({ state: 'rules-only' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('asks the provider once a minute, not on every look', async () => {
    const fetchImpl = answering(200)
    const service = new ModelConnectionService(config(slot()), fetchImpl)
    const t = Date.now()
    await service.check(t)
    await service.check(t + 30_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await service.check(t + 61_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('is degraded when it answers the check but a real turn just failed, and recovers by itself', async () => {
    const service = new ModelConnectionService(config(slot()), answering(200))
    const t = Date.now()
    service.recordTurn({ reason: 'unavailable', detail: 'Gemini · HTTP 503' })
    expect(await service.check(t)).toMatchObject({ state: 'degraded', failure: { reason: 'unavailable' } })
    expect(await service.check(t + 6 * 60_000)).toMatchObject({ state: 'connected' })
    service.recordTurn({ reason: 'timeout' })
    service.recordTurn(null)
    expect((await service.check()).state).toBe('connected')
  })

  it('reads the check of Claude and OpenAI the way their APIs want it', async () => {
    const claude = answering(200)
    await new ModelConnectionService(config(slot({ provider: 'anthropic', model: 'claude-x' })), claude).check()
    expect(claude.mock.calls[0]![0]).toBe('https://api.anthropic.com/v1/models/claude-x')
    const openai = answering(200)
    await new ModelConnectionService(config(slot({ provider: 'openai', model: 'gpt-x' })), openai).check()
    expect(openai.mock.calls[0]![0]).toBe('https://api.openai.com/v1/models/gpt-x')
  })

  it('counts the test model as connected', async () => {
    expect(await new ModelConnectionService(config(slot({ provider: 'fake', apiKey: null })), answering(500)).check()).toMatchObject({ state: 'connected', provider: 'Test-Modell' })
  })
})
