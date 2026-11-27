import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Optional, Logger } from '@nestjs/common'
import { ModelCallTiers } from './model-call-tier.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import {
  PERSON_B_HANDLE,
  advisorContextUsage,
  applyInterviewChanges,
  buildAdvisorHistory,
  buildNoteHandles,
  carriedPlan,
  evaluateAdvisorTurn,
  foldThoughtEvent,
  draftCountNote,
  heldDraftsNote,
  holdUnaskedOverwrites,
  isOfferedChoice,
  latestPlan,
  needsPersonalDataConsentOffer,
  openPlanNote,
  openPlanSteps,
  preparedDraftsSentence,
  replaceNamesWith,
  scrubUserMessagePii,
  unchangedDraftsNote,
  withoutInternalNames,
  metaWithoutInternalNames,
  withPreviewedEffects,
  type AdvisorActionProposal,
  type AdvisorAssessmentBrief,
  type AdvisorEngineInfo,
  type AdvisorEnginePort,
  type AdvisorMessageMeta,
  type AdvisorModelFailure,
  type AdvisorPlanMeta,
  type AdvisorPlanStep,
  type AdvisorStreamEvent,
  type AdvisorThoughtStep,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type AdvisorTurnTimings,
  type AdvisorTurnUsage,
} from '@steuereule/core'
import { AssessmentService } from '../assessment/assessment.service.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { newActionId } from '../common/action-id.js'
import { ConflictError, DomainError, InvalidInputError, TooManyRequestsError, UnavailableError } from '../common/domain-error.js'
import { ADVISOR_ENGINE } from '../ki/advisor-engine.token.js'
import { AI_RUNTIME_CONFIG_SERVICE, type AiRuntimeConfigService } from '../ki/ai-runtime-config.service.js'
import { PersonalDataConsentService } from '../owl-mode/personal-data-consent.service.js'
import { ModelConnectionService } from '../ki/model-connection.service.js'
import { LinkService } from '../link/link.service.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../common/transaction-runner.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorChatMessageRecord,
  type AdvisorMessageUsage,
  type AdvisorRepository,
  type FinishAdvisorMessageInput,
} from './advisor.repository.js'
import { AdvisorCaseDigest } from './advisor-case-digest.js'
import { AdvisorConversations } from './advisor-conversations.js'
import { AdvisorDrafts } from './advisor-drafts.js'
import { AdvisorOpening, OPENING_PLACEHOLDER, openingStream } from './advisor-opening.js'
import { draftsTakenOver, printoutFollowUp } from './advisor-printout-plan.js'
import { AdvisorProjectNotes } from './advisor-project-notes.js'
import { ANSWERING_WINDOW_MS, historySources, liveMessages, parseChatModel, titleFrom, toMessageDto, toPublicAction, toPublicMeta, type PreparedAdvisorTurn } from './advisor-shared.js'
import type { SendAdvisorMessageDto, SendAdvisorMessageResponseDto } from './dto/advisor.dto.js'

const DETERMINISTIC_ENGINE: AdvisorEngineInfo = { mode: 'deterministic_fallback', provider: 'deterministic' }

const TURN_FAILED_MESSAGE = 'Die Antwort der Eule ist unterwegs abgebrochen. Bitte versuche es erneut.'

/**
 * One turn of the owl: prepared while it can still fail as plain HTTP, then run to one of its final
 * states, with the usage record written when it ends.
 */
@Injectable()
export class AdvisorTurn {
  private readonly logger = new Logger('AdvisorTurn')

