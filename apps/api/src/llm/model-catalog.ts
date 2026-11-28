import { Inject, Injectable, Optional } from '@nestjs/common'
import type { AdvisorModelProvider } from '@steuereule/core'

/** The part of `fetch` the catalog uses; injectable so tests never call a provider. */
export type CatalogFetch = (
  url: string,
  init?: { readonly headers?: Record<string, string>; readonly signal?: AbortSignal },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>

export const CATALOG_FETCH = Symbol('CATALOG_FETCH')
export const CATALOG_CLOCK = Symbol('CATALOG_CLOCK')

export interface CatalogModel {
  readonly provider: AdvisorModelProvider
  readonly model: string
  readonly label: string
}

export interface ProviderKey {
  readonly provider: AdvisorModelProvider
  readonly apiKey: string
  readonly baseUrl?: string | undefined
}

/** How long a provider's list is kept; a provider that did not answer is asked again after the same time. */
const CACHE_MS = 6 * 60 * 60 * 1000
const TIMEOUT_MS = 5_000

/** Only models that write chat answers: no embeddings, images, speech or live audio. */
const NOT_CHAT = /(?:embed|image|imagen|banana|omni|veo|tts|audio|live|robotics|gemma|aqa|learnlm|vision-only|moderation|whisper|dall-e|realtime|transcribe|search)/i

/**
 * The chat models of every provider with a key (ADR-0096), from the provider's own models endpoint.
 * The standard model is always in the list, even when its provider does not answer.
 */
@Injectable()
export class AdvisorModelCatalog {
  private readonly cache = new Map<string, { readonly at: number; readonly models: readonly CatalogModel[] }>()

  constructor(
    @Optional() @Inject(CATALOG_FETCH) private readonly fetchFn: CatalogFetch = (url, init) => fetch(url, init),
    @Optional() @Inject(CATALOG_CLOCK) private readonly now: () => number = Date.now,
  ) {}

  async list(keys: readonly ProviderKey[], standard: { readonly provider: AdvisorModelProvider; readonly model: string }): Promise<readonly CatalogModel[]> {
    const lists = await Promise.all(keys.map((key) => this.listOf(key)))
    const all = lists.flat()
    const withStandard = all.some((m) => m.provider === standard.provider && m.model === standard.model)
      ? all
      : [{ provider: standard.provider, model: standard.model, label: standard.model }, ...all]
    // The standard model first, then each provider's models in the provider's order.
    const isStandard = (m: CatalogModel) => m.provider === standard.provider && m.model === standard.model
    return [...withStandard.filter(isStandard), ...withStandard.filter((m) => !isStandard(m))]
  }

  private async listOf(key: ProviderKey): Promise<readonly CatalogModel[]> {
    const cacheKey = `${key.provider}:${key.baseUrl ?? ''}:${key.apiKey.slice(-6)}`
    const cached = this.cache.get(cacheKey)
    if (cached && this.now() - cached.at < CACHE_MS) return cached.models
    const models = await this.fetchModels(key).catch(() => [])
    this.cache.set(cacheKey, { at: this.now(), models })
    return models
  }

  private async getJson(url: string, headers: Record<string, string>): Promise<unknown> {
    const res = await this.fetchFn(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`models endpoint answered ${res.status}`)
    return res.json()
  }

  private async fetchModels(key: ProviderKey): Promise<readonly CatalogModel[]> {
    switch (key.provider) {
      case 'anthropic': {
        const body = (await this.getJson('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key.apiKey, 'anthropic-version': '2023-06-01' })) as {
          readonly data?: readonly { readonly id?: string; readonly display_name?: string }[]
        }
        return (body.data ?? []).flatMap((m) => (m.id?.startsWith('claude-') ? [{ provider: 'anthropic' as const, model: m.id, label: m.display_name ?? m.id }] : []))
      }
      case 'google-genai': {
        const body = (await this.getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key.apiKey })) as {
          readonly models?: readonly { readonly name?: string; readonly displayName?: string; readonly supportedGenerationMethods?: readonly string[] }[]
        }
        return (body.models ?? []).flatMap((m) => {
          const id = m.name?.replace(/^models\//, '')
          const chat = id?.startsWith('gemini-') && (m.supportedGenerationMethods ?? []).includes('generateContent') && !NOT_CHAT.test(id)
          return chat && id ? [{ provider: 'google-genai' as const, model: id, label: m.displayName ?? id }] : []
        })
      }
      case 'openai': {
        const base = key.baseUrl ?? 'https://api.openai.com/v1'
        const body = (await this.getJson(`${base}/models`, { authorization: `Bearer ${key.apiKey}` })) as { readonly data?: readonly { readonly id?: string }[] }
        return (body.data ?? []).flatMap((m) => (m.id && /^(?:gpt-|o\d)/.test(m.id) && !NOT_CHAT.test(m.id) ? [{ provider: 'openai' as const, model: m.id, label: m.id }] : []))
      }
    }
  }
}
