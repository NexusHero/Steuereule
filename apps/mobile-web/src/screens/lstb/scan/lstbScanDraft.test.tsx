import { describe, expect, it } from 'vitest'
import { evaluateStagedDraft, type StagedFieldDraft, type StagedLstbScanDraft } from './lstbScanDraft'

function field(text: string, status: 'ok' | 'pruefen', confirmed = status === 'ok'): StagedFieldDraft {
  return { text, status, confirmed, sourceLines: [], calculation: [], reason: null }
}

function draft(fields: StagedLstbScanDraft['fields']): StagedLstbScanDraft {
  return { stage: 'deterministic', receiptId: null, fileName: 'lstb.pdf', taxYearOnDocument: 2025, actionIds: [], fields }
}

describe('evaluateStagedDraft — „Werte übernehmen“ stays blocked until the draft is clean (AC 6)', () => {
  it('blocks on an unconfirmed yellow field', () => {
    const result = evaluateStagedDraft(
      draft({ bruttoarbeitslohn: field('48000', 'ok'), lohnsteuer: field('7600', 'pruefen'), sozialversicherung: field('9000', 'ok') }),
    )
    expect(result.hasUnconfirmedYellow).toBe(true)
    expect(result.hasWiderspruch).toBe(false)
  })

  it('flags a contradiction (Lohnsteuer > Brutto) even when every field is confirmed', () => {
    const result = evaluateStagedDraft(
      draft({ bruttoarbeitslohn: field('10000', 'ok'), lohnsteuer: field('12000', 'pruefen', true), sozialversicherung: field('1000', 'ok') }),
    )
    expect(result.hasUnconfirmedYellow).toBe(false)
    expect(result.hasWiderspruch).toBe(true)
  })

  it('is clean when all values are whole euros, plausible and confirmed', () => {
    const result = evaluateStagedDraft(
      draft({ bruttoarbeitslohn: field('48000', 'ok'), lohnsteuer: field('7600', 'pruefen', true), sozialversicherung: field('9000', 'ok') }),
    )
    expect(result).toMatchObject({ allIntegers: true, hasUnconfirmedYellow: false, hasWiderspruch: false })
  })

  it('lets an unreadable social insurance stay empty and open, without blocking (ADR-0083)', () => {
    const result = evaluateStagedDraft(
      draft({ bruttoarbeitslohn: field('900', 'pruefen', true), lohnsteuer: field('300', 'pruefen', true), sozialversicherung: field('', 'pruefen') }),
    )
    expect(result).toMatchObject({ readyToApply: true, socialInsuranceOpen: true, hasUnconfirmedYellow: false, hasWiderspruch: false })
  })

  it('still blocks when the gross wage is missing', () => {
    expect(evaluateStagedDraft(draft({ bruttoarbeitslohn: field('', 'pruefen'), lohnsteuer: field('300', 'ok'), sozialversicherung: field('', 'pruefen') })).readyToApply).toBe(false)
  })
})
