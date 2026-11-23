import { PersonalDataConsentService } from '../owl-mode/personal-data-consent.service.js'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  ADVISOR_LEGAL_SOURCES,
  type AdvisorHousehold,
  type AdvisorActionProposal,
  type AdvisorCountedItem,
  type AssignmentMember,
  type AdvisorEstimateReading,
  type AdvisorEnginePort,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorMessageFeedback,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorRecordHandles,
  type AdvisorStreamEvent,
  type CaseDigest,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ADVISOR_ENGINE } from '../ki/advisor-engine.token.js'
import { AI_RUNTIME_CONFIG_SERVICE, type AiRuntimeConfigService } from '../ki/ai-runtime-config.service.js'
import { AssessmentService } from '../assessment/assessment.service.js'
import { ModelConnectionService } from '../ki/model-connection.service.js'
import { TRANSACTION_RUNNER, passThroughTransactionRunner, type TransactionRunner } from '../common/transaction-runner.js'
import { AdvisorOpening } from './advisor-opening.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { LinkService } from '../link/link.service.js'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorConversationRecord,
  type AdvisorRepository,
  type ReceiptDraftRecord,
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
  AdvisorOpeningStateDto,
} from './dto/advisor.dto.js'
import { ANSWERING_WINDOW_MS, projectsOf, toMessageDto, PreparedAdvisorTurn, contextOf, toNoteDto, toConversationDto } from './advisor-shared.js'
import { AdvisorConversations } from './advisor-conversations.js'
import { AdvisorProjectNotes } from './advisor-project-notes.js'
import { AdvisorDrafts } from './advisor-drafts.js'
import { AdvisorCaseDigest } from './advisor-case-digest.js'
import { AdvisorTurn } from './advisor-turn.js'
import {
  AdvisorDocumentStaging,
  type CountTarget,
  type DocumentDraftsInput,
  type HouseholdNames,
  type LstbScanBatchInput,
  type ReceiptProposalInput,
  type BookingProposalInput,
} from './advisor-document-staging.js'
export { MAX_CONVERSATIONS_PER_YEAR, searchKey, snippetAround, titleFrom } from './advisor-shared.js'
export type { PreparedAdvisorTurn } from './advisor-shared.js'
export { effectFromEstimates, estimateReadingFrom } from './advisor-case-digest.js'
export { combinationDrafts, type CountTarget } from './advisor-document-staging.js'

