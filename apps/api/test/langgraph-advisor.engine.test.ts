import { BaseChatModel, type BaseChatModelCallOptions, type BindToolsInput } from '@langchain/core/language_models/chat_models'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import type { Runnable } from '@langchain/core/runnables'
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base'
import { describe, expect, it } from 'vitest'
import type { CaseDigest } from '@steuereule/core'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { InMemoryAdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { EnvAiRuntimeConfigService, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { RagKiAdapter } from '../src/ki/ki.adapter.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { OwlModeService } from '../src/owl-mode/owl-mode.service.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeOwlCardDismissalRepository, FakeOwlSettingRepository } from './fakes/fake-owl-mode.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const sampleDigest: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  profession: 'IT & Software',
  lstbPersonA: { grossWageEur: 65000, wageTaxEur: 12500, socialSecurityEur: 12000 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 15,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}

class ScriptedChatModel extends BaseChatModel {
  public invokeCount = 0
  private readonly steps: Array<AIMessage | Error>

  constructor(steps: Array<AIMessage | Error>) {
    super({})
    this.steps = [...steps]
  }

  _llmType(): string {
    return 'scripted-test'
  }

  override bindTools(_tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions> {
    return this as unknown as Runnable<BaseLanguageModelInput, AIMessageChunk, BaseChatModelCallOptions>
  }

  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const next = this.steps[this.invokeCount++] ?? new AIMessage('Fertig.')
    if (next instanceof Error) {
      throw next
    }
    return { generations: [{ text: typeof next.content === 'string' ? next.content : '', message: next }] }
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const res = await this._generate(messages)
    const msg = res.generations[0]!.message as AIMessage
    const text = typeof msg.content === 'string' ? msg.content : ''
    const toolCallChunks = msg.tool_calls?.map((tc, index) => ({
      name: tc.name,
      args: JSON.stringify(tc.args),
      index,
      ...(tc.id !== undefined ? { id: tc.id } : {}),
    }))
    if (text.length > 8) {
      const mid = Math.floor(text.length / 2)
      yield new ChatGenerationChunk({ text: text.slice(0, mid), message: new AIMessageChunk({ content: text.slice(0, mid) }) })
      yield new ChatGenerationChunk({ text: text.slice(mid), message: new AIMessageChunk({ content: text.slice(mid) }) })
      return
    }
    yield new ChatGenerationChunk({
      text,
      message: new AIMessageChunk({
        content: text,
        ...(toolCallChunks && toolCallChunks.length > 0 ? { tool_call_chunks: toolCallChunks } : {}),
      }),
    })
  }
}

function runtimeWithProvider(provider: 'google-genai' | 'deterministic', enabled = true): AiRuntimeConfigService {
  return {
    async isKillSwitchActive() {
      return !enabled
    },
    async resolveSlot(slot) {
      return {
        slot,
        enabled,
        provider: enabled ? provider : 'deterministic',
        model: provider === 'google-genai' ? 'gemini-2.5-flash' : 'deterministic-fallback',
        apiKey: enabled && provider === 'google-genai' ? 'test-only-key' : null,
      }
    },
  }
}

describe('AiRuntimeConfigService & LangGraphAdvisorEngine (#446 Slice 2)', () => {
  it('resolves deterministic fallback by default and enforces AI_KILL_SWITCH env flag', async () => {
    const offConfig = new EnvAiRuntimeConfigService({ AI_KILL_SWITCH: 'true', GEMINI_API_KEY: 'live-like-key' })
    expect(await offConfig.isKillSwitchActive()).toBe(true)
    expect(await offConfig.resolveSlot('advisor_chat')).toMatchObject({
      slot: 'advisor_chat',
      enabled: false,
      provider: 'deterministic',
      apiKey: null,
    })

    const envConfig = new EnvAiRuntimeConfigService({
      AI_ADVISOR_PROVIDER: 'google-genai',
      AI_ADVISOR_MODEL: 'gemini-2.5-pro',
      GEMINI_API_KEY: 'test-gemini-key',
      AI_VISION_MODEL: 'gemini-2.5-flash',
    })
    expect(await envConfig.isKillSwitchActive()).toBe(false)
    expect(await envConfig.resolveSlot('advisor_chat')).toMatchObject({
      slot: 'advisor_chat',
      enabled: true,
      provider: 'google-genai',
      model: 'gemini-2.5-pro',
    })
    expect(await envConfig.resolveSlot('vision_ocr')).toMatchObject({
      slot: 'vision_ocr',
      provider: 'google-genai',
      model: 'gemini-2.5-flash',
    })
  })

  it('executes compiled LangGraph tool-calling loop to simulate and stage a pending draft without writing DB', async () => {
    const scriptedModel = new ScriptedChatModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'tc-1',
            name: 'stage_field_draft',
            args: {
              screen: 'commute',
              field: 'oneWayKm',
              newValue: '38',
              label: 'Einfacher Arbeitsweg (Entfernungspauschale)',
              reason: 'Mit 38 km einfachem Arbeitsweg steigt deine Entfernungspauschale deutlich.',
              sourceId: 'estg-9-1',
            },
          },
        ],
      }),
      new AIMessage('Ich habe 38 km einfachen Arbeitsweg nach [estg-9-1] für dich simuliert und als Entwurf bereitgestellt.'),
    ])

    const engine = new LangGraphAdvisorEngine(
      runtimeWithProvider('google-genai'),
      () => scriptedModel,
    )

    const events = []
    for await (const ev of engine.streamTurn({
      message: 'Mein Arbeitsweg sind jetzt 38 km',
      activeScreen: 'commute',
      digest: sampleDigest,
      actionIdFactory: () => 'act-lg-1',
    })) {
      events.push(ev)
    }

    expect(scriptedModel.invokeCount).toBe(2)
    expect(events.some((e) => e.event === 'tool' && e.data.name === 'stage_field_draft')).toBe(true)
    expect(events.some((e) => e.event === 'token')).toBe(true)

    const actionEv = events.find((e) => e.event === 'action')
    expect(actionEv).toBeDefined()
    if (actionEv?.event === 'action') {
      expect(actionEv.data.actionId).toBe('act-lg-1')
      expect(actionEv.data.status).toBe('pending')
      expect(actionEv.data.screen).toBe('commute')
      expect(actionEv.data.field).toBe('oneWayKm')
      expect(actionEv.data.deltaEur).toBeGreaterThan(0)
      expect(actionEv.data.paragraph).toBe('§ 9 Abs. 1 EStG')
    }
  })

  it('blocks adversarial LangGraph tool attempts against AI_FORBIDDEN_SCREENS (profil, stammdaten, kopplung, workplace)', async () => {
    const adversarialModel = new ScriptedChatModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'tc-bad-1',
            name: 'stage_field_draft',
            args: {
              screen: 'profil',
              field: 'steuerId',
              newValue: '99999999999',
              label: 'Steuer-ID',
              reason: 'Tamper test',
              sourceId: 'estg-9-1',
            },
          },
          {
            id: 'tc-bad-2',
            name: 'stage_field_draft',
            args: {
              screen: 'commute',
              field: 'workplace',
              newValue: 'Secret St 1',
              label: 'Adresse',
              reason: 'PII Tamper test',
              sourceId: 'estg-9-1',
            },
          },
        ],
      }),
      new AIMessage('Diese Felder kann ich aus Sicherheitsgründen nicht ändern.'),
    ])

    const engine = new LangGraphAdvisorEngine(
      runtimeWithProvider('google-genai'),
      () => adversarialModel,
    )

    const result = await engine.runTurn({
      message: 'Bitte Arbeitsweg prüfen',
      digest: sampleDigest,
    })

    expect(result.mode).toBe('langgraph')
    expect(result.meta.action).toBeUndefined()
    expect(result.meta.twoPaths).toBeUndefined()
  })

  it('enforces checkPiiFree & StBerG guardrails before invoking external LLM, and falls back on upstream failure', async () => {
    const neverCalledModel = new ScriptedChatModel([new AIMessage('Should not run')])
    const engineWithGuard = new LangGraphAdvisorEngine(
      runtimeWithProvider('google-genai'),
      () => neverCalledModel,
    )

    await expect(
      engineWithGuard.runTurn({
        message: 'Hier ist meine IBAN DE89370400440532013000',
        digest: sampleDigest,
      }),
    ).rejects.toThrow(/IBAN/)
    expect(neverCalledModel.invokeCount).toBe(0)

    const blockedScope = await engineWithGuard.runTurn({
      message: 'Kannst du meine Gewerbesteuer berechnen?',
      digest: sampleDigest,
    })
    expect(blockedScope.replyText).toContain('außerhalb des Unterstützungsrahmens')
    expect(neverCalledModel.invokeCount).toBe(0)

    // Upstream failure triggers deterministic fallback instead of 500
    const failingModel = new ScriptedChatModel([new Error('503 Upstream unavailable')])
    const engineWithFallback = new LangGraphAdvisorEngine(
      runtimeWithProvider('google-genai'),
      () => failingModel,
    )
    const fallbackRes = await engineWithFallback.runTurn({
      message: 'Bitte 250 € Spenden eintragen',
      digest: sampleDigest,
      actionIdFactory: () => 'act-fb-1',
    })
    expect(fallbackRes.mode).toBe('deterministic_fallback')
    expect(fallbackRes.meta.action?.field).toBe('spenden-betrag')
    expect(fallbackRes.meta.action?.newValue).toBe('250')
  })

  it('persists LangGraph streamTurn results via AdvisorService.streamMessage and hydrates expectedPreviousValue', async () => {
    const advisorRepo = new InMemoryAdvisorRepository()
    const interviewRepo = new FakeInterviewAnswerRepository()
    const lstbRepo = new FakeLstbRepository()
    const chRepo = new FakeChSalaryCertificateRepository()
    const childRepo = new FakeChildRepository()
    const commuteRepo = new FakeCommuteRepository()
    const assessmentRepo = new FakeAssessmentRepository()
    const auditService = new AuditService(new FakeAuditRepository())

    const access = fieldAccessFrom({
      lstb: lstbRepo,
      pension: new FakePensionRepository(),
      capital: new FakeCapitalRepository(),
      rental: new FakeRentalRepository(),
      profile: new FakeProfileRepository(),
      masterData: new FakeMasterDataRepository(),
      link: new FakeLinkRepository(),
      interview: interviewRepo,
      chSalaryCertificate: chRepo,
      child: childRepo,
      commute: commuteRepo,
      assessment: assessmentRepo,
    })

    const confirmationService = new ConfirmationService(new FakeMarkingRepository(), access, auditService)
    const owlModeService = new OwlModeService(
      new FakeOwlSettingRepository(),
      new FakeOwlCardDismissalRepository(),
      childRepo,
      interviewRepo,
      assessmentRepo,
      new RagKiAdapter(),
      auditService,
    )

    await commuteRepo.save('user-s2', 2025, {
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 25,
      sickDays: 0,
      homeOfficeDays: 40,
      oneWayKm: 18,
      transport: 'pkw',
      workplace: 'Industriestr. 5',
    })

    const scriptedModel = new ScriptedChatModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'tc-stream-1',
            name: 'stage_field_draft',
            args: {
              screen: 'commute',
              field: 'oneWayKm',
              newValue: '42',
              label: 'Einfacher Arbeitsweg',
              reason: 'Entfernungspauschale auf 42 km aktualisiert.',
              sourceId: 'estg-9-1',
            },
          },
        ],
      }),
      new AIMessage('Ich habe 42 km als Entwurf vorbereitet.'),
    ])

    const engine = new LangGraphAdvisorEngine(runtimeWithProvider('google-genai'), () => scriptedModel)
    const service = new AdvisorService(
      advisorRepo,
      owlModeService,
      confirmationService,
      auditService,
      interviewRepo,
      lstbRepo,
      chRepo,
      commuteRepo,
      childRepo,
      new FakeRentalRepository(),
      new FakeCapitalRepository(),
      new FakeProfileRepository(),
      engine,
    )

    const emitted: Array<{ event: string; data: unknown }> = []
    for await (const ev of service.streamMessage('user-s2', 2025, { message: 'Arbeitsweg ist 42 km', activeScreen: 'commute' })) {
      emitted.push(ev)
    }

    const done = emitted.find((e) => e.event === 'done')
    expect(done).toBeDefined()
    const payload = done!.data as { assistantMessage: { meta?: { action?: { expectedPreviousValue?: string | null; status: string } } } }
    expect(payload.assistantMessage.meta?.action?.expectedPreviousValue).toBe('18')
    expect(payload.assistantMessage.meta?.action?.status).toBe('pending')

    // Zero-Write confirmed: commute repo still holds 18 km until user explicitly applies
    expect((await commuteRepo.findForUserAndYear('user-s2', 2025))?.oneWayKm).toBe(18)
  })
})
