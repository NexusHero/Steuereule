import type {
  AdvisorActionProposal,
  AdvisorActionStatus,
  AdvisorMessageMeta,
  AdvisorMessageStatus,
} from './advisor'
import type { AdvisorHistoryEntry } from './ki-port'

/** What the history builder needs of a stored chat message. */
export interface AdvisorHistorySource {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly status?: AdvisorMessageStatus | undefined
}

export interface AdvisorHistoryBudget {
  /** Upper bound for the whole history, in estimated tokens. */
  readonly maxTokens?: number | undefined
  /**
   * What an earlier summary of this conversation says (#481). It stands for everything the caller
   * left out of `messages`, and counts against the budget like any other text.
   */
  readonly summary?: string | null | undefined
}

/** The context of one conversation: how much of its past the model is shown verbatim. */
export const DEFAULT_ADVISOR_HISTORY_TOKENS = 6000
/** From here on the chat warns that the conversation is about to be summarised. */
export const ADVISOR_CONTEXT_WARN_PERCENT = 80
/** After a summary, the newest turns stay verbatim up to this share of the context. */
const KEEP_AFTER_SUMMARY_SHARE = 0.25
const SUMMARY_HEADING = 'Zusammenfassung des bisherigen Gesprächs:'
const NOTE_SHARE = 0.25
const NOTE_HEADING = 'Früherer Gesprächsverlauf (gekürzt):'
const QUESTION_PREVIEW_CHARS = 100

/** Rough and provider-neutral: German prose runs at about four characters per token. */
export function estimateAdvisorTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const STATUS_LABEL: Readonly<Record<AdvisorActionStatus, string>> = {
  pending: 'offen',
  applied: 'übernommen',
  dismissed: 'verworfen',
  superseded: 'durch neueren Vorschlag ersetzt',
  undone: 'zurückgenommen',
}

function proposalsOf(meta: AdvisorMessageMeta | null): AdvisorActionProposal[] {
  if (!meta) return []
  return [
    ...(meta.action ? [meta.action] : []),
    ...(meta.actions ?? []),
    ...(meta.twoPaths ? [meta.twoPaths.safePath, meta.twoPaths.maxPath] : []),
  ]
}

/** Label, proposed value and outcome only; the stored previous value stays out of the prompt. */
function describeProposal(proposal: AdvisorActionProposal): string {
  return `[Vorschlag „${proposal.label}“ → ${proposal.newValue}: ${STATUS_LABEL[proposal.status]}]`
}

function toEntry(source: AdvisorHistorySource): AdvisorHistoryEntry | null {
  if (source.meta?.replaced) return null
  if (source.status === 'failed' || source.status === 'streaming') return null
  const notes = source.role === 'assistant' ? proposalsOf(source.meta).map(describeProposal) : []
  const text = source.status === 'aborted' ? `${source.content} [abgebrochen]` : source.content
  const content = [text, ...notes].filter((part) => part.trim().length > 0).join('\n')
  return content.length > 0 ? { role: source.role, content } : null
}

function buildNote(older: readonly AdvisorHistorySource[], maxTokens: number): string | null {
  const lines: string[] = []
  for (const source of older) {
    if (source.meta?.replaced) continue
    if (source.role === 'user') {
      const preview = source.content.length > QUESTION_PREVIEW_CHARS ? `${source.content.slice(0, QUESTION_PREVIEW_CHARS)}…` : source.content
      lines.push(`- Frage: ${preview}`)
    } else {
      for (const proposal of proposalsOf(source.meta)) lines.push(`- ${describeProposal(proposal)}`)
    }
  }
  if (lines.length === 0) return null
  // Oldest lines go first when the note itself is too long: the recent past matters more.
  while (lines.length > 1 && estimateAdvisorTokens([NOTE_HEADING, ...lines].join('\n')) > maxTokens) lines.shift()
  const note = [NOTE_HEADING, ...lines].join('\n')
  return estimateAdvisorTokens(note) <= maxTokens ? note : null
}

/**
 * The conversation as the model gets to see it (#476). Newest turns are kept verbatim up to the
 * budget; everything older collapses into one deterministic note (no model call), so the owl still
 * knows which questions came up and what happened to its proposals.
 */
