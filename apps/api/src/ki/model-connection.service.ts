import { Inject, Injectable, Optional } from '@nestjs/common'
import type { AdvisorConnection, AdvisorModelFailure } from '@steuereule/core'
import { AI_RUNTIME_CONFIG_SERVICE, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from './ai-runtime-config.service.js'
import { classifyModelFailure } from './advisor-failure.js'

export const MODEL_CONNECTION_FETCH = Symbol('MODEL_CONNECTION_FETCH')

/** How long one check counts: the chat polls this, the provider should not hear from every poll. */
const CHECK_TTL_MS = 60_000
/** A turn that failed this recently still counts against the connection. */
const RECENT_FAILURE_MS = 5 * 60_000
const CHECK_TIMEOUT_MS = 4_000

const DISPLAY_NAME: Readonly<Record<string, string>> = { 'google-genai': 'Gemini', anthropic: 'Claude', openai: 'OpenAI', fake: 'Test-Modell' }

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>

/**
 * Whether the owl can reach its model (#488). A check asks the provider for the model itself, which
 * costs no tokens and proves that the key works and the model exists. What the turns of the owl
 * experienced is added: a connection that answers the check but fails real turns is `degraded`.
 */
@Injectable()
export class ModelConnectionService {
  private cached: { readonly at: number; readonly key: string; readonly connection: AdvisorConnection } | null = null
  private lastTurnFailure: { readonly at: number; readonly failure: AdvisorModelFailure } | null = null
  private readonly fetchImpl: FetchLike

  constructor(
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Optional() @Inject(MODEL_CONNECTION_FETCH) fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init))
  }

  /** A real turn ended: with the reason when the model failed it, with null when it answered. */
  recordTurn(failure: AdvisorModelFailure | null): void {
    this.lastTurnFailure = failure ? { at: Date.now(), failure } : null
    // The next look at the connection should not hide what a turn just found out.
    this.cached = null
  }

  async check(now: number = Date.now()): Promise<AdvisorConnection> {
    let slot: ResolvedAiSlotConfig | null = null
    try {
      slot = (await this.runtimeConfig.isKillSwitchActive()) ? null : await this.runtimeConfig.resolveSlot('advisor_chat')
    } catch {
      slot = null
    }
    const checkedAt = new Date(now).toISOString()
    if (!slot || !slot.enabled || slot.provider === 'deterministic') return { state: 'rules-only', provider: null, model: null, checkedAt }
    const provider = DISPLAY_NAME[slot.provider] ?? slot.provider
    if (slot.provider === 'fake') return { state: 'connected', provider, model: slot.model, checkedAt }

    const key = `${slot.provider}|${slot.model}`
    let probe = this.cached && this.cached.key === key && now - this.cached.at < CHECK_TTL_MS ? this.cached.connection : null
    if (!probe) {
      const failure = await this.probe(slot)
      probe = { state: failure ? 'unavailable' : 'connected', provider, model: slot.model, ...(failure ? { failure } : {}), checkedAt }
      this.cached = { at: now, key, connection: probe }
    }
    const recent = this.lastTurnFailure && now - this.lastTurnFailure.at < RECENT_FAILURE_MS ? this.lastTurnFailure.failure : null
    return probe.state === 'connected' && recent ? { ...probe, state: 'degraded', failure: recent } : probe
  }

  /** Null when the provider knows the model and accepts the key; otherwise why not. */
  private async probe(slot: ResolvedAiSlotConfig): Promise<AdvisorModelFailure | null> {
    const request = this.requestFor(slot)
    if (!request) return null
    try {
      const response = await this.fetchImpl(request.url, { headers: request.headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      if (response.ok) return null
      // Asking for a model by name is refused with 400 only when the key is not accepted.
      return classifyModelFailure(new Error(`[${response.status}] ${response.status === 400 ? 'API key not valid' : 'connection check'}`), 'error', slot.provider)
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      return classifyModelFailure(error, timedOut ? 'timeout' : 'error', slot.provider)
    }
  }

  private requestFor(slot: ResolvedAiSlotConfig): { url: string; headers: Record<string, string> } | null {
    const model = encodeURIComponent(slot.model)
    switch (slot.provider) {
      case 'google-genai':
        return { url: `https://generativelanguage.googleapis.com/v1beta/models/${model}`, headers: { 'x-goog-api-key': slot.apiKey ?? '' } }
      case 'anthropic':
        return { url: `https://api.anthropic.com/v1/models/${model}`, headers: { 'x-api-key': slot.apiKey ?? '', 'anthropic-version': '2023-06-01' } }
      case 'openai':
        return { url: `${(slot.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/models/${model}`, headers: { Authorization: `Bearer ${slot.apiKey ?? ''}` } }
      default:
        return null
    }
  }
}
