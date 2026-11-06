import type { Item, Source } from './berechnung.js'
import type { IncomeType } from './einkunftsarten.js'

/** The schema the LLM must answer. */
export interface AiProposal {
  readonly id: string
  readonly incomeType: IncomeType
  readonly amount: number
  readonly receiptId?: string
}

/** The KI port in domain language. */
export interface KiPort {
  proposeFromReceipt(receiptId: string): Promise<readonly AiProposal[]>
  explainSource(sourceId: string): Promise<string>
}

export function acceptAiProposal(proposal: AiProposal, itemId: string): Item {
  const source: Source =
    proposal.receiptId !== undefined
      ? { art: 'ki-vorschlag', proposalId: proposal.id, receiptId: proposal.receiptId }
      : { art: 'ki-vorschlag', proposalId: proposal.id }
  return { id: itemId, incomeType: proposal.incomeType, amount: proposal.amount, source }
}