  constructor(
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
    @Inject(OwlModeService) private readonly owlModeService: OwlModeService,
    @Inject(AdvisorCaseDigest) private readonly caseDigest: AdvisorCaseDigest,
    @Inject(AdvisorConversations) private readonly conversations: AdvisorConversations,
    @Inject(AdvisorProjectNotes) private readonly notes: AdvisorProjectNotes,
    @Inject(AdvisorOpening) private readonly opening: AdvisorOpening,
    @Inject(AdvisorDrafts) private readonly drafts: AdvisorDrafts,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    /** The consent to personal data for the owl (ADR-0091); read fresh on every use. */
    @Inject(PersonalDataConsentService) private readonly personalDataConsent: PersonalDataConsentService,
    /** Null only where the fixed rules answer alone; AdvisorModule always binds a model engine. */
    @Inject(ADVISOR_ENGINE) private readonly advisorEngine: AdvisorEnginePort | null,
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Inject(ModelConnectionService) private readonly modelConnection: ModelConnectionService,
    @Inject(AssessmentService) private readonly assessmentService: AssessmentService,
    @Inject(LinkService) private readonly link: LinkService,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepo: ProfileRepository,
    @Inject(CHILD_REPOSITORY) private readonly childRepo: ChildRepository,
    /** Absent in tests that build the turn without it: every call is then a free one (H2-40). */
    @Optional() @Inject(ModelCallTiers) private readonly callTiers?: ModelCallTiers,
    /** The shared counters (ADR-0109 §1); absent in tests: a summary then only checks the message cap. */
    @Optional() @Inject(BETTER_AUTH_BUNDLE) private readonly shared?: Pick<BetterAuthBundle, 'rateLimitStorage'>,
  ) {}

  /** The user's messages to the owl today against the daily cap; throws once it is reached. */
  private async remainingToday(userId: string): Promise<{ readonly limit: number; readonly remaining: number }> {
    const { dailyMessageLimit } = await this.runtimeConfig.resolveLimits()
    const startOfDayUtc = new Date()
    startOfDayUtc.setUTCHours(0, 0, 0, 0)
    const todayCount = await this.advisorRepo.countUserMessagesSince(userId, startOfDayUtc)
    if (todayCount >= dailyMessageLimit) {
      throw new TooManyRequestsError(
        'ADVISOR_DAILY_LIMIT_EXCEEDED',
        `Du hast dein Tageskontingent von ${dailyMessageLimit} Nachrichten an die SteuerEule erreicht. Morgen früh steht dir deine Eule wieder frisch zur Verfügung.`,
      )
    }
    return { limit: dailyMessageLimit, remaining: dailyMessageLimit - todayCount }
  }

