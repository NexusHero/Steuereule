import type { Item, Source } from '../engine/berechnung'
import type { IncomeType } from '../domains/income-types'
import type { AdvisorActionProposal, AdvisorChatMessageView, AdvisorMessageMeta, AdvisorTwoPathsProposal, CaseDigest } from './advisor'
import type { Screen } from './marking'
import type { AdvisorRecordHandles } from './record-handles'
import type { AdvisorNoteHandle } from './advisor-notes'
import type { AdvisorSkillId } from './advisor-skills'
import type { AdvisorAssessmentBrief, AdvisorTask } from './advisor-tasks'
import type { AdvisorOpeningBrief } from './advisor-opening'
import type { AdvisorModelFailure } from './advisor-failure'

/** The schema the LLM must answer. */
export interface AiProposal {
  readonly id: string
  readonly incomeType: IncomeType
  readonly amount: number
  readonly receiptId?: string
}

export interface AdvisorHistoryEntry {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface AdvisorTurnRequest {
  readonly message: string
  readonly activeScreen?: Screen | undefined
  readonly digest: CaseDigest
  readonly history?: readonly AdvisorHistoryEntry[] | undefined
  readonly actionIdFactory?: (() => string) | undefined
  /** Aborted when the client disconnects or the turn budget runs out; stops the paid model call. */
  readonly signal?: AbortSignal | undefined
  /** The „Was hab ich vergessen?“ quick start always opens with a plan (#451 decision 17). */
  readonly planRequired?: boolean | undefined
  /** The stored records of the per-record masks under their neutral names; ids never reach the model. */
  readonly records?: AdvisorRecordHandles | undefined
  /**
   * What a draft would do to the refund, worked out by the app's own estimate. Without it the
   * engine falls back to the approximation over the digest.
   */
  readonly previewEffect?: ((target: AdvisorPreviewTarget) => Promise<AdvisorPreviewEffect>) | undefined
  /** The project notes of the tax year under their neutral names (#481). */
  readonly notes?: readonly AdvisorNoteHandle[] | undefined
  /** The user's own description of the household's situation; applies in every conversation (#501). */
  readonly situation?: string | undefined
  /** Work the owl does on her own initiative in this turn (#501). */
  readonly task?: AdvisorTask | undefined
  /** The tax office's notice against the return, for the assessment check. */
  readonly assessment?: AdvisorAssessmentBrief | undefined
  /** How to open a new conversation and with which figures (ADR-0067 §11); with task `opening`. */
  readonly opening?: AdvisorOpeningBrief | undefined
  /** The skill the user switched on for this message (#495). */
  readonly skill?: AdvisorSkillId | undefined
}

/** The fields one draft would write, main field and companions alike. */
export interface AdvisorPreviewTarget {
  readonly screen: Screen
  readonly instance: string | null
  /** In write order: companions (the gate of an amount) first, the main field last. */
  readonly values: ReadonlyArray<readonly [field: string, value: string]>
}

export type AdvisorPreviewEffect =
  | { readonly kind: 'computed'; readonly beforeRefundEur: number; readonly afterRefundEur: number; readonly deltaEur: number }
  | { readonly kind: 'not-computable'; readonly hint: string }

/** Token counts of one turn, summed over all model rounds. */
export interface AdvisorTurnUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  /** Input tokens the provider served from its prompt cache. */
  readonly cachedInputTokens: number
}

export interface AdvisorTurnResult {
  readonly replyText: string
  readonly meta: AdvisorMessageMeta
  readonly mode: 'langgraph' | 'deterministic_fallback'
  readonly provider?: string | undefined
  readonly model?: string | undefined
  /** Reasoning summaries of all rounds, joined; absent when the model supplied none. */
  readonly reasoning?: string | undefined
  readonly usage?: AdvisorTurnUsage | undefined
  /** Set when the first model failed before its first word and the fallback model answered instead (#493). */
  readonly primaryFailure?: AdvisorModelFailure | undefined
}

