import { Inject, Injectable } from '@nestjs/common'
import { ADVISOR_LEGAL_SOURCES, type AdvisorEnginePort, type AdvisorFeedbackRating, type AdvisorFeedbackReason, type AdvisorMessageFeedback } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ADVISOR_ENGINE } from '../ki/advisor-engine.token.js'
import { ModelConnectionService } from '../ki/model-connection.service.js'
import { AdvisorOpening } from './advisor-opening.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from './advisor.repository.js'
import type { AdvisorChatMessageDto, AdvisorConnectionDto, AdvisorSessionResponseDto, AdvisorOpeningStateDto } from './dto/advisor.dto.js'
import { ANSWERING_WINDOW_MS, projectsOf, toMessageDto, contextOf, toNoteDto, toConversationDto } from './advisor-shared.js'
import { AdvisorConversations } from './advisor-conversations.js'
import { AdvisorProjectNotes } from './advisor-project-notes.js'
import { AdvisorCaseDigest } from './advisor-case-digest.js'

/**
 * What belongs to the chat as a whole and to no single part: the session a client loads, clearing a
 * conversation, feedback on an answer, the opening state and the model connection. Everything else
 * is injected from the part that owns it (advisor-*.ts).
 */
@Injectable()
export class AdvisorService {
  constructor(
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
    @Inject(OwlModeService) private readonly owlModeService: OwlModeService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AdvisorCaseDigest) private readonly caseDigest: AdvisorCaseDigest,
    @Inject(AdvisorConversations) private readonly conversations: AdvisorConversations,
    @Inject(AdvisorProjectNotes) private readonly notes: AdvisorProjectNotes,
    @Inject(AdvisorOpening) private readonly opening: AdvisorOpening,
    /** Null only where the fixed rules answer alone; AdvisorModule always binds a model engine. */
    @Inject(ADVISOR_ENGINE) private readonly advisorEngine: AdvisorEnginePort | null,
    @Inject(ModelConnectionService) private readonly modelConnection: ModelConnectionService,
  ) {}

  /** Whether a new conversation opens with the owl speaking first (ADR-0067 §11). */
  async openingState(userId: string, taxYear: number): Promise<AdvisorOpeningStateDto> {
    const state = await this.opening.state(userId, taxYear)
    // Without a language model the fixed rules answer; they have nothing to open with.
    return this.advisorEngine ? state : { ...state, shouldOpen: false }
  }

  /** Whether the owl can reach its language model right now (#488). */
  async connection(): Promise<AdvisorConnectionDto> {
    return this.modelConnection.check()
  }

  async getSession(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorSessionResponseDto> {
    const conversation = await this.conversations.conversationFor(userId, taxYear, conversationId)
    // One round of independent reads (OPS-4): under load every sequential await waits its turn again.
    const [setting, cardsRes, history, conversations, notes, allConversations, answeringIds, knownNames, situation] = await Promise.all([
      this.owlModeService.getSetting(userId),
      this.owlModeService.getCards(userId, taxYear),
      this.advisorRepo.listForConversation(conversation.id, userId),
      this.advisorRepo.listConversations(userId, taxYear),
      this.advisorRepo.listNotes(userId, taxYear),
      this.advisorRepo.listAllConversations(userId),
      this.advisorRepo.answeringConversationIds(userId, new Date(Date.now() - ANSWERING_WINDOW_MS)),
      this.caseDigest.knownNamesForScrubbing(userId, taxYear),
      this.notes.getSituation(userId),
      this.auditService.append({
        userId,
        action: 'READ',
        resource: 'berater_sitzung',
      }),
    ])
    const answering = new Set(answeringIds)
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
      context: contextOf(conversation, history, knownNames),
      notes: notes.map(toNoteDto),
      situation,
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
    const conversation = await this.conversations.conversationFor(userId, taxYear, conversationId)
    const deletedMessages = await this.advisorRepo.deleteMessagesOfConversation(conversation.id, userId)
    await this.advisorRepo.updateConversation(conversation.id, userId, { title: null, summary: null, summaryUntil: null })
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_verlauf_geloescht' })
    return { deletedMessages }
  }
}
