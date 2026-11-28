import type { AdvisorActionProposal, AdvisorChatMessageView, AdvisorThoughtStep, Screen } from '@steuereule/core'
import { sendOptionsToDto } from './AdvisorChatHelpers'
import type {
  AbortedTurn,
  AdvisorPlanView,
  ChatReceiptResult,
  PlanStepView,
  SendStreamingOptions,
  StaleConflictState,
  StaleFieldConflict,
  TileProvenanceKind,
} from './CopilotBridge.types'

/** What one conversation shows of its answer while it is written, and what is left when it stops or fails. */
export interface ConversationStream {
  readonly streaming: boolean
  readonly streamSteps: readonly AdvisorThoughtStep[]
  readonly streamedText: string
  readonly streamedReasoning: string
  readonly chatError: string | null
  readonly abortedTurn: AbortedTurn | null
  readonly plan: AdvisorPlanView | null
  readonly pendingUserMessage: AdvisorChatMessageView | null
  readonly reconnecting: boolean
}

export const IDLE_STREAM: ConversationStream = { streaming: false, streamSteps: [], streamedText: '', streamedReasoning: '', chatError: null, abortedTurn: null, plan: null, pendingUserMessage: null, reconnecting: false }

/** Where an answer is filed that was asked before the screen knew which conversation is open. */
export const PENDING_CONVERSATION = '(pending)'

export type StreamUpdate<T> = T | ((previous: T) => T)

/** An answer this provider is following. */
export interface ActiveRun {
  /** Known from the `start` event, or up front when re-attaching. */
  id: string | null
  /** Set by Stop; tells a user's stop apart from a request that was merely superseded. */
  stopped: boolean
}

/** One field of one conversation's stream changed; the same object back when nothing did. */
export function patchedStreams<K extends keyof ConversationStream>(
  prev: Readonly<Record<string, ConversationStream>>,
  key: string,
  field: K,
  update: StreamUpdate<ConversationStream[K]>,
): Readonly<Record<string, ConversationStream>> {
  const current = prev[key] ?? IDLE_STREAM
  const next = typeof update === 'function' ? (update as (value: ConversationStream[K]) => ConversationStream[K])(current[field]) : update
  return next === current[field] ? prev : { ...prev, [key]: { ...current, [field]: next } }
}

/** The pending answer moves to the conversation the server opened. */
export function streamsMovedFromPending(prev: Readonly<Record<string, ConversationStream>>, id: string): Readonly<Record<string, ConversationStream>> {
  const { [PENDING_CONVERSATION]: pending, ...rest } = prev
  return pending === undefined ? prev : { ...rest, [id]: pending }
}

/** The conversations with an answer being written; the pending one is not a conversation yet. */
export function answeringIds(streams: Readonly<Record<string, ConversationStream>>): string[] {
  return Object.keys(streams).filter((key) => key !== PENDING_CONVERSATION && streams[key]!.streaming)
}

/** Marks the running step of a stopped plan as aborted; finished steps stay as they are. */
export function abortPlan(plan: AdvisorPlanView | null): AdvisorPlanView | null {
  if (plan === null) return null
  return { finished: true, steps: plan.steps.map((s) => (s.status === 'laeuft' ? { ...s, status: 'abgebrochen' } : s)) }
}

export function parsePlanSteps(data: unknown): PlanStepView[] | null {
  if (typeof data !== 'object' || data === null || !('steps' in data)) return null
  const steps = (data as { steps: unknown }).steps
  if (!Array.isArray(steps)) return null
  return steps.flatMap((step: unknown) => {
    if (typeof step !== 'object' || step === null) return []
    const { text, status } = step as Record<string, unknown>
    return typeof text === 'string' && (status === 'offen' || status === 'laeuft' || status === 'erledigt') ? [{ text, status }] : []
  })
}

/** The body of a streamed message, without keys that are unset. */
export function streamMessageBody(message: string, activeScreen: Screen | undefined, options: SendStreamingOptions | undefined, conversationId: string | null): Record<string, unknown> {
  return {
    message,
    ...(activeScreen ? { activeScreen } : {}),
    // The same fields as the request without streaming: an option that travelled with one and not the other
    // (`spoken`, 28.11.2026) changed nothing in the answer.
    ...sendOptionsToDto(options),
    ...(conversationId ? { conversationId } : {}),
  }
}

export const PROVENANCE_PRIORITY: Readonly<Record<TileProvenanceKind, number>> = {
  'beleg+eule': 3,
  eule: 2,
  nutzer: 1,
}

export function upgradeProvenance(
  current: TileProvenanceKind | undefined,
  next: TileProvenanceKind,
): TileProvenanceKind {
  if (!current) return next
  return PROVENANCE_PRIORITY[next] > PROVENANCE_PRIORITY[current] ? next : current
}

/** Each applied draft marks its screen: from a receipt with the owl, or from the owl alone. */
export function provenanceAfterApply(
  prev: Readonly<Partial<Record<Screen, TileProvenanceKind>>>,
  actions: readonly AdvisorActionProposal[],
  receiptLinkedActionIds: ReadonlySet<string>,
): Partial<Record<Screen, TileProvenanceKind>> {
  const next: Partial<Record<Screen, TileProvenanceKind>> = { ...prev }
  for (const action of actions) {
    const srcKind: TileProvenanceKind = receiptLinkedActionIds.has(action.actionId) ? 'beleg+eule' : 'eule'
    next[action.screen] = upgradeProvenance(next[action.screen], srcKind)
  }
  return next
}

/** The strongest provenance among the screens of a tile; null when none of them has one. */
export function bestProvenance(provenanceByScreen: Readonly<Partial<Record<Screen, TileProvenanceKind>>>, screens: readonly Screen[]): TileProvenanceKind | null {
  let best: TileProvenanceKind | null = null
  for (const s of screens) {
    const kind = provenanceByScreen[s]
    if (kind && (best === null || PROVENANCE_PRIORITY[kind] > PROVENANCE_PRIORITY[best])) {
      best = kind
    }
  }
  return best
}

export function extractStaleConflicts(payload: unknown): StaleFieldConflict[] {
  if (typeof payload !== 'object' || payload === null || !('details' in payload)) return []
  const details = (payload as { details: unknown }).details
  if (typeof details !== 'object' || details === null || !('conflicts' in details)) return []
  const conflicts = (details as { conflicts: unknown }).conflicts
  if (!Array.isArray(conflicts)) return []
  return conflicts.flatMap((c: unknown) => {
    if (typeof c !== 'object' || c === null) return []
    const { actionId, key, currentValue } = c as Record<string, unknown>
    if (typeof key !== 'string' || (currentValue !== null && typeof currentValue !== 'string')) return []
    return [{ ...(typeof actionId === 'string' ? { actionId } : {}), key, currentValue }]
  })
}

/** Per draft, the fields the user accepted at their current value after seeing the conflict. */
export function acknowledgedValuesFor(
  actionId: string,
  conflict: StaleConflictState | undefined,
): Record<string, string | null> | undefined {
  if (!conflict) return undefined
  const own = conflict.conflicts.filter((c) => c.actionId === undefined || c.actionId === actionId)
  return own.length === 0 ? undefined : Object.fromEntries(own.map((c) => [c.key, c.currentValue]))
}

/** A file's line is replaced when it is read again (after „Für wen?“), never added twice. */
export function upsertReceiptResult(prev: readonly ChatReceiptResult[], next: ChatReceiptResult): readonly ChatReceiptResult[] {
  return prev.some((r) => r.key === next.key) ? prev.map((r) => (r.key === next.key ? next : r)) : [...prev, next]
}