export function buildAdvisorHistory(
  messages: readonly AdvisorHistorySource[],
  budget: AdvisorHistoryBudget = {},
): AdvisorHistoryEntry[] {
  const summaryEntry = summaryAsEntry(budget.summary)
  const maxTokens = Math.max(0, (budget.maxTokens ?? DEFAULT_ADVISOR_HISTORY_TOKENS) - (summaryEntry ? estimateAdvisorTokens(summaryEntry.content) : 0))
  const windowBudget = Math.floor(maxTokens * (1 - NOTE_SHARE))

  const window: AdvisorHistoryEntry[] = []
  let used = 0
  let cut = messages.length
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = toEntry(messages[i]!)
    if (entry) {
      const cost = estimateAdvisorTokens(entry.content)
      if (window.length > 0 && used + cost > windowBudget) break
      window.unshift(entry)
      used += cost
    }
    cut = i
  }

  // A window that opens with an answer has lost its question: push that answer into the note.
  while (window.length > 1 && window[0]!.role === 'assistant' && cut < messages.length) {
    window.shift()
    do cut += 1
    while (cut < messages.length && toEntry(messages[cut - 1]!) === null)
  }

  const note = buildNote(messages.slice(0, cut), maxTokens - windowBudget)
  return [...(summaryEntry ? [summaryEntry] : []), ...(note ? [{ role: 'user' as const, content: note }] : []), ...window]
}

function summaryAsEntry(summary: string | null | undefined): AdvisorHistoryEntry | null {
  const text = summary?.trim() ?? ''
  return text === '' ? null : { role: 'user', content: `${SUMMARY_HEADING}\n${text}` }
}

export type AdvisorContextLevel = 'ok' | 'warn' | 'full'

export interface AdvisorContextUsage {
  readonly usedTokens: number
  readonly maxTokens: number
  /** 0 to 100; a conversation over its budget still reads 100. */
  readonly percent: number
  readonly level: AdvisorContextLevel
}

/**
 * How full the context of a conversation is (#481): the summary so far plus every message since.
 * At `full` the older part has to be summarised before the model can be shown all of it again.
 */
export function advisorContextUsage(messages: readonly AdvisorHistorySource[], summary: string | null = null, maxTokens = DEFAULT_ADVISOR_HISTORY_TOKENS): AdvisorContextUsage {
  const summaryEntry = summaryAsEntry(summary)
  const usedTokens =
    (summaryEntry ? estimateAdvisorTokens(summaryEntry.content) : 0) +
    messages.reduce((sum, source) => {
      const entry = toEntry(source)
      return sum + (entry ? estimateAdvisorTokens(entry.content) : 0)
    }, 0)
  const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 100))
  return { usedTokens, maxTokens, percent, level: usedTokens >= maxTokens ? 'full' : percent >= ADVISOR_CONTEXT_WARN_PERCENT ? 'warn' : 'ok' }
}

/**
 * Where a conversation is cut for a summary: how many of its messages (from the start) go into
 * the summary. The newest turns stay verbatim, and the cut never separates a question from its
 * answer. 0 means there is nothing worth summarising yet.
 */
export function summaryCut(messages: readonly AdvisorHistorySource[], maxTokens = DEFAULT_ADVISOR_HISTORY_TOKENS): number {
  const keepBudget = Math.floor(maxTokens * KEEP_AFTER_SUMMARY_SHARE)
  let kept = 0
  let cut = messages.length
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = toEntry(messages[i]!)
    const cost = entry ? estimateAdvisorTokens(entry.content) : 0
    // Always keep the latest question with its answer, whatever it costs.
    if (kept + cost > keepBudget && cut < messages.length && messages[cut]!.role === 'user') break
    kept += cost
    cut = i
  }
  // Start what is kept at a question.
  while (cut < messages.length && messages[cut]!.role !== 'user') cut += 1
  return cut >= messages.length ? 0 : cut
}

/** The part of a conversation that is to be summarised, as plain text for the summariser. */
export function transcriptForSummary(older: readonly AdvisorHistorySource[]): string {
  return older
    .map((source) => {
      const entry = toEntry(source)
      return entry ? `${entry.role === 'user' ? 'Nutzer' : 'Eule'}: ${entry.content}` : null
    })
    .filter((line): line is string => line !== null)
    .join('\n')
}

/**
 * A summary without a model: the questions that came up and what became of the proposals. Used
 * when no model answers, so a full conversation never blocks.
 */
export function fallbackSummary(older: readonly AdvisorHistorySource[], previous: string | null, maxTokens = DEFAULT_ADVISOR_HISTORY_TOKENS): string {
  const note = buildNote(older, Math.floor(maxTokens * KEEP_AFTER_SUMMARY_SHARE))
  const lines = note ? note.split('\n').slice(1) : []
  return [...(previous?.trim() ? [previous.trim()] : []), ...lines].join('\n')
}
