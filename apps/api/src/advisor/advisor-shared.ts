// Pure helpers and types the parts of the owl service share: mapping records to what the API
// returns, and the small rules about titles, search and context. No state, no dependencies on the
// service itself.
import {
  advisorContextUsage,
  scrubUserMessagePii,
  type AdvisorActionProposal,
  type AdvisorHistoryEntry,
  type AdvisorMessageMeta,
  summaryCut,
  type AdvisorHistorySource,
} from '@steuereule/core'
import { type AdvisorChatMessageRecord, type AdvisorConversationRecord, type AdvisorNoteRecord } from './advisor.repository.js'
import type { AdvisorChatMessageDto, AdvisorContextDto, AdvisorConversationDto, AdvisorNoteDto, AdvisorProjectDto, SendAdvisorMessageDto } from './dto/advisor.dto.js'

export interface ResolvedDraft {
  readonly messageRecord: AdvisorChatMessageRecord
  readonly action: AdvisorActionProposal
  readonly key: string
}

export function parseNum(raw: string | null | undefined): number | null {
  if (!raw || raw === 'unklar') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/** Strips the server-internal undo snapshot; the client never needs prior provenance rows. */
export function toPublicAction<T extends AdvisorActionProposal>(action: T): T {
  if (action.undoSnapshot === undefined) return action
  const { undoSnapshot: _internal, ...rest } = action
  return rest as T
}

export function toPublicMeta(meta: AdvisorMessageMeta): AdvisorMessageMeta {
  const { engine: _internal, ...rest } = meta
  return {
    ...rest,
    ...(rest.action ? { action: toPublicAction(rest.action) } : {}),
    ...(rest.actions ? { actions: rest.actions.map((a) => toPublicAction(a)) } : {}),
    ...(rest.twoPaths
      ? {
          twoPaths: {
            ...rest.twoPaths,
            safePath: toPublicAction(rest.twoPaths.safePath),
            maxPath: toPublicAction(rest.twoPaths.maxPath),
          },
        }
      : {}),
  }
}

export function toMessageDto(record: AdvisorChatMessageRecord): AdvisorChatMessageDto {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    meta: record.meta ? toPublicMeta(record.meta) : null,
    createdAt: record.createdAt.toISOString(),
    status: record.status,
    ...(record.reasoning !== null ? { reasoning: record.reasoning } : {}),
    feedback: record.feedback,
    ...(record.runId !== null ? { runId: record.runId } : {}),
  }
}

/** A turn after its checks: both messages exist, the model has not been called yet. */
export interface PreparedAdvisorTurn {
  readonly runId: string
  readonly userMessage: AdvisorChatMessageRecord
  readonly assistantMessageId: string
  readonly scrubbedUserText: string
  readonly history: readonly AdvisorHistoryEntry[]
  readonly dto: SendAdvisorMessageDto
  readonly conversationId: string
  /** The context of the conversation is full: its older part is summarised before the model is asked. */
  readonly needsSummary: boolean
}

/** More conversations in one year than anyone can keep apart are a list nobody reads. */
/** An answer older than this that is still `streaming` is an orphan, not a running answer: it must not block its conversation. */
export const ANSWERING_WINDOW_MS = 5 * 60_000

export const MAX_CONVERSATIONS_PER_YEAR = 50

export const TITLE_MAX_LENGTH = 60

/** A conversation title from free text: one line, cut at a word where possible. */
export function titleFrom(text: string): string | null {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine === '') return null
  if (oneLine.length <= TITLE_MAX_LENGTH) return oneLine
  const cut = oneLine.slice(0, TITLE_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > TITLE_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** The messages the model still reads verbatim: everything after the summarised part. */
export function liveMessages(conversation: AdvisorConversationRecord, records: readonly AdvisorChatMessageRecord[]): AdvisorChatMessageRecord[] {
  const until = conversation.summaryUntil
  return until === null ? [...records] : records.filter((record) => record.createdAt.getTime() > until.getTime())
}

export function historySources(records: readonly AdvisorChatMessageRecord[], knownNames: readonly string[]): AdvisorHistorySource[] {
  return records.map((msg) => ({ role: msg.role, content: scrubUserMessagePii(msg.content, [...knownNames]), meta: msg.meta, status: msg.status }))
}

export function contextOf(conversation: AdvisorConversationRecord, records: readonly AdvisorChatMessageRecord[], knownNames: readonly string[]): AdvisorContextDto {
  const live = liveMessages(conversation, records)
  const sources = historySources(live, knownNames)
  const covered = records.filter((record) => !live.includes(record))
  return {
    ...advisorContextUsage(sources, conversation.summary),
    ...(conversation.summary ? { summary: conversation.summary } : {}),
    ...(covered.length > 0 ? { summarizedUntilMessageId: covered[covered.length - 1]!.id } : {}),
    canSummarize: summaryCut(sources) > 0,
  }
}

export const SEARCH_MIN_CHARS = 2

export const SEARCH_MAX_HITS = 30

export const SNIPPET_CONTEXT_CHARS = 60

/** Case and accents do not matter to a search: „Küchentisch“ is found by „kuchentisch“. The length stays the same. */
export function searchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äáàâ]/g, 'a')
    .replace(/[öóòô]/g, 'o')
    .replace(/[üúùû]/g, 'u')
    .replace(/[éèê]/g, 'e')
    .replace(/\s/g, ' ')
    .trim()
}

/** The passage around a hit, on one line, with an ellipsis where text was cut. */
export function snippetAround(text: string, at: number, length: number): string {
  const offset = text.length - text.trimStart().length
  const start = Math.max(0, at + offset - SNIPPET_CONTEXT_CHARS)
  const end = Math.min(text.length, at + offset + length + SNIPPET_CONTEXT_CHARS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

export function toNoteDto(note: AdvisorNoteRecord): AdvisorNoteDto {
  return { id: note.id, text: note.text, author: note.author, updatedAt: note.updatedAt.toISOString() }
}

/** The tax years as projects: every year that has conversations, and always the one that is open, newest first. */
export function projectsOf(openYear: number, conversations: readonly AdvisorConversationRecord[], answering: ReadonlySet<string>): AdvisorProjectDto[] {
  const years = [...new Set([openYear, ...conversations.map((c) => c.taxYear)])].sort((a, b) => b - a)
  return years.map((taxYear) => ({ taxYear, conversations: conversations.filter((c) => c.taxYear === taxYear).map((c) => toConversationDto(c, answering.has(c.id))) }))
}

export function toConversationDto(conversation: AdvisorConversationRecord, answering = false): AdvisorConversationDto {
  return {
    id: conversation.id,
    title: conversation.title,
    answering,
    createdAt: conversation.createdAt.toISOString(),
    lastUsedAt: conversation.lastUsedAt.toISOString(),
  }
}
