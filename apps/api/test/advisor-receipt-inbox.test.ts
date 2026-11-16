import { describe, expect, it } from 'vitest'
import { buildReceiptInbox, describeReceiptInboxForPrompt, RECEIPT_INBOX_CAP } from '../src/advisor/advisor-receipt-inbox.js'
import { checkPiiFree } from '../src/ki/ki.adapter.js'
import { buildCaseSystemPrompt } from '../src/ki/advisor-prompt.js'
import type { ReceiptRecord } from '../src/receipt/receipt.repository.js'

function record(overrides: Partial<ReceiptRecord> = {}): ReceiptRecord {
  return { id: 'r-1', userId: 'u', fileName: 'Max_Mustermann_Krankenkasse.pdf', taxYear: null, proposalDismissed: false, createdAt: new Date(), updatedAt: new Date(), ...overrides }
}

describe('Belege inbox for the owl', () => {
  it('lists kind, dates, assignment, holder role and draft state, and never the file name', () => {
    const inbox = buildReceiptInbox(
      [
        record({ id: 'a', kind: 'Krankenkasse', belegdatum: '2025-11-03', taxYear: 2025, holders: ['B'], holderTaxYear: 2025 }),
        record({ id: 'b', kind: 'Sonstiges', zahlungsdatum: '2025-02-10' }),
      ],
      2025,
      [{ receiptId: 'a', status: 'pending' }],
    )
    expect(inbox.total).toBe(2)
    expect(inbox.items[0]).toEqual({ kind: 'Krankenkasse', belegdatum: '2025-11-03', zahlungsdatum: null, assignment: 'zugeordnet', year: 2025, holder: 'B', values: 'entwurf-offen' })
    expect(inbox.items[1]).toMatchObject({ assignment: 'vorgeschlagen', year: 2025, holder: null, values: 'keine' })
    const text = JSON.stringify(inbox) + describeReceiptInboxForPrompt(inbox).join('\n')
    expect(text).not.toContain('Mustermann')
    expect(text).not.toContain('.pdf')
    expect(() => checkPiiFree(inbox)).not.toThrow()
  })

  it('reports a value taken over, and a child only as a role', () => {
    const inbox = buildReceiptInbox([record({ id: 'a', taxYear: 2025, holders: ['kind:abc'], holderTaxYear: 2025 })], 2025, [{ receiptId: 'a', status: 'applied' }])
    expect(inbox.items[0]).toMatchObject({ holder: 'kind', values: 'uebernommen' })
  })

  it('leaves out a Beleg of another year but keeps an unbound one and a conflict that points here', () => {
    const inbox = buildReceiptInbox(
      [
        record({ id: 'other', taxYear: 2024 }),
        record({ id: 'unbound' }),
        record({ id: 'conflict', taxYear: 2024, belegdatum: '2025-05-01', zahlungsdatum: '2025-05-02' }),
      ],
      2025,
      [],
    )
    expect(inbox.items.map((i) => i.assignment).sort()).toEqual(['konflikt', 'ungebunden'])
  })

  it('caps the list at the newest and says so', () => {
    const many = Array.from({ length: RECEIPT_INBOX_CAP + 5 }, (_, i) => record({ id: `r-${i}`, taxYear: 2025, kind: 'Sonstiges' }))
    const inbox = buildReceiptInbox(many, 2025, [])
    expect(inbox.items).toHaveLength(RECEIPT_INBOX_CAP)
    expect(inbox.total).toBe(RECEIPT_INBOX_CAP + 5)
    expect(inbox.truncated).toBe(true)
    expect(describeReceiptInboxForPrompt(inbox).join('\n')).toContain(`die neuesten ${RECEIPT_INBOX_CAP}`)
  })

  it('writes nothing for an empty inbox, so the prompt of a user without Belege is unchanged', () => {
    expect(describeReceiptInboxForPrompt(undefined)).toEqual([])
    expect(describeReceiptInboxForPrompt({ items: [], total: 0, truncated: false })).toEqual([])
  })

  it('puts the list and the rule for talking about it into the case prompt, once', () => {
    const inbox = buildReceiptInbox([record({ taxYear: 2025, kind: 'Krankenkasse', belegdatum: '2025-11-03' })], 2025, [])
    const digest = {
      taxYear: 2025,
      filingStatus: 'einzel',
      lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
      crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
      commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null },
      catalogExpenses: { hasTraining: false, trainingCostsEur: null, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null, workExpenses: { professionalBodiesEur: null, workEquipmentEur: null, accountFeesEur: null, otherWorkExpensesEur: null }, childcareDeductionEur: 0 },
      childrenCount: 0,
      childrenAges: [],
      rentalObjectsCount: 0,
      capitalGainEur: null,
      priorYearComparison: { donationsEur: null },
      openOwlHints: [],
      printoutMissingFields: [],
      estimatedRefundEur: null,
      furtherFacts: {
        answeredQuestions: 3,
        filingStatusAnswered: true,
        singleParent: false,
        pension: null,
        rentals: { rentEur: null, expensesEur: null, loanInterestEur: null },
        capital: { withheldTaxEur: null, saverAllowanceUsedEur: null, depot: null },
        sideJobGrossEur: null,
        wageReplacementEur: null,
        severanceEur: null,
        healthCostsEur: null,
        householdServicesEur: null,
        filingDeadline: null,
        voluntaryFilingDeadline: null,
        receiptInbox: inbox,
      },
    } as never
    const prompt = buildCaseSystemPrompt(digest, undefined, false)
    expect(prompt).toContain('Belege im Posteingang')
    expect(prompt).toContain('Krankenkasse, Belegdatum 03.11.2025')
    expect(prompt).toContain('Behaupte nie, einen Beleg gelesen zu haben')
    expect(prompt.match(/Belegdatum 03\.11\.2025/g)).toHaveLength(1)
    expect(prompt).not.toContain('"receiptInbox"')
  })
})
