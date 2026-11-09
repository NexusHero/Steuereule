import { Inject, Injectable, Optional } from '@nestjs/common'

export type AiTaskSlot = 'advisor_chat' | 'vision_ocr' | 'fallback'
export type AiProviderKind = 'google-genai' | 'anthropic' | 'openai' | 'deterministic'

export interface ResolvedAiSlotConfig {
  readonly slot: AiTaskSlot
  readonly enabled: boolean
  readonly provider: AiProviderKind
  readonly model: string
  readonly apiKey: string | null
  readonly baseUrl?: string | undefined
  readonly temperature?: number | undefined
  readonly maxTokens?: number | undefined
}

export const AI_RUNTIME_CONFIG_SERVICE = Symbol('AI_RUNTIME_CONFIG_SERVICE')
export const AI_ENV_SOURCE = Symbol('AI_ENV_SOURCE')

export interface AiRuntimeConfigService {
  isKillSwitchActive(): Promise<boolean>
  resolveSlot(slot: AiTaskSlot): Promise<ResolvedAiSlotConfig>
}

const VALID_PROVIDERS: ReadonlySet<string> = new Set<AiProviderKind>([
  'google-genai',
  'anthropic',
  'openai',
  'deterministic',
])

const DEFAULT_MODEL_BY_PROVIDER: Readonly<Record<AiProviderKind, string>> = {
  'google-genai': 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  deterministic: 'deterministic-fallback',
}

function isTruthyFlag(raw: string | undefined): boolean {
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function normalizeProvider(raw: string | undefined): AiProviderKind | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  return VALID_PROVIDERS.has(normalized) ? (normalized as AiProviderKind) : null
}

function validateHttpsBaseUrl(raw: string | undefined): string | undefined {
  if (!raw || raw.trim().length === 0) return undefined
  const parsed = new URL(raw.trim())
  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid AI_BASE_URL "${parsed.toString()}": only https:// endpoints are allowed.`)
  }
  return parsed.toString().replace(/\/$/, '')
}

/**
 * Env-backed runtime config adapter aligned with ADR-0057 slots
 * (`advisor_chat`, `vision_ocr`, `fallback`) until the persistent admin
 * backoffice adapter from #445 lands.
 */
@Injectable()
export class EnvAiRuntimeConfigService implements AiRuntimeConfigService {
  private readonly env: Readonly<Record<string, string | undefined>>

  constructor(@Optional() @Inject(AI_ENV_SOURCE) env?: Readonly<Record<string, string | undefined>>) {
    this.env = env ?? process.env
  }

  async isKillSwitchActive(): Promise<boolean> {
    return isTruthyFlag(this.env.AI_KILL_SWITCH)
  }

  private inferProvider(): AiProviderKind {
    if (this.env.GEMINI_API_KEY?.trim() || this.env.GOOGLE_API_KEY?.trim()) return 'google-genai'
    if (this.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic'
    if (this.env.OPENAI_API_KEY?.trim()) return 'openai'
    return 'deterministic'
  }

  private resolveApiKey(provider: AiProviderKind, slot: AiTaskSlot): string | null {
    if (provider === 'deterministic') return null
    if (slot === 'vision_ocr' && this.env.AI_VISION_API_KEY?.trim()) {
      return this.env.AI_VISION_API_KEY.trim()
    }
    if (slot === 'advisor_chat' && this.env.AI_ADVISOR_API_KEY?.trim()) {
      return this.env.AI_ADVISOR_API_KEY.trim()
    }
    if (slot === 'fallback' && this.env.AI_FALLBACK_API_KEY?.trim()) {
      return this.env.AI_FALLBACK_API_KEY.trim()
    }

    switch (provider) {
      case 'google-genai':
        return this.env.GEMINI_API_KEY?.trim() || this.env.GOOGLE_API_KEY?.trim() || this.env.AI_API_KEY?.trim() || null
      case 'anthropic':
        return this.env.ANTHROPIC_API_KEY?.trim() || this.env.AI_API_KEY?.trim() || null
      case 'openai':
        return this.env.OPENAI_API_KEY?.trim() || this.env.AI_API_KEY?.trim() || null
    }
  }

  async resolveSlot(slot: AiTaskSlot): Promise<ResolvedAiSlotConfig> {
    if (await this.isKillSwitchActive()) {
      return {
        slot,
        enabled: false,
        provider: 'deterministic',
        model: DEFAULT_MODEL_BY_PROVIDER.deterministic,
        apiKey: null,
      }
    }

    let explicitProvider: AiProviderKind | null = null
    let explicitModel: string | undefined

    if (slot === 'advisor_chat') {
      explicitProvider = normalizeProvider(this.env.AI_ADVISOR_PROVIDER)
      explicitModel = this.env.AI_ADVISOR_MODEL?.trim() || undefined
    } else if (slot === 'vision_ocr') {
      explicitProvider =
        normalizeProvider(this.env.AI_VISION_PROVIDER) ?? normalizeProvider(this.env.AI_ADVISOR_PROVIDER)
      explicitModel = this.env.AI_VISION_MODEL?.trim() || undefined
    } else {
      explicitProvider =
        normalizeProvider(this.env.AI_FALLBACK_PROVIDER) ?? normalizeProvider(this.env.AI_ADVISOR_PROVIDER)
      explicitModel = this.env.AI_FALLBACK_MODEL?.trim() || undefined
    }

    const provider = explicitProvider ?? this.inferProvider()
    const apiKey = this.resolveApiKey(provider, slot)

    if (provider === 'deterministic' || !apiKey) {
      return {
        slot,
        enabled: false,
        provider: 'deterministic',
        model: DEFAULT_MODEL_BY_PROVIDER.deterministic,
        apiKey: null,
      }
    }

    const baseUrl = validateHttpsBaseUrl(this.env.AI_BASE_URL ?? this.env.OPENAI_BASE_URL)
    const rawTemp = this.env.AI_TEMPERATURE?.trim()
    const parsedTemp = rawTemp ? Number.parseFloat(rawTemp) : undefined
    const temperature = parsedTemp !== undefined && Number.isFinite(parsedTemp) ? parsedTemp : undefined

    return {
      slot,
      enabled: true,
      provider,
      model: explicitModel ?? DEFAULT_MODEL_BY_PROVIDER[provider],
      apiKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    }
  }
}
