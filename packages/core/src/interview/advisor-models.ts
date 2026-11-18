// Which chat models the user may pick and how deep they think (Gründlich / Max), with what a choice
// costs measured against the standard model. One list for the API, which sets up the model, and the
// app, which only offers what the model can do (ADR-0096).

export const ADVISOR_MODEL_PROVIDERS = ['anthropic', 'google-genai', 'openai'] as const
export type AdvisorModelProvider = (typeof ADVISOR_MODEL_PROVIDERS)[number]

/** Gründlich is the owl's standard depth (medium, #481); Max is the deepest the model offers. */
export const ADVISOR_DEPTHS = ['gruendlich', 'max'] as const
export type AdvisorDepth = (typeof ADVISOR_DEPTHS)[number]

export type AdvisorThinkingLevel = 'low' | 'medium' | 'high'

/**
 * How a model is told how much to think: an effort level (current Claude), a thinking level
 * (Gemini 3), a token budget (Claude up to 4.5), or not at all from this app.
 */
export type AdvisorDepthControl = 'effort' | 'level' | 'budget' | 'none'

export interface AdvisorModelCapabilities {
  readonly control: AdvisorDepthControl
  /** The depths the app may offer; Max only where the model can think deeper than Gründlich. */
  readonly depths: readonly AdvisorDepth[]
}

/** What a depth turns into for the model call. */
export interface AdvisorDepthSetting {
  readonly thinkingLevel?: AdvisorThinkingLevel
  readonly reasoningBudgetTokens?: number
}

/**
 * Claude models up to 4.5 think on a fixed token budget and take a temperature. Every later model
 * decides the depth itself (`adaptive`), is steered by `effort`, and rejects both a budget and a
 * temperature of our own with a 400. Unknown names count as current, so a new model works unchanged.
 */
const BUDGET_THINKING_MODEL = /^claude-(?:3-|(?:opus|sonnet|haiku)-4(?:$|-(?:[015]|\d{8})(?:-|$)))/

export function thinksOnBudget(model: string): boolean {
  return BUDGET_THINKING_MODEL.test(model)
}

/** The budget for Gründlich matches the chat's standard (AI_ADVISOR_REASONING_BUDGET default). */
const BUDGET_TOKENS: Readonly<Record<AdvisorDepth, number>> = { gruendlich: 2048, max: 16_000 }

export function advisorModelCapabilities(provider: AdvisorModelProvider, model: string): AdvisorModelCapabilities {
  if (provider === 'anthropic') return { control: thinksOnBudget(model) ? 'budget' : 'effort', depths: ADVISOR_DEPTHS }
  // Gemini 3 takes a thinking level (low, medium, high); earlier Gemini models only a budget the app does not set.
  if (provider === 'google-genai' && /^gemini-(?:[3-9]|\d{2,})/.test(model)) return { control: 'level', depths: ADVISOR_DEPTHS }
  return { control: 'none', depths: ['gruendlich'] }
}

export function depthSetting(provider: AdvisorModelProvider, model: string, depth: AdvisorDepth): AdvisorDepthSetting {
  const { control, depths } = advisorModelCapabilities(provider, model)
  if (!depths.includes(depth)) return {}
  switch (control) {
    case 'effort':
    case 'level':
      // Max is `high` for Claude too: `effort: max` took 330 s and about 15× the cost of Gründlich
      // for a simple question in the check run, `high` 17 s (ADR-0096).
      return { thinkingLevel: depth === 'max' ? 'high' : 'medium' }
    case 'budget':
      return { reasoningBudgetTokens: BUDGET_TOKENS[depth] }
    case 'none':
      return {}
  }
}

export interface AdvisorModelPrice {
  readonly inputUsdPerMTok: number
  readonly outputUsdPerMTok: number
}

/**
 * Anthropic's first-party list prices (Claude API reference, 2026-11). Models of other providers
 * have none here: their cost factor stays unknown rather than guessed.
 */
