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
}

export interface AdvisorTurnResult {
  readonly replyText: string
  readonly meta: AdvisorMessageMeta
  readonly mode: 'langgraph' | 'deterministic_fallback'
  readonly provider?: string | undefined
  readonly model?: string | undefined
}

export type AdvisorStreamEvent =
  | { readonly event: 'status'; readonly data: { readonly text: string } }
  | { readonly event: 'tool'; readonly data: { readonly name: string; readonly label: string } }
  | { readonly event: 'token'; readonly data: { readonly text: string } }
  | { readonly event: 'choices'; readonly data: { readonly choices: readonly string[] } }
  | { readonly event: 'action'; readonly data: AdvisorActionProposal }
  | { readonly event: 'twoPaths'; readonly data: AdvisorTwoPathsProposal }
  | { readonly event: 'done'; readonly data: unknown }

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
