import type { Item, Source } from '../engine/berechnung'
import type { IncomeType } from '../domains/income-types'
import type { AdvisorActionProposal, AdvisorMessageMeta, AdvisorTwoPathsProposal, CaseDigest } from './advisor'
import type { Screen } from './marking'

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
}

export interface AdvisorTurnResult {
  readonly replyText: string
  readonly meta: AdvisorMessageMeta
  readonly mode: 'langgraph' | 'deterministic_fallback'
  readonly provider?: string | undefined
  readonly model?: string | undefined
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
export const ADVISOR_QUICK_ACTIONS = ['forgotten_check'] as const
export type AdvisorQuickAction = (typeof ADVISOR_QUICK_ACTIONS)[number]

export type AdvisorStreamEvent =
  | { readonly event: 'status'; readonly data: { readonly text: string } }
  | { readonly event: 'tool'; readonly data: { readonly name: string; readonly label: string } }
  | { readonly event: 'token'; readonly data: { readonly text: string } }
  | { readonly event: 'choices'; readonly data: { readonly choices: readonly string[] } }
  | { readonly event: 'action'; readonly data: AdvisorActionProposal }
  | { readonly event: 'twoPaths'; readonly data: AdvisorTwoPathsProposal }
  | { readonly event: 'ui_command'; readonly data: AdvisorUiCommand }
  /** The full current plan (never a diff), sent whenever the model updates it. */
  | { readonly event: 'plan'; readonly data: { readonly steps: readonly AdvisorPlanStep[] } }
  | { readonly event: 'error'; readonly data: { readonly code: string; readonly message: string } }
  | { readonly event: 'done'; readonly data: unknown }

/** Tells the workbench to open a mask itself, e.g. when the model aimed at a field it may never write. */
export interface AdvisorUiCommand {
  readonly openMask: Screen
  readonly focus: string
}

export interface AdvisorEnginePort {
  runTurn(input: AdvisorTurnRequest): Promise<AdvisorTurnResult>
  streamTurn(input: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent>
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
