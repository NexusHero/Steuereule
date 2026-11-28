import { Inject, Injectable } from '@nestjs/common'
import {
  advisorModelCapabilities,
  advisorModelProfiles,
  profileKey,
  type AdvisorDepth,
  type AdvisorModelProvider,
  type AdvisorUsageSample,
} from '@steuereule/core'
import { AdvisorModelCatalog } from '../llm/model-catalog.js'
import { AI_RUNTIME_CONFIG_SERVICE, type AiRuntimeConfigService } from '../llm/ai-runtime-config.service.js'
import { ADVISOR_REPOSITORY, type AdvisorMessageUsage, type AdvisorRepository } from './advisor.repository.js'
import type { AdvisorModelsDto } from './dto/advisor.dto.js'

/** How many recent answers the factors are measured from. */
const USAGE_WINDOW = 2_000

const PROVIDERS: ReadonlySet<string> = new Set<AdvisorModelProvider>(['anthropic', 'google-genai', 'openai'])

function isProvider(value: string | undefined): value is AdvisorModelProvider {
  return value !== undefined && PROVIDERS.has(value)
}

function toSample(usage: AdvisorMessageUsage): AdvisorUsageSample | null {
  if (!isProvider(usage.provider) || usage.model === undefined || usage.inputTokens === undefined || usage.outputTokens === undefined) return null
  return {
    provider: usage.provider,
    model: usage.model,
    depth: (usage.depth ?? 'gruendlich') as AdvisorDepth,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    firstTokenMs: usage.firstTokenMs,
  }
}

/** The models the user may pick, with what Gründlich and Max cost and how long they take (ADR-0096). */
@Injectable()
export class AdvisorModelsService {
  constructor(
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Inject(AdvisorModelCatalog) private readonly catalog: AdvisorModelCatalog,
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
  ) {}

  async list(): Promise<AdvisorModelsDto> {
    const slot = await this.runtimeConfig.resolveSlot('advisor_chat')
    if (!slot.enabled || !isProvider(slot.provider)) return { standard: null, models: [] }
    const standard = { provider: slot.provider, model: slot.model }
    const keys = this.runtimeConfig.chatProviderKeys ? await this.runtimeConfig.chatProviderKeys() : []
    const models = await this.catalog.list(keys, standard)
    const samples = (await this.advisorRepo.recentUsage(USAGE_WINDOW)).flatMap((usage) => toSample(usage) ?? [])
    const profiles = advisorModelProfiles(samples, standard)
    return {
      standard,
      models: models.map((m) => ({
        provider: m.provider,
        model: m.model,
        label: m.label,
        depths: advisorModelCapabilities(m.provider, m.model).depths.map((depth) => {
          const profile = profiles.get(profileKey(m.provider, m.model, depth))
          return { depth, ...(profile ?? { samples: 0 }) }
        }),
      })),
    }
  }

  /** Whether a pick can be used: a known provider with a key. The engine falls back to the standard either way. */
  async isAvailable(provider: AdvisorModelProvider, model: string): Promise<boolean> {
    return this.runtimeConfig.resolveChatChoice ? (await this.runtimeConfig.resolveChatChoice(provider, model)) !== null : false
  }
}

