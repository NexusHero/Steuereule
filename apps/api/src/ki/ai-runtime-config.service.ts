import { Inject, Injectable, Optional } from '@nestjs/common'

/** `advisor_guard`: the small model that checks a typed question's topic first (ADR-0069). */
export type AiTaskSlot = 'advisor_chat' | 'vision_ocr' | 'fallback' | 'advisor_guard'
/** `fake`: the scripted FakeKiChatModel, only with AI_FAKE_KI=1 outside production (#450 D8). */
export type AiProviderKind = 'google-genai' | 'anthropic' | 'openai' | 'deterministic' | 'fake'

export interface ResolvedAiSlotConfig {
  readonly slot: AiTaskSlot
  readonly enabled: boolean
  readonly provider: AiProviderKind
  readonly model: string
  readonly apiKey: string | null
  readonly baseUrl?: string | undefined
  readonly temperature?: number | undefined
  readonly maxTokens?: number | undefined
  /**
   * `summary` asks the provider for a reasoning summary to show as the owl's line of thought (#476).
   * Off by default: it needs a model that supports it and costs extra tokens.
   */
  readonly reasoning?: AiReasoningMode | undefined
  /** Token budget for reasoning where the provider takes one. */
  readonly reasoningBudgetTokens?: number | undefined
  readonly thinkingLevel?: AiThinkingLevel | undefined
  /** How long the slot's call may take before the caller gives up on it; set for the topic guard. */
  readonly timeoutMs?: number | undefined
}

export type AiReasoningMode = 'off' | 'summary'
/** How much the model thinks before it answers, where the provider offers a level (Gemini). */
export const AI_THINKING_LEVELS = ['low', 'medium', 'high'] as const
export type AiThinkingLevel = (typeof AI_THINKING_LEVELS)[number]
export const DEFAULT_THINKING_LEVEL: AiThinkingLevel = 'medium'
export const DEFAULT_REASONING_BUDGET_TOKENS = 2048

/**
 * Per-turn budget of the Eulen-Modus agent (#446: max. 5 steps, daily quota). The time limit was
 * 25 s; measured against the real model with reasoning on, the first word alone took 10 to 20 s and
 * two of eight ordinary questions ran into it (#476), so it is 60 s now.
 */
export interface AiTurnLimits {
  readonly turnTimeoutMs: number
  readonly maxToolRounds: number
  readonly dailyMessageLimit: number
}

export const DEFAULT_AI_TURN_LIMITS: AiTurnLimits = {
  turnTimeoutMs: 60_000,
  maxToolRounds: 5,
  dailyMessageLimit: 50,
}

export const AI_RUNTIME_CONFIG_SERVICE = Symbol('AI_RUNTIME_CONFIG_SERVICE')
export const AI_ENV_SOURCE = Symbol('AI_ENV_SOURCE')

export interface AiRuntimeConfigService {
  isKillSwitchActive(): Promise<boolean>
  resolveSlot(slot: AiTaskSlot): Promise<ResolvedAiSlotConfig>
  resolveLimits(): Promise<AiTurnLimits>
}

const VALID_PROVIDERS: ReadonlySet<string> = new Set<AiProviderKind>([
  'google-genai',
  'anthropic',
  'openai',
  'deterministic',
])

const DEFAULT_MODEL_BY_PROVIDER: Readonly<Record<AiProviderKind, string>> = {
  'google-genai': 'gemini-3.8-flash',
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4o-mini',
  deterministic: 'deterministic-fallback',
  fake: 'fake-ki-script',
}

/**
 * The topic guard only sorts a question into tax, grey zone or off topic: the small, quick model of
 * each provider is enough, and it is asked before every typed question.
 */
const GUARD_MODEL_BY_PROVIDER: Readonly<Record<AiProviderKind, string>> = {
  ...DEFAULT_MODEL_BY_PROVIDER,
  anthropic: 'claude-haiku-5-5',
}

export const DEFAULT_GUARD_TIMEOUT_MS = 5_000

