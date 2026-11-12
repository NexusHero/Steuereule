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
}

export const DEFAULT_ADVISOR_HISTORY_TOKENS = 3000
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
  const maxTokens = budget.maxTokens ?? DEFAULT_ADVISOR_HISTORY_TOKENS
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
  return note ? [{ role: 'user', content: note }, ...window] : window
}
