import { randomUUID } from 'node:crypto'
import { newActionId } from '../common/action-id.js'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  ADVISOR_LEGAL_SOURCES,
  buildAdvisorHistory,
  evaluateAdvisorTurn,
  provenanceKey,
  scrubUserMessagePii,
  simulateAdvisorFieldDelta,
  type AdvisorActionProposal,
  type AdvisorAssessmentBrief,
  type AdvisorEngineInfo,
  type AdvisorEnginePort,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorMessageFeedback,
  type AdvisorMessageMeta,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorRecordHandles,
  type AdvisorStreamEvent,
  type AdvisorTurnResult,
  type AdvisorTurnUsage,
  type CaseDigest,
  type LstbCalculationTerm,
  type LstbExtractedField,
  type OwlSourceId,
  type Screen,
  type WageTaxCertificateFieldId,
  advisorContextUsage,
  buildNoteHandles,
  foldThoughtEvent,
  type AdvisorThoughtStep,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { ADVISOR_ENGINE } from '../ki/langgraph-advisor.engine.js'
import { AI_RUNTIME_CONFIG_SERVICE, DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../ki/ai-runtime-config.service.js'
import { AssessmentService } from '../assessment/assessment.service.js'
import { ModelConnectionService } from '../ki/model-connection.service.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../tax-estimate/tax-estimate.service.js'
import { TRANSACTION_RUNNER, passThroughTransactionRunner, type TransactionRunner } from '../prisma/transaction.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { assertAiWritable } from '../confirmation/ai-write-policy.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { ConflictError, DomainError, InvalidInputError, NotFoundError, TooManyRequestsError, UnavailableError } from '../common/domain-error.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorChatMessageRecord,
  type AdvisorConversationRecord,
  type AdvisorMessageUsage,
  type AdvisorRepository,
  type FinishAdvisorMessageInput,
} from './advisor.repository.js'
import type {
  AdvisorActionMutationResponseDto,
  AdvisorChatMessageDto,
  AdvisorConnectionDto,
  AdvisorContextDto,
  AdvisorConversationDto,
  AdvisorNoteDto,
  AdvisorSituationDto,
  AdvisorSearchHitDto,
  AdvisorSessionResponseDto,
  ApplyBatchActionsDto,
  ApplyBatchActionsResponseDto,
  SendAdvisorMessageDto,
  SendAdvisorMessageResponseDto,
} from './dto/advisor.dto.js'
import { ANSWERING_WINDOW_MS, projectsOf, toPublicAction, toPublicMeta, toMessageDto, PreparedAdvisorTurn, titleFrom, liveMessages, historySources, contextOf, toNoteDto, toConversationDto } from './advisor-shared.js'
import { AdvisorConversations } from './advisor-conversations.js'
import { AdvisorProjectNotes } from './advisor-project-notes.js'
import { AdvisorCaseFacts } from './advisor-case-facts.js'
import { AdvisorDrafts } from './advisor-drafts.js'
export { MAX_CONVERSATIONS_PER_YEAR, searchKey, snippetAround, titleFrom } from './advisor-shared.js'
export type { PreparedAdvisorTurn } from './advisor-shared.js'


const DETERMINISTIC_ENGINE: AdvisorEngineInfo = { mode: 'deterministic_fallback', provider: 'deterministic' }

const TURN_FAILED_MESSAGE = 'Die Antwort der Eule ist unterwegs abgebrochen. Bitte versuche es erneut.'

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

/** Chat-facing reason of a scanned LStB proposal, e.g. „Zeile 23a (5.051,76 €) + Zeile 25 (…)“. */
function describeLstbCalculation(terms: readonly LstbCalculationTerm[]): string {
  if (terms.length === 0) return 'Aus Lohnsteuerbescheinigung extrahierter Wert (§ 9 Abs. 1 EStG).'
  return `Aus Lohnsteuerbescheinigung: ${terms.map((t) => `Zeile ${t.line} (${EURO.format(t.amount)})`).join(' + ')}`
}

/** Thrown on purpose at the end of an effect preview: the transaction must never commit. */
class PreviewRollback extends Error {}

const midpoint = (state: Extract<TaxEstimateStatus, { kind: 'spanne' }>): number => Math.round((state.result.from + state.result.to) / 2)