  /**
   * „Jetzt zusammenfassen“ asks the model too (H2-12): it is refused once the day's messages are used up, and
   * each summary takes one of the messages still left today, counted on the shared storage.
   */
  async takeSummaryAllowance(userId: string): Promise<void> {
    const { limit, remaining } = await this.remainingToday(userId)
    if (!this.shared) return
    const day = new Date().toISOString().slice(0, 10)
    const decision = await this.shared.rateLimitStorage.consume(`advisor-summaries:${day}:${userId}`, { window: 24 * 60 * 60, max: remaining })
    if (!decision.allowed) {
      throw new TooManyRequestsError(
        'ADVISOR_DAILY_LIMIT_EXCEEDED',
        `Du hast dein Tageskontingent von ${limit} Nachrichten an die SteuerEule erreicht. Morgen früh steht dir deine Eule wieder frisch zur Verfügung.`,
      )
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
    await this.remainingToday(userId)

    // Ensure Eulen-Modus is enabled when user actively chats with the Eule
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    // Double PII Shield: scrub known names, Steuer-IDs, IBANs, emails, and phones from user free-text & history.
    // With the user's consent to personal data nothing is masked (ADR-0091); it is read fresh, so a revocation counts at once.
    const consent = await this.personalDataConsent.hasConsent(userId)
    const knownNames = consent ? [] : await this.caseDigest.knownNamesForScrubbing(userId, taxYear)
    const isOpening = dto.quickAction === 'opening'
    // The spouse's name becomes the handle the owl drafts for („Person B“), not an anonymous stand-in.
    const spouse = isOpening ? null : await this.link.spouseForAdvisor(userId, taxYear)
    // A last name the couple shares stays a stand-in: it would turn the user into „Person B“ too.
    const ownProfile = isOpening ? null : await this.profileRepo.findByUserId(userId)
    const spouseNames = consent ? [] : [spouse?.firstName, spouse?.lastName !== ownProfile?.lastName ? spouse?.lastName : null].filter((name): name is string => !!name)
    const maskedText = isOpening ? OPENING_PLACEHOLDER : scrubUserMessagePii(replaceNamesWith(dto.message.trim(), spouseNames, PERSON_B_HANDLE), knownNames)
    const scrubbedUserText = consent && !isOpening ? dto.message.trim() : maskedText
    // What the masking took out tells the owl's answer to offer the consent (ADR-0091); a spouse name turned into „Person B“ does not.
    const maskedPersonalData = !consent && !isOpening && scrubUserMessagePii(dto.message.trim(), knownNames) !== dto.message.trim()
    const conversation = await this.conversations.conversationFor(userId, taxYear, dto.conversationId)
    // Conversations answer side by side (#503), but one conversation has one answer at a time:
    // two would write into the same history in an order nobody chose.
    if ((await this.advisorRepo.answeringConversationIds(userId, new Date(Date.now() - ANSWERING_WINDOW_MS))).includes(conversation.id)) {
      throw new ConflictError('ADVISOR_CONVERSATION_BUSY', 'In diesem Gespräch schreibt die Eule gerade schon an einer Antwort. Warte kurz oder stoppe sie.')
    }
    if (dto.replaceFromMessageId !== undefined) {
      await this.replaceLatestTurn(userId, conversation.id, dto.replaceFromMessageId)
    }
    // The model sees this conversation only; what the conversations share is the return itself.
    const conversationRecords = await this.advisorRepo.listForConversation(conversation.id, userId)
    const priorRecords = liveMessages(conversation, conversationRecords)
    // Read over the whole conversation: a plan made before the history was summarised is still open.
    const previousPlan = latestPlan(conversationRecords.filter((record) => !record.meta?.replaced))
    const opening = isOpening ? await this.prepareOpening(userId, taxYear, priorRecords.length) : undefined
    const lastAnswer = priorRecords.filter((record) => record.role === 'assistant').at(-1)
    const fromApp = isOpening || isOfferedChoice(dto.message, lastAnswer?.meta)
    const sources = historySources(priorRecords, knownNames, spouseNames, consent)
    // A full context is summarised before the answer, once the stream is open (see executeTurn).
    const needsSummary = advisorContextUsage(sources, conversation.summary).level === 'full'
    await this.advisorRepo.updateConversation(conversation.id, userId, {
      lastUsedAt: new Date(),
      // The first question names the conversation; an opening names it after what it is.
      ...(conversation.title === null ? { title: isOpening ? `Einschätzung ${taxYear}` : titleFrom(scrubbedUserText) } : {}),
    })
    const history = buildAdvisorHistory(sources, { summary: conversation.summary })

    const runId = randomUUID()
    const userMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      conversationId: conversation.id,
      role: 'user',
      // Stored and shown as the user wrote it (encrypted at rest); the model reads the history masked again
      // on every read while the consent is missing (`historySources`). Real-data run: „[MANDANT]“ in the user's own text.
      content: isOpening ? scrubbedUserText : dto.message.trim(),
      meta: opening ? { opening: opening.marker } : null,
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

    // Whether the owl's last drafts were just taken over, and which printout gaps it asked then (ADR-0091, Nachtrag).
    const previousAnswer = lastAnswer ? { draftsApplied: draftsTakenOver(lastAnswer.meta), ...(lastAnswer.meta?.printoutGapsAsked ? { printoutGapsAsked: lastAnswer.meta.printoutGapsAsked } : {}) } : undefined
    const chatChoice = parseChatModel(conversation.chatModel)
    return { runId, userMessage, assistantMessageId: assistantMessage.id, scrubbedUserText, history, dto, conversationId: conversation.id, ...(chatChoice ? { chatChoice } : {}), needsSummary, fromApp, personalDataConsent: consent, maskedPersonalData, ...(previousAnswer ? { previousAnswer } : {}), ...(previousPlan ? { previousPlan } : {}), ...(opening ? { opening } : {}) }
  }

  /** An opening needs something to talk about and an empty conversation. */
  private async prepareOpening(userId: string, taxYear: number, priorMessages: number): Promise<NonNullable<PreparedAdvisorTurn['opening']>> {
    if (priorMessages > 0) throw new InvalidInputError('ADVISOR_OPENING_NOT_EMPTY', 'Die Eule eröffnet nur ein neues, leeres Gespräch.')
    const context = await this.opening.context(userId, taxYear)
    if (context.stage === 'empty') throw new InvalidInputError('ADVISOR_OPENING_NOTHING_KNOWN', 'Für dieses Steuerjahr ist noch nichts erfasst. Beginne mit dem Interview.')
    return { marker: { fingerprint: context.fingerprint, stage: context.stage }, context }
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
    // The last `plan_steps` list of this turn, taken from the stream so every engine is covered.
    let turnPlan: readonly AdvisorPlanStep[] | null = null
    let firstTokenMs: number | null = null
    let finished = false

    const finish = async (
      status: FinishAdvisorMessageInput['status'],
      content: string,
      meta: AdvisorMessageMeta,
      usage?: AdvisorTurnUsage,
      timings?: AdvisorTurnTimings,
    ): Promise<AdvisorChatMessageRecord> => {
      finished = true
      const fullMeta: AdvisorMessageMeta = { ...meta, ...(steps.length > 0 ? { thoughtSteps: steps } : {}) }
      const usageRecord: AdvisorMessageUsage = {
        ...usage,
        ...timings,
        traceId: runId,
        firstTokenMs,
        durationMs: Date.now() - startedAt,
        // Which model answered and how deep: what the cost factors of the model picker are measured from (ADR-0096).
        ...(meta.engine?.provider ? { provider: meta.engine.provider } : {}),
        ...(meta.engine?.model ? { model: meta.engine.model } : {}),
        depth: dto.depth ?? 'gruendlich',
      }
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
          topicVerdict: meta.engine?.topic?.verdict ?? null,
          topicCategory: meta.engine?.topic && 'category' in meta.engine.topic ? meta.engine.topic.category : null,
          topicUnavailable: meta.engine?.topic && 'reason' in meta.engine.topic ? meta.engine.topic.reason : null,
          firstTokenMs,
          durationMs: usageRecord.durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          cachedInputTokens: usage?.cachedInputTokens ?? null,
          cacheWriteInputTokens: usage?.cacheWriteInputTokens ?? null,
          prepMs: timings?.prepMs ?? null,
          guardMs: timings?.guardMs ?? null,
          roundMs: timings?.roundMs ?? null,
          toolMs: timings?.toolMs ?? null,
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
      const digest = await this.caseDigest.buildCaseDigest(userId, taxYear)
      const actionIdFactory = newActionId

      if (!this.advisorEngine) {
        const fallback = evaluateAdvisorTurn({
          message: scrubbedUserText,
          activeScreen: dto.activeScreen,
          digest,
          actionIdFactory,
        })

        // The rules' drafts name the effect the real estimate computes, or none (K3).
        const previewed = await withPreviewedEffects(fallback.meta, this.caseDigest.previewEffectFor(userId, taxYear))
        const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, previewed)
        await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

        const status: AdvisorStreamEvent = { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }
        steps = foldThoughtEvent(steps, status)
        yield status
        firstTokenMs = Date.now() - startedAt
        const rulesFollowUp = turn.opening
          ? { text: '', meta: {} }
          : printoutFollowUp({
              plan: digest.furtherFacts?.printoutPlan,
              message: scrubbedUserText,
              reply: fallback.replyText,
              meta: enrichedMeta,
              records: await this.caseDigest.loadRecordHandles(userId, taxYear),
              previous: turn.previousAnswer,
              subjectLabels: await this.childLabels(userId, taxYear, turn.personalDataConsent === true),
            })
        const replyText = fallback.replyText + rulesFollowUp.text
        yield { event: 'token', data: { text: replyText } }
        if (enrichedMeta.choices && enrichedMeta.choices.length > 0) {
          yield { event: 'choices', data: { choices: enrichedMeta.choices } }
        }
        if (enrichedMeta.action) {
          yield { event: 'action', data: toPublicAction(enrichedMeta.action) }
        }
        if (enrichedMeta.twoPaths) {
          yield { event: 'twoPaths', data: toPublicMeta({ twoPaths: enrichedMeta.twoPaths }).twoPaths! }
        }
        const rulesOfferConsent = await this.offersConsentCard(userId, taxYear, turn, replyText, false)
        const assistant = await finish('complete', replyText, { ...enrichedMeta, ...rulesFollowUp.meta, ...(rulesOfferConsent ? { personalDataConsentRequest: true as const } : {}), engine: DETERMINISTIC_ENGINE })
        yield doneWith((await this.applyTurbo(userId, taxYear, runId, dto, assistant)) ?? assistant, 'deterministic_fallback')
        return
      }

      const task = dto.quickAction === 'savings_plan' ? ('savings-plan' as const) : dto.quickAction === 'assessment_check' ? ('assessment-check' as const) : undefined
      const request: AdvisorTurnRequest = {
        message: scrubbedUserText,
        callTier: (await this.callTiers?.tierOf(userId, taxYear)) ?? 'free',
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
        ...(dto.skill === 'berater-interview' ? { interview: await this.advisorRepo.findInterview(userId, taxYear) } : {}),
        topicCheck: turn.fromApp ? 'skip' : 'check',
        personalDataConsent: turn.personalDataConsent === true,
        records: await this.caseDigest.loadRecordHandles(userId, taxYear),
        household: await this.caseDigest.advisorHousehold(userId, taxYear),
        previewEffect: this.caseDigest.previewEffectFor(userId, taxYear),
        readEstimate: this.caseDigest.estimateReaderFor(userId, taxYear),
        notes: buildNoteHandles(await this.advisorRepo.listNotes(userId, taxYear)),
        ...(turn.chatChoice ? { chatChoice: turn.chatChoice } : {}),
        ...(dto.depth ? { depth: dto.depth } : {}),
        ...(openPlanSteps(turn.previousPlan).length > 0 ? { openPlan: openPlanSteps(turn.previousPlan) } : {}),
      }
      const prepMs = Date.now() - startedAt
      const events = turn.opening
        ? openingStream(this.advisorEngine, request, await this.opening.brief(userId, taxYear, turn.opening.context))
        : this.advisorEngine.streamTurn(request)
      for await (const ev of events) {
        if (ev.event === 'token') {
          firstTokenMs ??= Date.now() - startedAt
          text += ev.data.text
        } else if (ev.event === 'reasoning') {
          reasoning += ev.data.text
        } else {
          if (ev.event === 'plan') turnPlan = ev.data.steps
          steps = foldThoughtEvent(steps, ev)
        }

        if (ev.event === 'action') {
          const enriched = await this.drafts.enrichSingleDraft(userId, taxYear, ev.data)
          // A recorded value the user did not ask to change is not shown as a draft (ADR-0082).
          if (holdUnaskedOverwrites([enriched], scrubbedUserText).kept.length === 0) continue
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
          this.modelConnection.recordTurn(ev.data.failure ?? null)
          // Half an answer is kept for the record, but never as if it were complete.
          await finish('failed', text, ev.data.failure ? { modelFailure: ev.data.failure } : {})
          yield ev
          return
        }

        if (ev.event === 'done') {
          const turnResult = ev.data as AdvisorTurnResult
          // What the model did this turn is the best news about the connection there is.
          if (turnResult.mode === 'langgraph' || turnResult.meta.modelFailure) this.modelConnection.recordTurn(turnResult.primaryFailure ?? turnResult.meta.modelFailure ?? null)
          // The workbench shows the model's draft labels, reasons and plan steps as written: cleaned like the reply.
          const { meta: enrichedMeta, reply: guardedReply, note: heldNote } = guardModelDrafts(
            metaWithoutInternalNames(await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, turnResult.meta)),
            scrubbedUserText,
            turnResult.replyText,
          )
          await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

          const engine: AdvisorEngineInfo = {
            mode: turnResult.mode,
            ...(turnResult.provider !== undefined ? { provider: turnResult.provider } : {}),
            ...(turnResult.model !== undefined ? { model: turnResult.model } : {}),
            // Counted per user and day from here, as verdict and category only, never the text (ADR-0069).
            ...(turnResult.topic !== undefined ? { topic: turnResult.topic } : {}),
          }
          if (reasoning.length === 0 && turnResult.reasoning) reasoning = turnResult.reasoning
          const noteChanges = await this.notes.applyNoteChanges(userId, taxYear, enrichedMeta.noteChanges)
          if (enrichedMeta.interviewChanges && enrichedMeta.interviewChanges.length > 0) {
            await this.advisorRepo.saveInterview(userId, taxYear, applyInterviewChanges(await this.advisorRepo.findInterview(userId, taxYear), enrichedMeta.interviewChanges))
          }
          const { noteChanges: _asProposed, interviewChanges: _stored, ...metaWithoutNotes } = enrichedMeta
          // What still blocks the printout, asked by the app when the model left it out (ADR-0091, Nachtrag).
          const gapFollowUp = turn.opening
            ? { text: '', meta: {} }
            : printoutFollowUp({
                plan: digest.furtherFacts?.printoutPlan,
                message: scrubbedUserText,
                reply: turnResult.replyText,
                meta: enrichedMeta,
                records: request.records,
                previous: turn.previousAnswer,
                subjectLabels: await this.childLabels(userId, taxYear, turn.personalDataConsent === true),
              })
          // The consent card is the app's decision, not the model's (ADR-0091): see `needsPersonalDataConsentOffer`.
          const { personalDataConsentRequest: askedByOwl, ...metaWithoutConsent } = metaWithoutNotes
          const offerConsent = await this.offersConsentCard(userId, taxYear, turn, turnResult.replyText, askedByOwl === true, request)
          // Open steps survive the answer, and the user hears of them even when the model forgot to say so.
          const plan = carriedPlan(turnPlan, turn.previousPlan ?? null)
          const planMeta: AdvisorPlanMeta = plan ? { plan } : {}
          const planNote = turnResult.mode === 'langgraph' && !turn.opening ? openPlanNote(plan, turnResult.replyText) : ''
          // Field ids and tool names never reach the user, whatever the model wrote.
          const answerText = (withoutInternalNames(guardedReply) + heldNote + gapFollowUp.text).trim()
          // The open-steps line is the app's, not an answer: with nothing else to show, the turn failed (like any empty reply).
          if (answerText.length === 0 && !turn.opening && !showsSomething(metaWithoutConsent, gapFollowUp.meta, offerConsent, noteChanges.length)) {
            this.modelConnection.recordTurn(EMPTY_ANSWER_FAILURE)
            await finish('failed', '', { modelFailure: EMPTY_ANSWER_FAILURE })
            yield { event: 'error', data: { code: 'ADVISOR_TURN_FAILED', message: TURN_FAILED_MESSAGE, failure: EMPTY_ANSWER_FAILURE } }
            return
          }
          const assistant = await finish(
            'complete',
            (answerText + planNote).trim(),
            {
              ...metaWithoutConsent,
              ...gapFollowUp.meta,
              ...planMeta,
              ...(noteChanges.length > 0 ? { noteChanges } : {}),
              ...(turn.opening ? { opening: turn.opening.marker } : {}),
              ...(offerConsent ? { personalDataConsentRequest: true as const } : {}),
              engine,
            },
            turnResult.usage,
            turnResult.timings ? { ...turnResult.timings, prepMs } : undefined,
          )
          // An opening prepares no drafts, so there is nothing for Turbo to apply.
          const turbo = turn.opening ? null : await this.applyTurbo(userId, taxYear, runId, dto, assistant)
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

  /**
   * Whether this answer carries the consent card for personal data (ADR-0091). The app decides it
   * from the turn (what was masked, what the user named, what the answer says), so the card never
   * depends on the model having called a tool.
   */
  private async offersConsentCard(userId: string, taxYear: number, turn: PreparedAdvisorTurn, reply: string, askedByOwl: boolean, request?: AdvisorTurnRequest): Promise<boolean> {
    if (turn.personalDataConsent === true) return false
    const [records, household] = request ? [request.records, request.household] : await Promise.all([this.caseDigest.loadRecordHandles(userId, taxYear), this.caseDigest.advisorHousehold(userId, taxYear)])
    return needsPersonalDataConsentOffer({
      consent: false,
      maskedPersonalData: turn.maskedPersonalData === true,
      consentRequested: askedByOwl,
      // An opening is the app's own placeholder, not the user's words.
      message: turn.opening ? '' : turn.scrubbedUserText,
      reply,
      hasChildRecord: (records?.kind?.length ?? 0) > 0,
      hasPersonB: (household?.personB ?? null) !== null,
    })
  }

  /** A child's first name for its neutral name, so the app's own question names the child; only with the consent. */
  private async childLabels(userId: string, taxYear: number, consent: boolean): Promise<Record<string, string> | undefined> {
    if (!consent) return undefined
    const children = await this.childRepo.listForUserAndYear(userId, taxYear)
    return Object.fromEntries(children.map((child, i) => [`Kind ${i + 1}`, child.firstName]).filter(([, name]) => !!name))
  }

  /** The tax office's notice against the return, as the assessment check needs it: figures only, nothing that names a person. */
  private async assessmentBrief(userId: string, taxYear: number): Promise<AdvisorAssessmentBrief> {
    const empty: AdvisorAssessmentBrief = { recorded: false, status: 'nicht erfasst', deviations: [], calculationIncomplete: false, appealDaysLeft: null }
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
}

const EMPTY_ANSWER_FAILURE: AdvisorModelFailure = { reason: 'unknown', detail: 'empty answer' }

/** Whether the answer carries anything the user can see besides its text: a card, a choice, a question round, a note or the consent card. */
function showsSomething(meta: AdvisorMessageMeta, followUpMeta: AdvisorMessageMeta, offerConsent: boolean, noteChangeCount: number): boolean {
  const all = { ...meta, ...followUpMeta }
  return (
    offerConsent ||
    noteChangeCount > 0 ||
    all.action !== undefined ||
    (all.actions?.length ?? 0) > 0 ||
    all.twoPaths !== undefined ||
    (all.choices?.length ?? 0) > 0 ||
    all.questionRound !== undefined ||
    (all.situationSuggestions?.length ?? 0) > 0 ||
    all.personalDataConsentRequest === true
  )
}

/**
 * The model's drafts without the ones that would change a recorded value the user did not ask about, or
 * write the value already there; the answer then says what was left as it was (ADR-0082).
 */
function guardModelDrafts(meta: AdvisorMessageMeta, userText: string, replyText: string): { meta: AdvisorMessageMeta; reply: string; note: string } {
  const drafts = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
  // Two paths are one card with two drafts; a text that counts them as two is right.
  const alternatives = meta.twoPaths ? 2 : 0
  if (drafts.length === 0) return { meta, reply: replyText, note: draftCountNote(replyText, alternatives) }
  const { kept, held, unchanged } = holdUnaskedOverwrites(drafts.map((d) => (d.person === 'B' ? { ...d, label: `${d.label} (Person B)` } : d)), userText)
  const keep = new Set(kept.map((d) => d.actionId))
  const { action, actions, ...rest } = meta
  // The engine's stock sentence counted every draft; it is written again for the ones that are shown.
  const stock = replyText === preparedDraftsSentence(drafts.map((d) => d.label))
  const reply = stock && kept.length < drafts.length ? preparedDraftsSentence(drafts.filter((d) => keep.has(d.actionId)).map((d) => d.label)) : replyText
  return {
    meta: {
      ...rest,
      ...(action && keep.has(action.actionId) ? { action } : {}),
      ...(actions ? { actions: actions.filter((a) => keep.has(a.actionId)) } : {}),
    },
    reply,
    // What was left out is named, and a text that announces more drafts than there are is corrected by the app.
    note: heldDraftsNote(held) + unchangedDraftsNote(unchanged) + draftCountNote(reply, kept.length + alternatives),
  }
}