@Injectable()
export class AdvisorService {
  constructor(
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
    @Inject(OwlModeService) private readonly owlModeService: OwlModeService,
    @Inject(ConfirmationService) private readonly confirmationService: ConfirmationService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AdvisorDrafts) private readonly drafts: AdvisorDrafts,
    @Inject(AdvisorCaseDigest) private readonly caseDigest: AdvisorCaseDigest,
    @Inject(AdvisorConversations) private readonly conversations: AdvisorConversations,
    @Inject(AdvisorProjectNotes) private readonly notes: AdvisorProjectNotes,
    @Inject(AdvisorOpening) private readonly opening: AdvisorOpening,
    @Inject(AdvisorDocumentStaging) private readonly staging: AdvisorDocumentStaging,
    /** Null only where the fixed rules answer alone; AdvisorModule always binds a model engine. */
    @Inject(ADVISOR_ENGINE) private readonly advisorEngine: AdvisorEnginePort | null,
    @Optional() @Inject(CHILD_REPOSITORY) private readonly childRepo?: ChildRepository,
    @Optional() @Inject(PROFILE_REPOSITORY) private readonly profileRepo?: ProfileRepository,
    @Optional() @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig?: AiRuntimeConfigService,
    @Optional() @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner = passThroughTransactionRunner,
    @Optional() @Inject(ModelConnectionService) private readonly modelConnection?: ModelConnectionService,
    @Optional() @Inject(AssessmentService) private readonly assessmentService?: AssessmentService,
    @Optional() @Inject(LinkService) private readonly link?: LinkService,
    @Optional() @Inject(PersonalDataConsentService) private readonly personalDataConsent?: PersonalDataConsentService,
  ) {}

  /** Whether the user consented to personal data going to the owl's model (ADR-0091); read fresh on every use. */
  private async hasPersonalDataConsent(userId: string): Promise<boolean> {
    return (await this.personalDataConsent?.hasConsent(userId)) ?? false
  }

  /** Whether a new conversation opens with the owl speaking first (ADR-0067 §11). */
  async openingState(userId: string, taxYear: number): Promise<AdvisorOpeningStateDto> {
    const state = await this.opening.state(userId, taxYear)
    // Without a language model the fixed rules answer; they have nothing to open with.
    return this.advisorEngine ? state : { ...state, shouldOpen: false }
  }

  private turnPart?: AdvisorTurn
  private get turn(): AdvisorTurn {
    return (this.turnPart ??= new AdvisorTurn(
      this.advisorRepo,
      this.owlModeService,
      this.caseDigest,
      this.conversations,
      this.notes,
      this.opening,
      this.drafts,
      this.transactions,
      (userId) => this.hasPersonalDataConsent(userId),
      this.advisorEngine ?? undefined,
      this.runtimeConfig,
      this.modelConnection,
      this.assessmentService,
      this.link,
      this.profileRepo,
      this.childRepo,
    ))
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

  async setConversationModel(userId: string, taxYear: number, conversationId: string, choice: { readonly provider: string; readonly model: string } | null): Promise<AdvisorConversationDto> {
    return this.conversations.setChatModel(userId, taxYear, conversationId, choice)
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

  /** Every name that must not reach a model: the user's, the children's and the spouse's. */
  async knownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
    return this.caseDigest.knownNamesForScrubbing(userId, taxYear)
  }

  /** The household as the owl may know it (ADR-0073); see `AdvisorCaseDigest.advisorHousehold`. */
  async advisorHousehold(userId: string, taxYear: number): Promise<AdvisorHousehold> {
    return this.caseDigest.advisorHousehold(userId, taxYear)
  }

  async loadRecordHandles(userId: string, taxYear: number): Promise<AdvisorRecordHandles> {
    return this.caseDigest.loadRecordHandles(userId, taxYear)
  }

  async buildCaseDigest(userId: string, taxYear: number): Promise<CaseDigest> {
    return this.caseDigest.buildCaseDigest(userId, taxYear)
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

  /** What a draft would do to the refund, by the app's own estimate (rolled back); see `AdvisorCaseDigest.previewEffectFor`. */
  previewEffectFor(userId: string, taxYear: number): ((target: AdvisorPreviewTarget) => Promise<AdvisorPreviewEffect>) | undefined {
    return this.caseDigest.previewEffectFor(userId, taxYear)
  }

  /** The app's own estimate of the year for the owl to read (`read_current_estimate`): figures only. */
  estimateReaderFor(userId: string, taxYear: number): (() => Promise<AdvisorEstimateReading>) | undefined {
    return this.caseDigest.estimateReaderFor(userId, taxYear)
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

  // ── The turn (advisor-turn.ts) ─────────────────────────────────────────────────────────────

  async sendMessage(userId: string, taxYear: number, dto: SendAdvisorMessageDto): Promise<SendAdvisorMessageResponseDto> {
    return this.turn.sendMessage(userId, taxYear, dto)
  }

  /** Quota, masking and both messages, before the stream opens (#476); see `AdvisorTurn.prepareTurn`. */
  async prepareTurn(userId: string, taxYear: number, dto: SendAdvisorMessageDto): Promise<PreparedAdvisorTurn> {
    return this.turn.prepareTurn(userId, taxYear, dto)
  }

  async *streamMessage(userId: string, taxYear: number, dto: SendAdvisorMessageDto, signal?: AbortSignal): AsyncIterable<AdvisorStreamEvent> {
    yield* this.turn.streamMessage(userId, taxYear, dto, signal)
  }

  /** Runs a prepared turn to one of its final states; the answer never stays `streaming`. */
  async *executeTurn(userId: string, taxYear: number, turn: PreparedAdvisorTurn, signal?: AbortSignal): AsyncIterable<AdvisorStreamEvent> {
    yield* this.turn.executeTurn(userId, taxYear, turn, signal)
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

  // ── Documents staged as drafts (advisor-document-staging.ts) ───────────────────────────────

  async stageBookingProposal(userId: string, taxYear: number, input: BookingProposalInput): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    return this.staging.stageBookingProposal(userId, taxYear, input)
  }

  async stageReceiptProposal(userId: string, taxYear: number, input: ReceiptProposalInput): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    return this.staging.stageReceiptProposal(userId, taxYear, input)
  }

  async stageLstbScanBatch(userId: string, taxYear: number, input: LstbScanBatchInput): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    return this.staging.stageLstbScanBatch(userId, taxYear, input)
  }

  /** The names on record for A and B, only to tell whose document an upload is. */
  async householdNames(userId: string, taxYear: number): Promise<HouseholdNames> {
    return this.staging.householdNames(userId, taxYear)
  }

  /** The household of the year for the assignment of documents (ADR-0092). */
  async householdMembers(userId: string, taxYear: number): Promise<AssignmentMember[]> {
    return this.staging.householdMembers(userId, taxYear)
  }

  async stageDocumentDrafts(userId: string, taxYear: number, input: DocumentDraftsInput): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    return this.staging.stageDocumentDrafts(userId, taxYear, input)
  }

  async countedReceiptItems(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorCountedItem[]> {
    return this.staging.countedReceiptItems(userId, taxYear, target)
  }

  async childForReceipt(userId: string, taxYear: number, text: string): Promise<{ id: string | null; children: number }> {
    return this.staging.childForReceipt(userId, taxYear, text)
  }

  /** Takes back what one document put into the return (ADR-0092 §4); returns how many applied drafts. */
  async takeBackDocumentValues(userId: string, taxYear: number, receiptId: string): Promise<number> {
    return this.staging.takeBackDocumentValues(userId, taxYear, receiptId)
  }

  async markLstbActionsApplied(userId: string, taxYear: number, actionIds: readonly string[]): Promise<void> {
    return this.staging.markLstbActionsApplied(userId, taxYear, actionIds)
  }

  /** The drafts of every tax year that came from a Beleg, metadata only (ADR-0097): for its processing state. */
  async receiptDrafts(userId: string): Promise<ReceiptDraftRecord[]> {
    return this.staging.receiptDrafts(userId)
  }
}