/** Turns the two estimates of a preview into what the draft card says; honest when there is no figure. */
export function effectFromEstimates(states: { readonly before: TaxEstimateStatus; readonly after: TaxEstimateStatus } | null): AdvisorPreviewEffect {
  if (states === null) return { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
  const { before, after } = states
  if (before.kind === 'spanne' && after.kind === 'spanne') {
    const beforeRefundEur = midpoint(before)
    const afterRefundEur = midpoint(after)
    return { kind: 'computed', beforeRefundEur, afterRefundEur, deltaEur: afterRefundEur - beforeRefundEur }
  }
  if (after.kind === 'spanne') {
    return { kind: 'not-computable', hint: 'Mit dieser Angabe wird die Schätzung erstmals möglich; einen Unterschied zu vorher gibt es deshalb noch nicht.' }
  }
  if (after.kind === 'offen') {
    return { kind: 'not-computable', hint: 'Wirkung erst berechenbar, wenn die Angaben für die Schätzung vollständig sind (z. B. die Lohnsteuerbescheinigung).' }
  }
  return { kind: 'not-computable', hint: 'Für deine Lebenslage gibt es noch keine automatische Schätzung; die Wirkung kann ich deshalb nicht beziffern.' }
}

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger('AdvisorTurn')

  constructor(
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
    @Inject(OwlModeService) private readonly owlModeService: OwlModeService,
    @Inject(ConfirmationService) private readonly confirmationService: ConfirmationService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepo: InterviewAnswerRepository,
    @Optional() @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepo?: WageTaxCertificateRepository,
    @Optional()
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY)
    private readonly chRepo?: CrossBorderSalaryStatementRepository,
    @Optional() @Inject(COMMUTE_REPOSITORY) private readonly commuteRepo?: CommuteRepository,
    @Optional() @Inject(CHILD_REPOSITORY) private readonly childRepo?: ChildRepository,
    @Optional() @Inject(RENTAL_REPOSITORY) private readonly rentalRepo?: RentalRepository,
    @Optional() @Inject(CAPITAL_REPOSITORY) private readonly capitalRepo?: CapitalRepository,
    @Optional() @Inject(PROFILE_REPOSITORY) private readonly profileRepo?: ProfileRepository,
    @Optional() @Inject(ADVISOR_ENGINE) private readonly advisorEngine?: AdvisorEnginePort,
    @Optional() @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig?: AiRuntimeConfigService,
    @Optional() @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner = passThroughTransactionRunner,
    @Optional() @Inject(TaxEstimateService) private readonly taxEstimate?: TaxEstimateService,
    @Optional() @Inject(ModelConnectionService) private readonly modelConnection?: ModelConnectionService,
    @Optional() @Inject(AssessmentService) private readonly assessmentService?: AssessmentService,
  ) {}

  // The service is the front door; each theme lives in its own part.
  private conversationsPart?: AdvisorConversations
  private get conversations(): AdvisorConversations {
    return (this.conversationsPart ??= new AdvisorConversations(this.advisorEngine, this.advisorRepo, this.auditService, (...args) => this.facts.knownNamesForScrubbing(...args)))
  }

  private notesPart?: AdvisorProjectNotes
  private get notes(): AdvisorProjectNotes {
    return (this.notesPart ??= new AdvisorProjectNotes(this.advisorRepo, (...args) => this.facts.knownNamesForScrubbing(...args)))
  }

  private factsPart?: AdvisorCaseFacts
  private get facts(): AdvisorCaseFacts {
    return (this.factsPart ??= new AdvisorCaseFacts(this.capitalRepo, this.chRepo, this.childRepo, this.commuteRepo, this.confirmationService, this.interviewRepo, this.lstbRepo, this.owlModeService, this.profileRepo, this.rentalRepo))
  }

  private draftsPart?: AdvisorDrafts
  private get drafts(): AdvisorDrafts {
    return (this.draftsPart ??= new AdvisorDrafts(this.advisorRepo, this.auditService, this.confirmationService, this.transactions))
  }

  // ── Delegated to the parts ─────────────────────────────────────────────────────────────────

  async conversationFor(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorConversationRecord> {
    return this.conversations.conversationFor(userId, taxYear, conversationId)
  }

  /** Whether the owl can reach its language model right now (#488). */
  async connection(): Promise<AdvisorConnectionDto> {
    return (
      (await this.modelConnection?.check()) ?? { state: 'rules-only', provider: null, model: null, checkedAt: new Date().toISOString() }
    )
  }

  async listConversations(userId: string, taxYear: number): Promise<AdvisorConversationDto[]> {
    return this.conversations.listConversations(userId, taxYear)
  }

  async createConversation(userId: string, taxYear: number): Promise<AdvisorConversationDto> {
    return this.conversations.createConversation(userId, taxYear)
  }

  async renameConversation(userId: string, taxYear: number, conversationId: string, title: string): Promise<AdvisorConversationDto> {
    return this.conversations.renameConversation(userId, taxYear, conversationId, title)
  }

  async deleteConversation(userId: string, taxYear: number, conversationId: string): Promise<{ deletedMessages: number }> {
    return this.conversations.deleteConversation(userId, taxYear, conversationId)
  }

  async summarizeConversation(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorContextDto> {
    return this.conversations.summarizeConversation(userId, taxYear, conversationId)
  }

  async searchConversations(userId: string, taxYear: number, rawQuery: string): Promise<AdvisorSearchHitDto[]> {
    return this.conversations.searchConversations(userId, taxYear, rawQuery)
  }

  async saveSituation(userId: string, taxYear: number, raw: string): Promise<AdvisorSituationDto> {
    return this.notes.saveSituation(userId, taxYear, raw)
  }

  async listNotes(userId: string, taxYear: number): Promise<AdvisorNoteDto[]> {
    return this.notes.listNotes(userId, taxYear)
  }

  async createNote(userId: string, taxYear: number, raw: string): Promise<AdvisorNoteDto> {
    return this.notes.createNote(userId, taxYear, raw)
  }

  async updateNote(userId: string, taxYear: number, noteId: string, raw: string): Promise<AdvisorNoteDto> {
    return this.notes.updateNote(userId, taxYear, noteId, raw)
  }

  async deleteNote(userId: string, taxYear: number, noteId: string): Promise<{ deleted: true }> {
    return this.notes.deleteNote(userId, taxYear, noteId)
  }

  async undoNoteChange(userId: string, taxYear: number, messageId: string, index: number): Promise<AdvisorChatMessageDto> {
    return this.notes.undoNoteChange(userId, taxYear, messageId, index)
  }

  async knownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
    return this.facts.knownNamesForScrubbing(userId, taxYear)
  }

  async loadRecordHandles(userId: string, taxYear: number): Promise<AdvisorRecordHandles> {
    return this.facts.loadRecordHandles(userId, taxYear)
  }

  async buildCaseDigest(userId: string, taxYear: number): Promise<CaseDigest> {
    return this.facts.buildCaseDigest(userId, taxYear)
  }

  /** The tax office's notice against the return, as the assessment check needs it: figures only, nothing that names a person. */
  private async assessmentBrief(userId: string, taxYear: number): Promise<AdvisorAssessmentBrief> {
    const empty: AdvisorAssessmentBrief = { recorded: false, status: 'nicht erfasst', deviations: [], calculationIncomplete: false, appealDaysLeft: null }
    if (!this.assessmentService) return empty
    const state = await this.assessmentService.getState(userId, taxYear).catch(() => null)
    if (state === null || !state.fields.some((field) => field.kind === 'erfasst')) return empty
    return {
      recorded: true,
      status: state.status,
      deviations: state.reconciliation.deviations.map((d) => ({ field: d.field, assessedEur: d.assessment, calculatedEur: d.calculated, differenceEur: d.difference })),
      calculationIncomplete: state.reconciliation.calculationIncomplete,
      appealDaysLeft: state.frist.remainingDays,
    }
  }

  /**
   * Turbo mode: the owl applies what it prepared in this answer. The answer is already saved and
   * complete, so a failed apply only leaves the drafts to the user.
   */
  private async applyTurbo(userId: string, taxYear: number, runId: string, dto: SendAdvisorMessageDto, assistant: AdvisorChatMessageRecord): Promise<AdvisorChatMessageRecord | null> {
    if (!dto.turbo) return null
    return this.drafts.applyPendingOf(userId, taxYear, assistant).catch((error: unknown) => {
      this.logger.warn(`turbo apply for ${runId} failed: ${error instanceof Error ? error.name : 'unknown'}`)
      return null
    })
  }

  async applyAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.drafts.applyAction(userId, taxYear, actionId)
  }

  async applyBatch(userId: string, taxYear: number, dto: ApplyBatchActionsDto): Promise<ApplyBatchActionsResponseDto> {
    return this.drafts.applyBatch(userId, taxYear, dto)
  }

  async undoAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.drafts.undoAction(userId, taxYear, actionId)
  }

  async dismissAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.drafts.dismissAction(userId, taxYear, actionId)
  }

  /**
   * What a draft would do to the refund, by the app's own estimate: once for the stored return,
   * once with the draft's fields written — inside a transaction that is always rolled back, so
   * the preview runs through the very write path „Übernehmen“ uses and leaves nothing behind.
   * Only offered where a real transaction exists; in-memory setups keep the approximation.
   */
  previewEffectFor(userId: string, taxYear: number): ((target: AdvisorPreviewTarget) => Promise<AdvisorPreviewEffect>) | undefined {
    const estimate = this.taxEstimate
    if (!estimate || this.transactions === passThroughTransactionRunner) return undefined
    return async (target) => {
      let states: { before: TaxEstimateStatus; after: TaxEstimateStatus } | null = null
      try {
        await this.transactions.run(async () => {
          const before = await estimate.getState(userId, taxYear)
          for (const [field, value] of target.values) {
            await this.confirmationService.writeConfirmedByAdvisor(userId, taxYear, provenanceKey(target.screen, field, target.instance ?? undefined), value)
          }
          states = { before, after: await estimate.getState(userId, taxYear) }
          throw new PreviewRollback()
        })
      } catch (error) {
        if (!(error instanceof PreviewRollback)) {
          this.logger.warn(`effect preview failed for ${target.screen}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`)
          return { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
        }
      }
      return effectFromEstimates(states)
    }
  }

  // ── Project notes (#481) ──────────────────────────────────────────────────────────────────

  async getSession(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorSessionResponseDto> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const [setting, cardsRes, history, conversations, notes] = await Promise.all([
      this.owlModeService.getSetting(userId),
      this.owlModeService.getCards(userId, taxYear),
      this.advisorRepo.listForConversation(conversation.id, userId),
      this.advisorRepo.listConversations(userId, taxYear),
      this.advisorRepo.listNotes(userId, taxYear),
    ])

    await this.auditService.append({
      userId,
      action: 'READ',
      resource: 'berater_sitzung',
    })

    const allConversations = await this.advisorRepo.listAllConversations(userId)
    const answering = new Set(await this.advisorRepo.answeringConversationIds(userId, new Date(Date.now() - ANSWERING_WINDOW_MS)))
    const openCount = cardsRes.cards.length
    const greeting =
      openCount > 0
        ? `Hallo! Ich habe deine Steuerakte ${taxYear} durchgesehen und ${openCount} konkrete Spar-${openCount === 1 ? 'Chance' : 'Chancen'} vorbereitet. Wollen wir sie kurz gemeinsam klären oder möchtest du eine eigene Frage stellen?`
        : `Hallo! Deine Steuerakte ${taxYear} sieht bereits sehr aufgeräumt aus. Frag mich jederzeit zu Abzügen, Belegen, Paragraphen oder starte die Kanzlei-Endprüfung vor dem Ausdruck.`

    return {
      enabled: setting.enabled,
      greeting,
      openCards: cardsRes.cards,
      conversationId: conversation.id,
      conversations: conversations.map((c) => toConversationDto(c, answering.has(c.id))),
      projects: projectsOf(taxYear, allConversations, answering),
      context: contextOf(conversation, history, await this.knownNamesForScrubbing(userId, taxYear)),
      notes: notes.map(toNoteDto),
      situation: await this.notes.getSituation(userId),
      messages: history.filter((m) => !m.meta?.replaced).map(toMessageDto),
      quickChips: [
        'Kanzlei-Endprüfung starten',
        'Homeoffice vs. Arbeitszimmer prüfen',
        'Fortbildung & Reisekosten klären',
        'Spenden aus dem Vorjahr prüfen',
      ],
      legalSources: Object.values(ADVISOR_LEGAL_SOURCES),
    }
  }

  async sendMessage(
    userId: string,
    taxYear: number,
    dto: SendAdvisorMessageDto,
  ): Promise<SendAdvisorMessageResponseDto> {
    let finalResponse: SendAdvisorMessageResponseDto | null = null
    for await (const event of this.streamMessage(userId, taxYear, dto)) {
      if (event.event === 'error') throw new UnavailableError(event.data.code, event.data.message)
      if (event.event === 'done') {
        finalResponse = event.data as SendAdvisorMessageResponseDto
      }
    }
    if (!finalResponse) {
      throw new InvalidInputError('ADVISOR_EMPTY_TURN', 'Der Berater-Assistent konnte keine Antwort erzeugen.')
    }
    return finalResponse
  }

  /**
   * Everything that can still fail as plain HTTP (quota) and everything the turn needs up front.
   * Both messages exist afterwards: the question, and the answer as `streaming` (#476).
   */
  async prepareTurn(userId: string, taxYear: number, dto: SendAdvisorMessageDto): Promise<PreparedAdvisorTurn> {
    const { dailyMessageLimit } = this.runtimeConfig ? await this.runtimeConfig.resolveLimits() : DEFAULT_AI_TURN_LIMITS
    const startOfDayUtc = new Date()
    startOfDayUtc.setUTCHours(0, 0, 0, 0)
    const todayCount = await this.advisorRepo.countUserMessagesSince(userId, startOfDayUtc)
    if (todayCount >= dailyMessageLimit) {
      throw new TooManyRequestsError(
        'ADVISOR_DAILY_LIMIT_EXCEEDED',
        `Du hast dein Tageskontingent von ${dailyMessageLimit} Nachrichten an die SteuerEule erreicht. Morgen früh steht dir deine Eule wieder frisch zur Verfügung.`,
      )
    }

    // Ensure Eulen-Modus is enabled when user actively chats with the Eule
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    // Double PII Shield: scrub known names, Steuer-IDs, IBANs, emails, and phones from user free-text & history
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const scrubbedUserText = scrubUserMessagePii(dto.message.trim(), knownNames)
    const conversation = await this.conversationFor(userId, taxYear, dto.conversationId)
    // Conversations answer side by side (#503), but one conversation has one answer at a time:
    // two would write into the same history in an order nobody chose.
    if ((await this.advisorRepo.answeringConversationIds(userId, new Date(Date.now() - ANSWERING_WINDOW_MS))).includes(conversation.id)) {
      throw new ConflictError('ADVISOR_CONVERSATION_BUSY', 'In diesem Gespräch schreibt die Eule gerade schon an einer Antwort. Warte kurz oder stoppe sie.')
    }
    if (dto.replaceFromMessageId !== undefined) {
      await this.replaceLatestTurn(userId, conversation.id, dto.replaceFromMessageId)
    }
    // The model sees this conversation only; what the conversations share is the return itself.
    const priorRecords = liveMessages(conversation, await this.advisorRepo.listForConversation(conversation.id, userId))
    const sources = historySources(priorRecords, knownNames)
    // A full context is summarised before the answer, once the stream is open (see executeTurn).
    const needsSummary = advisorContextUsage(sources, conversation.summary).level === 'full'
    await this.advisorRepo.updateConversation(conversation.id, userId, {
      lastUsedAt: new Date(),
      // The first question names the conversation.
      ...(conversation.title === null ? { title: titleFrom(scrubbedUserText) } : {}),
    })
    const history = buildAdvisorHistory(sources, { summary: conversation.summary })

    const runId = randomUUID()
    const userMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      conversationId: conversation.id,
      role: 'user',
      content: scrubbedUserText,
      meta: null,
    })
    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      meta: null,
      status: 'streaming',
      runId,
    })

    return { runId, userMessage, assistantMessageId: assistantMessage.id, scrubbedUserText, history, dto, conversationId: conversation.id, needsSummary }
  }

  async *streamMessage(
    userId: string,
    taxYear: number,
    dto: SendAdvisorMessageDto,
    signal?: AbortSignal,
  ): AsyncIterable<AdvisorStreamEvent> {
    // The quota is checked before the stream opens, so a 429 still reaches the client as plain HTTP.
    const turn = await this.prepareTurn(userId, taxYear, dto)
    yield* this.executeTurn(userId, taxYear, turn, signal)
  }

  /**
   * Runs a prepared turn to one of its final states. Whatever happens (stop, timeout, a thrown
   * error, a consumer that walks away), the answer never stays `streaming`.
   */
  async *executeTurn(
    userId: string,
    taxYear: number,
    turn: PreparedAdvisorTurn,
    signal?: AbortSignal,
  ): AsyncIterable<AdvisorStreamEvent> {
    const startedAt = Date.now()
    const { runId, userMessage, assistantMessageId, scrubbedUserText, dto } = turn
    let text = ''
    let reasoning = ''
    let steps: readonly AdvisorThoughtStep[] = []
    let firstTokenMs: number | null = null
    let finished = false

    const finish = async (
      status: FinishAdvisorMessageInput['status'],
      content: string,
      meta: AdvisorMessageMeta,
      usage?: AdvisorTurnUsage,
    ): Promise<AdvisorChatMessageRecord> => {
      finished = true
      const fullMeta: AdvisorMessageMeta = { ...meta, ...(steps.length > 0 ? { thoughtSteps: steps } : {}) }
      const usageRecord: AdvisorMessageUsage = { ...usage, traceId: runId, firstTokenMs, durationMs: Date.now() - startedAt }
      const record = await this.advisorRepo.finishMessage(assistantMessageId, userId, {
        content,
        meta: Object.keys(fullMeta).length > 0 ? fullMeta : null,
        status,
        reasoning: reasoning.length > 0 ? reasoning : null,
        usage: usageRecord,
      })
      this.logger.log(
        JSON.stringify({
          msg: 'advisor_turn',
          traceId: runId,
          status,
          engine: meta.engine?.mode ?? null,
          provider: meta.engine?.provider ?? null,
          model: meta.engine?.model ?? null,
          firstTokenMs,
          durationMs: usageRecord.durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          cachedInputTokens: usage?.cachedInputTokens ?? null,
        }),
      )
      return record
    }

    const doneWith = (assistant: AdvisorChatMessageRecord, mode: SendAdvisorMessageResponseDto['mode']): AdvisorStreamEvent => ({
      event: 'done',
      data: {
        userMessage: toMessageDto(userMessage),
        assistantMessage: toMessageDto(assistant),
        mode,
      } satisfies SendAdvisorMessageResponseDto,
    })

    try {
      yield { event: 'start', data: { runId, userMessage: toMessageDto(userMessage), assistantMessageId } }

      let history = turn.history
      if (turn.needsSummary) {
        const status: AdvisorStreamEvent = { event: 'status', data: { text: 'Die Eule fasst den älteren Verlauf zusammen …' } }
        steps = foldThoughtEvent(steps, status)
        yield status
        history = await this.conversations.summarizeForTurn(userId, taxYear, turn, signal)
      }

      // Build PII-free CaseDigest & stream Zero-Write advisor turn via LangGraph engine (with deterministic fallback)
      const digest = await this.buildCaseDigest(userId, taxYear)
      const actionIdFactory = newActionId

      if (!this.advisorEngine) {
        const fallback = evaluateAdvisorTurn({
          message: scrubbedUserText,
          activeScreen: dto.activeScreen,
          digest,
          actionIdFactory,
        })

        const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, fallback.meta)
        await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

        const status: AdvisorStreamEvent = { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }
        steps = foldThoughtEvent(steps, status)
        yield status
        firstTokenMs = Date.now() - startedAt
        yield { event: 'token', data: { text: fallback.replyText } }
        if (enrichedMeta.choices && enrichedMeta.choices.length > 0) {
          yield { event: 'choices', data: { choices: enrichedMeta.choices } }
        }
        if (enrichedMeta.action) {
          yield { event: 'action', data: toPublicAction(enrichedMeta.action) }
        }
        if (enrichedMeta.twoPaths) {
          yield { event: 'twoPaths', data: toPublicMeta({ twoPaths: enrichedMeta.twoPaths }).twoPaths! }
        }
        const assistant = await finish('complete', fallback.replyText, { ...enrichedMeta, engine: DETERMINISTIC_ENGINE })
        yield doneWith((await this.applyTurbo(userId, taxYear, runId, dto, assistant)) ?? assistant, 'deterministic_fallback')
        return
      }

      const task = dto.quickAction === 'savings_plan' ? ('savings-plan' as const) : dto.quickAction === 'assessment_check' ? ('assessment-check' as const) : undefined
      for await (const ev of this.advisorEngine.streamTurn({
        message: scrubbedUserText,
        activeScreen: dto.activeScreen,
        digest,
        history,
        actionIdFactory,
        signal,
        // Every quick start is work in several steps: the plan shows the user what the owl is doing.
        planRequired: dto.quickAction !== undefined,
        ...(task ? { task } : {}),
        situation: (await this.notes.getSituation(userId)).text,
        ...(task === 'assessment-check' ? { assessment: await this.assessmentBrief(userId, taxYear) } : {}),
        ...(dto.skill ? { skill: dto.skill } : {}),
        records: await this.loadRecordHandles(userId, taxYear),
        previewEffect: this.previewEffectFor(userId, taxYear),
        notes: buildNoteHandles(await this.advisorRepo.listNotes(userId, taxYear)),
      })) {
        if (ev.event === 'token') {
          firstTokenMs ??= Date.now() - startedAt
          text += ev.data.text
        } else if (ev.event === 'reasoning') {
          reasoning += ev.data.text
        } else {
          steps = foldThoughtEvent(steps, ev)
        }

        if (ev.event === 'action') {
          const enriched = await this.drafts.enrichSingleDraft(userId, taxYear, ev.data)
          yield { event: 'action', data: toPublicAction(enriched) }
          continue
        }

        if (ev.event === 'twoPaths') {
          const [safePath, maxPath] = await Promise.all([
            this.drafts.enrichSingleDraft(userId, taxYear, ev.data.safePath),
            this.drafts.enrichSingleDraft(userId, taxYear, ev.data.maxPath),
          ])
          yield {
            event: 'twoPaths',
            data: {
              ...ev.data,
              safePath: toPublicAction(safePath),
              maxPath: toPublicAction({ ...maxPath, evidenceHint: ev.data.maxPath.evidenceHint }),
            },
          }
          continue
        }

        if (ev.event === 'error') {
          this.modelConnection?.recordTurn(ev.data.failure ?? null)
          // Half an answer is kept for the record, but never as if it were complete.
          await finish('failed', text, ev.data.failure ? { modelFailure: ev.data.failure } : {})
          yield ev
          return
        }

        if (ev.event === 'done') {
          const turnResult = ev.data as AdvisorTurnResult
          // What the model did this turn is the best news about the connection there is.
          if (turnResult.mode === 'langgraph' || turnResult.meta.modelFailure) this.modelConnection?.recordTurn(turnResult.primaryFailure ?? turnResult.meta.modelFailure ?? null)
          const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, turnResult.meta)
          await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

          const engine: AdvisorEngineInfo = {
            mode: turnResult.mode,
            ...(turnResult.provider !== undefined ? { provider: turnResult.provider } : {}),
            ...(turnResult.model !== undefined ? { model: turnResult.model } : {}),
          }
          if (reasoning.length === 0 && turnResult.reasoning) reasoning = turnResult.reasoning
          const noteChanges = await this.notes.applyNoteChanges(userId, taxYear, enrichedMeta.noteChanges)
          const { noteChanges: _asProposed, ...metaWithoutNotes } = enrichedMeta
          const assistant = await finish(
            'complete',
            turnResult.replyText,
            { ...metaWithoutNotes, ...(noteChanges.length > 0 ? { noteChanges } : {}), engine },
            turnResult.usage,
          )
          const turbo = await this.applyTurbo(userId, taxYear, runId, dto, assistant)
          yield doneWith(turbo ?? assistant, turnResult.mode)
          return
        }

        yield ev
      }

      // The engine ended without a verdict: a stop keeps the partial text, anything else is a failure.
      if (signal?.aborted) {
        const assistant = await finish('aborted', text, {})
        yield doneWith(assistant, 'langgraph')
        return
      }
      await finish('failed', text, {})
      yield { event: 'error', data: { code: 'ADVISOR_TURN_FAILED', message: TURN_FAILED_MESSAGE } }
    } catch (error) {
      if (finished) throw error
      // The client only hears "broke off"; operations need the reason, without any message content.
      if (!signal?.aborted) {
        this.logger.error(`advisor turn ${runId} failed: ${error instanceof Error ? `${error.name}: ${error.message.slice(0, 400)}` : String(error).slice(0, 400)}`)
      }
      await finish(signal?.aborted ? 'aborted' : 'failed', text, {})
      yield {
        event: 'error',
        data:
          error instanceof DomainError
            ? { code: error.code, message: error.message }
            : { code: 'ADVISOR_TURN_FAILED', message: TURN_FAILED_MESSAGE },
      }
    } finally {
      // The consumer stopped reading (connection gone, loop left): nothing may stay `streaming`.
      if (!finished) await finish('aborted', text, {}).catch(() => {})
    }
  }

  async setFeedback(
    userId: string,
    taxYear: number,
    messageId: string,
    dto: { readonly rating: AdvisorFeedbackRating | null; readonly reason?: AdvisorFeedbackReason | undefined },
  ): Promise<AdvisorChatMessageDto> {
    const message = await this.advisorRepo.findMessage(messageId, userId)
    if (!message || message.taxYear !== taxYear) {
      throw new NotFoundError('ADVISOR_MESSAGE_NOT_FOUND', 'Diese Nachricht gibt es nicht (mehr).')
    }
    if (message.role !== 'assistant' || message.status === 'streaming') {
      throw new InvalidInputError('ADVISOR_FEEDBACK_NOT_RATEABLE', 'Bewerten lassen sich nur fertige Antworten der Eule.')
    }
    const feedback: AdvisorMessageFeedback | null =
      dto.rating === null
        ? null
        : { rating: dto.rating, ...(dto.rating === 'down' && dto.reason !== undefined ? { reason: dto.reason } : {}) }
    const updated = await this.advisorRepo.setFeedback(messageId, userId, feedback)
    if (!updated) throw new NotFoundError('ADVISOR_MESSAGE_NOT_FOUND', 'Diese Nachricht gibt es nicht (mehr).')
    return toMessageDto(updated)
  }

  /**
   * Empties one conversation and keeps it. Values already applied to the return stay; proposals
   * that were still open disappear with the messages that carried them.
   */
  async clearConversation(userId: string, taxYear: number, conversationId?: string): Promise<{ deletedMessages: number }> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const deletedMessages = await this.advisorRepo.deleteMessagesOfConversation(conversation.id, userId)
    await this.advisorRepo.updateConversation(conversation.id, userId, { title: null, summary: null, summaryUntil: null })
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_verlauf_geloescht' })
    return { deletedMessages }
  }

  /**
   * Regenerate / edit-and-resend (#451 slice 1b): the latest user message and everything after it
   * leave the chat. Proposals still pending there are dismissed so they can never be applied;
   * applied ones stay applied (their undo still works from the cockpit history).
   */
  private async replaceLatestTurn(userId: string, conversationId: string, userMessageId: string): Promise<void> {
    const visible = (await this.advisorRepo.listForConversation(conversationId, userId)).filter((m) => !m.meta?.replaced)
    const lastUserIndex = visible.map((m) => m.role).lastIndexOf('user')
    if (lastUserIndex === -1 || visible[lastUserIndex]!.id !== userMessageId) {
      throw new InvalidInputError('ADVISOR_REPLACE_NOT_LATEST', 'Nur die letzte Frage lässt sich neu stellen oder bearbeiten.')
    }
    const dismiss = <A extends AdvisorActionProposal>(a: A): A => (a.status === 'pending' ? { ...a, status: 'dismissed' } : a)
    await this.transactions.run(async () => {
      for (const record of visible.slice(lastUserIndex)) {
        const meta = record.meta ?? {}
        await this.advisorRepo.updateMessageMeta(record.id, userId, {
          ...meta,
          ...(meta.action ? { action: dismiss(meta.action) } : {}),
          ...(meta.actions ? { actions: meta.actions.map(dismiss) } : {}),
          ...(meta.twoPaths ? { twoPaths: { ...meta.twoPaths, safePath: dismiss(meta.twoPaths.safePath), maxPath: dismiss(meta.twoPaths.maxPath) } } : {}),
          replaced: true,
        })
      }
    })
  }

  async stageReceiptProposal(
    userId: string,
    taxYear: number,
    input: {
      readonly screen: Screen
      readonly field: string
      readonly newValue: string
      readonly companionFields?: Readonly<Record<string, string>> | undefined
      readonly label: string
      readonly reason: string
      readonly sourceId: OwlSourceId
      readonly summaryText: string
      readonly engine: AdvisorEngineInfo
      /** The stored Beleg this proposal was read from: applying it records `{ kind: 'beleg' }` provenance. */
      readonly receiptId?: string | null | undefined
    },
  ): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    assertAiWritable(input.screen, input.field)
    for (const companionField of Object.keys(input.companionFields ?? {})) assertAiWritable(input.screen, companionField)
    checkPiiFree(input)

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const digest = await this.buildCaseDigest(userId, taxYear)
    const sim = simulateAdvisorFieldDelta(digest, input.screen, input.field, input.newValue)

    const draft: AdvisorActionProposal = {
      actionId: newActionId(),
      status: 'pending',
      screen: input.screen,
      field: input.field,
      instance: null,
      ...(input.companionFields ? { companionFields: input.companionFields } : {}),
      label: input.label,
      previousValue: sim.previousValue,
      expectedPreviousValue: sim.previousValue,
      newValue: input.newValue,
      beforeRefundEur: sim.beforeRefundEur,
      afterRefundEur: sim.afterRefundEur,
      deltaEur: sim.deltaEur,
      reason: input.reason,
      sourceId: input.sourceId,
      paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
      ...(input.receiptId ? { receiptId: input.receiptId } : {}),
    }

    const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, {
      sources: [input.sourceId],
      action: draft,
    })

    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      action: toPublicAction(enrichedMeta.action!),
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  async stageLstbScanBatch(
    userId: string,
    taxYear: number,
    input: {
      readonly digestUserId?: string | undefined
      readonly receiptId: string | null
      readonly stage: 'deterministic' | 'llm_text_fallback'
      readonly taxYearOnDocument: number | null
      readonly person?: 'A' | 'B' | undefined
      readonly engine: AdvisorEngineInfo
      readonly summaryText: string
      readonly fields: ReadonlyArray<{
        readonly field: WageTaxCertificateFieldId
        readonly label: string
        readonly extracted: LstbExtractedField
      }>
    },
  ): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    for (const item of input.fields) {
      assertAiWritable('lstb', item.field)
    }

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const digest = await this.buildCaseDigest(input.digestUserId ?? userId, taxYear)
    const rawActions: AdvisorActionProposal[] = input.fields.map((item) => {
      const valueStr = item.extracted.value !== null ? String(item.extracted.value) : ''
      const sim =
        item.extracted.value !== null
          ? simulateAdvisorFieldDelta(digest, 'lstb', item.field, valueStr)
          : { previousValue: null, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 }

      return {
        actionId: newActionId(),
        status: 'pending',
        screen: 'lstb',
        field: item.field,
        instance: null,
        label: item.label,
        previousValue: sim.previousValue,
        expectedPreviousValue: sim.previousValue,
        newValue: valueStr,
        beforeRefundEur: sim.beforeRefundEur,
        afterRefundEur: sim.afterRefundEur,
        deltaEur: sim.deltaEur,
        reason: describeLstbCalculation(item.extracted.calculation),
        sourceId: 'estg-9-1',
        paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1'].paragraph,
        ...(input.receiptId ? { receiptId: input.receiptId } : {}),
        confidenceStatus: item.extracted.status,
        sourceLines: item.extracted.sourceLines,
        calculation: item.extracted.calculation,
        fieldReason: item.extracted.reason,
      }
    })

    const initialMeta: AdvisorMessageMeta = {
      sources: ['estg-9-1'],
      actions: rawActions,
      lstbScan: {
        receiptId: input.receiptId,
        stage: input.stage,
        taxYearOnDocument: input.taxYearOnDocument,
        ...(input.person !== undefined ? { person: input.person } : {}),
        actionIds: rawActions.map((a) => a.actionId),
      },
    }

    const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, initialMeta)
    checkPiiFree(enrichedMeta)
    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      actions: (enrichedMeta.actions ?? []).map((a) => toPublicAction(a)),
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  async markLstbActionsApplied(userId: string, taxYear: number, actionIds: readonly string[]): Promise<void> {
    if (actionIds.length === 0) return
    const targetIds = new Set(actionIds)
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    const appliedAt = new Date().toISOString()

    for (const msg of history) {
      if (!msg.meta?.actions) continue
      let changed = false
      const nextActions = msg.meta.actions.map((a) => {
        if (targetIds.has(a.actionId) && a.status === 'pending') {
          changed = true
          return { ...a, status: 'applied' as const, appliedAt }
        }
        return a
      })
      if (changed) {
        await this.advisorRepo.updateMessageMeta(msg.id, userId, { ...msg.meta, actions: nextActions })
      }
    }
  }

}
