import type { AdvisorActionProposal, AdvisorChatMessageView, AdvisorQuickAction, AdvisorSkillId } from '@steuereule/core'
import type { AdvisorChatLiveStream, AdvisorChatStream, AdvisorQuickChip, ChatSendOptions } from './AdvisorChat.types'

/** Below this width the input shows its short hint; the long one needs two lines there. */
export const NARROW_COMPOSER_WIDTH = 560

/** Width of the reading column in the page variant. */
export const CHAT_COLUMN_MAX_WIDTH = 760
/** How many quick starts an empty page shows before "Mehr …". */
export const PAGE_QUICK_CHIPS = 4

/** The running answer with its defaults applied once, so the parts of the chat never repeat them. */
export function liveStream(stream: AdvisorChatStream = {}): AdvisorChatLiveStream {
  const {
    isSending = false,
    streamSteps = [],
    streamedText = '',
    streamedReasoning = '',
    pendingUserMessage = null,
    reconnecting = false,
    abortedTurn = null,
    plan = null,
    chatError = null,
    basisMode = false,
    onStop,
  } = stream
  return { isSending, streamSteps, streamedText, streamedReasoning, pendingUserMessage, reconnecting, abortedTurn, plan, chatError, basisMode, onStop }
}

/** The options as request fields, without keys that are unset (the DTO forbids explicit undefined). */
export function sendOptionsToDto(options: ChatSendOptions | undefined): { quickAction?: AdvisorQuickAction; replaceFromMessageId?: string; skill?: AdvisorSkillId; turbo?: boolean; depth?: 'max'; spoken?: boolean } {
  return {
    ...(options?.skill ? { skill: options.skill } : {}),
    ...(options?.turbo ? { turbo: true } : {}),
    ...(options?.depth === 'max' ? { depth: 'max' as const } : {}),
    ...(options?.spoken ? { spoken: true } : {}),
    ...(options?.quickAction ? { quickAction: options.quickAction } : {}),
    ...(options?.replaceFromMessageId ? { replaceFromMessageId: options.replaceFromMessageId } : {}),
  }
}

/** The hidden question of an opening: the owl speaks first, there is nothing the user said. */
export const isOpeningPlaceholder = (message: AdvisorChatMessageView): boolean => message.role === 'user' && message.meta?.opening !== undefined

/** What is switched on at the input travels with every message; a plain message stays plain. */
export function withSwitches(options: ChatSendOptions | undefined, activeSkill: AdvisorSkillId | null, turbo: boolean, max: boolean): ChatSendOptions | undefined {
  return activeSkill || turbo || max
    ? { ...options, ...(activeSkill ? { skill: activeSkill } : {}), ...(turbo ? { turbo: true } : {}), ...(max ? { depth: 'max' as const } : {}) }
    : options
}

/** An answer that is still being written is shown by the live bubble, not from the stored list. */
export function visibleMessages(all: readonly AdvisorChatMessageView[]): AdvisorChatMessageView[] {
  return all.filter((m) => !(m.role === 'assistant' && m.status === 'streaming') && !isOpeningPlaceholder(m))
}

/** The question of the running turn shows until the stored list contains it. */
export function showsPendingUser(isSending: boolean, pending: AdvisorChatMessageView | null, messages: readonly AdvisorChatMessageView[]): pending is AdvisorChatMessageView {
  return isSending && pending !== null && !isOpeningPlaceholder(pending) && !messages.some((m) => m.id === pending.id)
}

/** The last stored answer was stopped or failed: it shows itself, no extra aborted bubble. */
export function isStoredInterrupted(message: AdvisorChatMessageView | undefined): boolean {
  return message?.role === 'assistant' && (message.status === 'aborted' || message.status === 'failed')
}

/** Index of the last message of a role, -1 when there is none. */
export function lastIndexOfRole(messages: readonly AdvisorChatMessageView[], role: AdvisorChatMessageView['role']): number {
  return messages.reduce((last, m, i) => (m.role === role ? i : last), -1)
}

/** A quick start given as plain text has no test id and no quick action. */
export function quickChipOf(entry: string | AdvisorQuickChip): { readonly label: string; readonly testID: string | undefined; readonly quickAction: AdvisorQuickAction | undefined } {
  return typeof entry === 'string' ? { label: entry, testID: undefined, quickAction: undefined } : { label: entry.label, testID: entry.testID, quickAction: entry.quickAction }
}

/** The page shows the first few quick starts; the rest wait behind "Mehr …". */
export function shownQuickChips<T>(chips: readonly T[], variant: 'panel' | 'page', expanded: boolean): readonly T[] {
  return variant === 'page' && !expanded ? chips.slice(0, PAGE_QUICK_CHIPS) : chips
}

/** Dictated text is appended to what was typed, separated by one space. */
export function appendTranscript(previous: string, text: string): string {
  return previous.trim() ? `${previous.trimEnd()} ${text}` : text
}

/** The known slash commands as one line, e.g. `/grill-me, /plan`. */
export function slashCommandList(commands: Readonly<Record<string, unknown>>): string {
  return Object.keys(commands)
    .map((name) => `/${name}`)
    .join(', ')
}

/** How many drafts of a Turbo answer the owl applied itself (undone ones included). */
export function turboAppliedCount(action: AdvisorActionProposal | null | undefined, actions: readonly AdvisorActionProposal[] | undefined): number {
  return [action, ...(actions ?? [])].filter((a) => a?.status === 'applied' || a?.status === 'undone').length
}

/** The pasted receipt as the request needs it; null when there is no text. */
export function pastedReceiptInput(fileName: string, rawText: string): { readonly fileName: string; readonly rawText: string } | null {
  const text = rawText.trim()
  if (!text) return null
  return { fileName: fileName.trim() || 'beleg.pdf', rawText: text }
}

/** Removes a waiting file from the queue; the one being read (the first) stays. */
export function withoutQueuedFile<T>(queue: readonly T[], file: T): T[] {
  return queue.filter((queued, qi) => qi === 0 || queued !== file)
}