const PRICES: Readonly<Record<string, AdvisorModelPrice>> = {
  'anthropic:claude-fable-5-2': { inputUsdPerMTok: 8, outputUsdPerMTok: 40 },
  'anthropic:claude-fable-5-1': { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  'anthropic:claude-fable-5': { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  'anthropic:claude-opus-5-5': { inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  'anthropic:claude-opus-5': { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  'anthropic:claude-opus-4-8': { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  'anthropic:claude-opus-4-7': { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  'anthropic:claude-opus-4-6': { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  'anthropic:claude-sonnet-5-5': { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  'anthropic:claude-sonnet-5': { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  'anthropic:claude-sonnet-4-6': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  'anthropic:claude-haiku-5-5': { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
  'anthropic:claude-haiku-4-5': { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
}

export function modelPrice(provider: AdvisorModelProvider, model: string): AdvisorModelPrice | null {
  return PRICES[`${provider}:${model}`] ?? null
}

/** One answer of the owl as the API logged it: no content, only which model, how deep, tokens and wait. */
export interface AdvisorUsageSample {
  readonly provider: AdvisorModelProvider
  readonly model: string
  readonly depth: AdvisorDepth
  readonly inputTokens: number
  readonly cachedInputTokens: number
  readonly outputTokens: number
  readonly firstTokenMs: number | null
}

export interface AdvisorModelProfile {
  /** Cost of a median answer relative to the reference model with Gründlich; absent without prices. */
  readonly costFactor?: number
  /** Median wait until the first word of the answer, in seconds. */
  readonly firstWordSeconds?: number
  readonly samples: number
}

/** Below this many answers a setting counts as „noch nicht gemessen“. */
export const MIN_PROFILE_SAMPLES = 5
/** Cached input is billed at a tenth of the input price. */
const CACHED_INPUT_SHARE = 0.1

export function profileKey(provider: AdvisorModelProvider, model: string, depth: AdvisorDepth): string {
  return `${provider}:${model}:${depth}`
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

function costUsd(sample: AdvisorUsageSample, price: AdvisorModelPrice): number {
  const fresh = Math.max(0, sample.inputTokens - sample.cachedInputTokens)
  return (fresh * price.inputUsdPerMTok + sample.cachedInputTokens * price.inputUsdPerMTok * CACHED_INPUT_SHARE + sample.outputTokens * price.outputUsdPerMTok) / 1_000_000
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Cost and wait of every model and depth, from the answers the owl gave (ADR-0096): the median
 * answer of a setting against the median answer of the reference model with Gründlich.
 */
export function advisorModelProfiles(
  samples: readonly AdvisorUsageSample[],
  reference: { readonly provider: AdvisorModelProvider; readonly model: string },
): ReadonlyMap<string, AdvisorModelProfile> {
  const groups = new Map<string, AdvisorUsageSample[]>()
  for (const sample of samples) {
    const key = profileKey(sample.provider, sample.model, sample.depth)
    groups.set(key, [...(groups.get(key) ?? []), sample])
  }
  const medianCost = (group: readonly AdvisorUsageSample[]): number | undefined => {
    const first = group[0]
    const price = first === undefined ? null : modelPrice(first.provider, first.model)
    return price === null ? undefined : median(group.map((s) => costUsd(s, price)))
  }
  const referenceGroup = groups.get(profileKey(reference.provider, reference.model, 'gruendlich')) ?? []
  const referenceCost = referenceGroup.length >= MIN_PROFILE_SAMPLES ? medianCost(referenceGroup) : undefined

  const profiles = new Map<string, AdvisorModelProfile>()
  for (const [key, group] of groups) {
    if (group.length < MIN_PROFILE_SAMPLES) continue
    const cost = medianCost(group)
    const wait = median(group.flatMap((s) => (s.firstTokenMs === null ? [] : [s.firstTokenMs])))
    profiles.set(key, {
      ...(cost !== undefined && referenceCost !== undefined && referenceCost > 0 ? { costFactor: round1(cost / referenceCost) } : {}),
      ...(wait !== undefined ? { firstWordSeconds: Math.round(wait / 1000) } : {}),
      samples: group.length,
    })
  }
  return profiles
}
