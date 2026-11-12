import {
  buildAdvisorHistory,
  scrubUserMessagePii,
  type AdvisorEnginePort,
  type AdvisorHistoryEntry,
  fallbackSummary,
  summaryCut,
  transcriptForSummary,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, NotFoundError } from '../common/domain-error.js'
import { type AdvisorConversationRecord, type AdvisorRepository } from './advisor.repository.js'
import type { AdvisorContextDto, AdvisorConversationDto, AdvisorSearchHitDto } from './dto/advisor.dto.js'
import { PreparedAdvisorTurn, MAX_CONVERSATIONS_PER_YEAR, titleFrom, liveMessages, historySources, contextOf, SEARCH_MIN_CHARS, SEARCH_MAX_HITS, searchKey, snippetAround, toConversationDto } from './advisor-shared.js'
import type { AdvisorCaseFacts } from './advisor-case-facts.js'

/** The conversations of a tax year: opening, naming, searching and summarising them (#481). */
export class AdvisorConversations {
  constructor(
    private readonly advisorEngine: AdvisorEnginePort | undefined,
    private readonly advisorRepo: AdvisorRepository,
    private readonly auditService: AuditService,
    private readonly knownNamesForScrubbing: AdvisorCaseFacts['knownNamesForScrubbing'],
  ) {}

  /**
   * The conversation a request is about (#481). Without an id it is the one used last in that
   * year, created when the year has none: the project of a tax return exists as soon as it is opened.
   */
  async conversationFor(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorConversationRecord> {
    if (conversationId === undefined) return this.advisorRepo.defaultConversation(userId, taxYear)
    const conversation = await this.advisorRepo.findConversation(conversationId, userId)
    if (!conversation || conversation.taxYear !== taxYear) {
      throw new NotFoundError('ADVISOR_CONVERSATION_NOT_FOUND', 'Dieses Gespräch gibt es nicht (mehr).')
    }
    return conversation
  }

  async listConversations(userId: string, taxYear: number): Promise<AdvisorConversationDto[]> {
    await this.advisorRepo.defaultConversation(userId, taxYear)
    return (await this.advisorRepo.listConversations(userId, taxYear)).map(toConversationDto)
  }

  async createConversation(userId: string, taxYear: number): Promise<AdvisorConversationDto> {
    const existing = await this.advisorRepo.listConversations(userId, taxYear)
    // A conversation nobody has written in yet is the new one: no pile of empty conversations.
    for (const conversation of existing) {
      if ((await this.advisorRepo.listForConversation(conversation.id, userId)).length === 0) {
        const reused = await this.advisorRepo.updateConversation(conversation.id, userId, { lastUsedAt: new Date() })
        return toConversationDto(reused ?? conversation)
      }
    }
    if (existing.length >= MAX_CONVERSATIONS_PER_YEAR) {
      throw new ConflictError(
        'ADVISOR_CONVERSATION_LIMIT',
        `In einem Steuerjahr sind höchstens ${MAX_CONVERSATIONS_PER_YEAR} Gespräche möglich. Lösche eines, das du nicht mehr brauchst.`,
      )
    }
    return toConversationDto(await this.advisorRepo.createConversation(userId, taxYear))
  }

  async renameConversation(userId: string, taxYear: number, conversationId: string, title: string): Promise<AdvisorConversationDto> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const updated = await this.advisorRepo.updateConversation(conversation.id, userId, { title: titleFrom(scrubUserMessagePii(title, knownNames)) })
    return toConversationDto(updated ?? conversation)
  }

