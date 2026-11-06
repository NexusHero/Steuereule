import { describe, expect, it } from 'vitest'
import { acceptAiProposal, type AiProposal } from './ki-port'

// ADR-014/048 — the port contract. The deterministic core is fully testable with NO KiPort
// injected: `nehmeVorschlagAn` is a pure function over an already-materialized suggestion.
// The property under test: a Vorschlag is NOT a Posten until accepted, and acceptance
// attaches the "ki-vorschlag" origin so "jede Zahl trägt Herkunft" survives the step.

describe('nehmeVorschlagAn — a suggestion becomes a Posten only by acceptance (ADR-014)', () => {
  it('produces a Posten with the suggestion’s Einkunftsart and amount', () => {
    const proposal: AiProposal = { id: 'v1', incomeType: 'Vermietung', amount: 480 }
    expect(acceptAiProposal(proposal, 'p1')).toEqual({
      id: 'p1',
      incomeType: 'Vermietung',
      amount: 480,
      source: { art: 'ki-vorschlag', proposalId: 'v1' },
    })
  })

  it('records the Beleg it was derived from, when one is present (ADR-014 "Beleg + KI-Vorschlag, bestätigt")', () => {
    const proposal: AiProposal = { id: 'v1', incomeType: 'Kapital', amount: 123, receiptId: 'b1' }
    expect(acceptAiProposal(proposal, 'p1').source).toEqual({
      art: 'ki-vorschlag',
      proposalId: 'v1',
      receiptId: 'b1',
    })
  })

  it('a suggestion without a Beleg carries no belegId on its Quelle', () => {
    const proposal: AiProposal = { id: 'v1', incomeType: 'Kapital', amount: 123 }
    const items = acceptAiProposal(proposal, 'p1')
    expect('receiptId' in items.source).toBe(false)
  })
})