function isTruthyFlag(raw: string | undefined): boolean {
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function positiveIntOr(raw: string | undefined, fallback: number, max: number): number {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
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
 * Env-backed runtime config adapter for per-capability slots
 * (`advisor_chat`, `vision_ocr`, `fallback`, `advisor_guard`) until a persistent admin
 * backoffice configuration adapter (#445) lands.
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

  async resolveLimits(): Promise<AiTurnLimits> {
    return {
      turnTimeoutMs: positiveIntOr(this.env.AI_TURN_TIMEOUT_MS, DEFAULT_AI_TURN_LIMITS.turnTimeoutMs, 120_000),
      maxToolRounds: positiveIntOr(this.env.AI_MAX_TOOL_ROUNDS, DEFAULT_AI_TURN_LIMITS.maxToolRounds, 10),
      dailyMessageLimit: positiveIntOr(this.env.AI_DAILY_MESSAGE_LIMIT, DEFAULT_AI_TURN_LIMITS.dailyMessageLimit, 1_000),
    }
  }

  private inferProvider(): AiProviderKind {
    if (this.env.GEMINI_API_KEY?.trim() || this.env.GOOGLE_API_KEY?.trim()) return 'google-genai'
    if (this.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic'
    if (this.env.OPENAI_API_KEY?.trim()) return 'openai'
    return 'deterministic'
  }

  private resolveApiKey(provider: AiProviderKind, slot: AiTaskSlot): string | null {
    if (provider === 'deterministic' || provider === 'fake') return null
    if (slot === 'vision_ocr' && this.env.AI_VISION_API_KEY?.trim()) {
      return this.env.AI_VISION_API_KEY.trim()
    }
    if (slot === 'advisor_chat' && this.env.AI_ADVISOR_API_KEY?.trim()) {
      return this.env.AI_ADVISOR_API_KEY.trim()
    }
    if (slot === 'fallback' && this.env.AI_FALLBACK_API_KEY?.trim()) {
      return this.env.AI_FALLBACK_API_KEY.trim()
    }
    if (slot === 'advisor_guard' && this.env.AI_GUARD_API_KEY?.trim()) {
      return this.env.AI_GUARD_API_KEY.trim()
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

    // #450 D8: CI and tests chat with the scripted fake model; production refuses the flag at startup.
    if (slot === 'advisor_chat' && isTruthyFlag(this.env.AI_FAKE_KI) && this.env.NODE_ENV !== 'production') {
      return { slot, enabled: true, provider: 'fake', model: DEFAULT_MODEL_BY_PROVIDER.fake, apiKey: null }
    }

    // The scripted fake answers the chat only; the guard is off with it, so CI turns run as before.
    if (slot === 'advisor_guard' && isTruthyFlag(this.env.AI_FAKE_KI) && this.env.NODE_ENV !== 'production') {
      return { slot, enabled: false, provider: 'deterministic', model: DEFAULT_MODEL_BY_PROVIDER.deterministic, apiKey: null }
    }

    let explicitProvider: AiProviderKind | null = null
    let explicitModel: string | undefined

    if (slot === 'advisor_guard') {
      explicitProvider = normalizeProvider(this.env.AI_GUARD_PROVIDER) ?? normalizeProvider(this.env.AI_ADVISOR_PROVIDER)
      explicitModel = this.env.AI_GUARD_MODEL?.trim() || undefined
    } else if (slot === 'advisor_chat') {
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
    const rawLevel = this.env.AI_ADVISOR_THINKING_LEVEL?.trim().toLowerCase()
    // Measured against Gemini (scripts/ai-eval/latency-check.ts), time to the first answer word:
    // low 3 to 6 s, medium 6 to 9 s, the model's own choice 10 to 13 s, high 13 to 20 s. With the
    // thoughts shown the first sign of life comes after about 3 s at every level. Medium is the
    // product decision (#481): thoroughness over the last seconds. `auto` hands the choice back.
    const thinkingLevel: AiThinkingLevel | undefined =
      rawLevel === 'auto' ? undefined : (AI_THINKING_LEVELS as readonly string[]).includes(rawLevel ?? '') ? (rawLevel as AiThinkingLevel) : DEFAULT_THINKING_LEVEL
    const rawTemp = this.env.AI_TEMPERATURE?.trim()
    const parsedTemp = rawTemp ? Number.parseFloat(rawTemp) : undefined
    const temperature = parsedTemp !== undefined && Number.isFinite(parsedTemp) ? parsedTemp : undefined

    if (slot === 'advisor_guard') {
      // A verdict, not prose: no creativity, no long thinking, and a short leash.
      return {
        slot,
        enabled: true,
        provider,
        model: explicitModel ?? GUARD_MODEL_BY_PROVIDER[provider],
        apiKey,
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        temperature: 0,
        thinkingLevel: 'low',
        timeoutMs: positiveIntOr(this.env.AI_GUARD_TIMEOUT_MS, DEFAULT_GUARD_TIMEOUT_MS, 20_000),
      }
    }

    return {
      slot,
      enabled: true,
      provider,
      model: explicitModel ?? DEFAULT_MODEL_BY_PROVIDER[provider],
      apiKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      // Only the chat shows a line of thought; OCR and the fallback slot never pay for one.
      // The chat shows the owl's line of thought unless it is switched off (#481): a wait the user
      // can watch is a shorter wait. Set AI_ADVISOR_REASONING=off to save the tokens.
      ...(slot === 'advisor_chat' && this.env.AI_ADVISOR_REASONING?.trim().toLowerCase() !== 'off'
        ? {
            reasoning: 'summary' as const,
            reasoningBudgetTokens: positiveIntOr(this.env.AI_ADVISOR_REASONING_BUDGET, DEFAULT_REASONING_BUDGET_TOKENS, 16_000),
          }
        : {}),
      ...(slot === 'advisor_chat' && thinkingLevel !== undefined ? { thinkingLevel } : {}),
    }
  }
}