  /**
   * Deletes a conversation with its messages. Values already applied to the return stay; drafts
   * that were still open in it disappear.
   */
  async deleteConversation(userId: string, taxYear: number, conversationId: string): Promise<{ deletedMessages: number }> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const deletedMessages = (await this.advisorRepo.deleteConversation(conversation.id, userId)) ?? 0
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_gespraech_geloescht' })
    return { deletedMessages }
  }

  /**
   * Condenses the older part of a conversation into its summary (#481) and returns the conversation
   * as it stands afterwards. The newest turns stay verbatim; without a model the summary lists the
   * questions and what became of the proposals, so a full conversation never blocks.
   */
  async compact(userId: string, taxYear: number, conversation: AdvisorConversationRecord, exceptIds: readonly string[], signal?: AbortSignal): Promise<AdvisorConversationRecord> {
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const live = liveMessages(conversation, await this.advisorRepo.listForConversation(conversation.id, userId)).filter((m) => !exceptIds.includes(m.id))
    const sources = historySources(live, knownNames)
    const cut = summaryCut(sources)
    if (cut === 0) return conversation
    const older = sources.slice(0, cut)
    const fromModel = this.advisorEngine?.summarize
      ? await this.advisorEngine.summarize({ transcript: transcriptForSummary(older), previousSummary: conversation.summary, signal })
      : null
    const summary = scrubUserMessagePii(fromModel ?? fallbackSummary(older, conversation.summary), knownNames)
    const updated = await this.advisorRepo.updateConversation(conversation.id, userId, { summary, summaryUntil: live[cut - 1]!.createdAt })
    return updated ?? conversation
  }

  /** Summarises before an answer and returns the history the model gets afterwards. */
  async summarizeForTurn(userId: string, taxYear: number, turn: PreparedAdvisorTurn, signal?: AbortSignal): Promise<readonly AdvisorHistoryEntry[]> {
    const conversation = await this.conversationFor(userId, taxYear, turn.conversationId)
    const thisTurn = [turn.userMessage.id, turn.assistantMessageId]
    const compacted = await this.compact(userId, taxYear, conversation, thisTurn, signal)
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const live = liveMessages(compacted, await this.advisorRepo.listForConversation(compacted.id, userId)).filter((m) => !thisTurn.includes(m.id))
    return buildAdvisorHistory(historySources(live, knownNames), { summary: compacted.summary })
  }

  /** "Jetzt zusammenfassen": the user tidies the context before it is full. */
  async summarizeConversation(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorContextDto> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const compacted = await this.compact(userId, taxYear, conversation, [])
    if (compacted.summaryUntil?.getTime() === conversation.summaryUntil?.getTime()) {
      throw new ConflictError('ADVISOR_NOTHING_TO_SUMMARIZE', 'Dieses Gespräch ist noch zu kurz, um es zusammenzufassen.')
    }
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_gespraech_zusammengefasst' })
    return contextOf(compacted, await this.advisorRepo.listForConversation(compacted.id, userId), await this.knownNamesForScrubbing(userId, taxYear))
  }

  /**
   * Searches the conversations of one tax year (#481): titles and messages, newest hit first.
   * Messages are encrypted at rest, so the search runs here over the decrypted text; a year holds
   * at most 50 conversations, which keeps that small.
   */
  async searchConversations(userId: string, taxYear: number, rawQuery: string): Promise<AdvisorSearchHitDto[]> {
    const query = searchKey(rawQuery)
    if (query.length < SEARCH_MIN_CHARS) return []
    const [conversations, messages] = await Promise.all([
      this.advisorRepo.listConversations(userId, taxYear),
      this.advisorRepo.listForUserAndYear(userId, taxYear),
    ])
    const titles = new Map(conversations.map((c) => [c.id, c.title]))
    const hits: AdvisorSearchHitDto[] = []
    for (const conversation of conversations) {
      if (conversation.title !== null && searchKey(conversation.title).includes(query)) {
        hits.push({ conversationId: conversation.id, conversationTitle: conversation.title, snippet: conversation.title, at: conversation.lastUsedAt.toISOString() })
      }
    }
    for (const message of messages) {
      if (message.meta?.replaced || !titles.has(message.conversationId)) continue
      const at = searchKey(message.content).indexOf(query)
      if (at === -1) continue
      hits.push({
        conversationId: message.conversationId,
        conversationTitle: titles.get(message.conversationId) ?? null,
        messageId: message.id,
        role: message.role,
        snippet: snippetAround(message.content, at, query.length),
        at: message.createdAt.toISOString(),
      })
    }
    await this.auditService.append({ userId, action: 'READ', resource: 'berater_suche' })
    return hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, SEARCH_MAX_HITS)
  }
}