/** Status of one step of the owl's visible plan (#451 slice 6). */
export const ADVISOR_PLAN_STEP_STATUSES = ['offen', 'laeuft', 'erledigt'] as const
export type AdvisorPlanStepStatus = (typeof ADVISOR_PLAN_STEP_STATUSES)[number]
export const ADVISOR_PLAN_MAX_STEPS = 8

export interface AdvisorPlanStep {
  readonly text: string
  readonly status: AdvisorPlanStepStatus
}

/** Quick starts that change how the turn runs, sent alongside the message. */
export const ADVISOR_QUICK_ACTIONS = ['forgotten_check', 'savings_plan', 'assessment_check', 'opening'] as const
export type AdvisorQuickAction = (typeof ADVISOR_QUICK_ACTIONS)[number]

export type AdvisorStreamEvent =
  /** First event of a run: the ids a client needs to render, stop and re-attach (#476). */
  | {
      readonly event: 'start'
      readonly data: { readonly runId: string; readonly userMessage: AdvisorChatMessageView; readonly assistantMessageId: string }
    }
  | { readonly event: 'status'; readonly data: { readonly text: string } }
  /** A piece of the provider's reasoning summary; never the answer itself. */
  | { readonly event: 'reasoning'; readonly data: { readonly text: string } }
  | { readonly event: 'tool'; readonly data: { readonly name: string; readonly label: string } }
  /** What a tool found, after it ran: a few words without personal data, shown under its step. */
  | { readonly event: 'tool_result'; readonly data: { readonly name: string; readonly ok: boolean; readonly result: string } }
  | { readonly event: 'token'; readonly data: { readonly text: string } }
  | { readonly event: 'choices'; readonly data: { readonly choices: readonly string[] } }
  | { readonly event: 'action'; readonly data: AdvisorActionProposal }
  | { readonly event: 'twoPaths'; readonly data: AdvisorTwoPathsProposal }
  | { readonly event: 'ui_command'; readonly data: AdvisorUiCommand }
  /** The full current plan (never a diff), sent whenever the model updates it. */
  | { readonly event: 'plan'; readonly data: { readonly steps: readonly AdvisorPlanStep[] } }
  | { readonly event: 'error'; readonly data: { readonly code: string; readonly message: string; readonly failure?: AdvisorModelFailure } }
  | { readonly event: 'done'; readonly data: unknown }

/** Tells the workbench to open a mask itself, e.g. when the model aimed at a field it may never write. */
export interface AdvisorUiCommand {
  readonly openMask: Screen
  readonly focus: string
}

export interface AdvisorSummaryRequest {
  /** The part of the conversation to condense, as plain dialogue; already free of personal data. */
  readonly transcript: string
  /** What an earlier summary of the same conversation says; the new one has to carry it on. */
  readonly previousSummary: string | null
  readonly signal?: AbortSignal | undefined
}

export interface AdvisorEnginePort {
  runTurn(input: AdvisorTurnRequest): Promise<AdvisorTurnResult>
  streamTurn(input: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent>
  /**
   * Condenses the older part of a conversation (#481). Null when no model is available or its
   * answer cannot be used; the caller then falls back to a summary without a model.
   */
  summarize?(input: AdvisorSummaryRequest): Promise<string | null>
}

/** The KI port in domain language. */
export interface KiPort {
  proposeFromReceipt(receiptId: string): Promise<readonly AiProposal[]>
  explainSource(sourceId: string): Promise<string>
  runAdvisorTurn?(input: AdvisorTurnRequest): Promise<AdvisorTurnResult>
}

export function acceptAiProposal(proposal: AiProposal, itemId: string): Item {
  const source: Source =
    proposal.receiptId !== undefined
      ? { kind: 'ki-vorschlag', proposalId: proposal.id, receiptId: proposal.receiptId }
      : { kind: 'ki-vorschlag', proposalId: proposal.id }
  return { id: itemId, incomeType: proposal.incomeType, amount: proposal.amount, source }
}
