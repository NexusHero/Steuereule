import { describe, expect, it } from 'vitest'
import { evaluateStagedDraft, type StagedFieldDraft, type StagedLstbScanDraft } from './lstbScanDraft'

function field(text: string, status: 'ok' | 'pruefen', confirmed = status === 'ok'): StagedFieldDraft {
  return { text, status, confirmed, sourceLines: [], calculation: [], reason: null }
}

function draft(fields: StagedLstbScanDraft['fields']): StagedLstbScanDraft {
  return { stage: 'deterministic', receiptId: null, fileName: 'lstb.pdf', taxYearOnDocument: 2025, actionIds: [], fields, lines: {}, employer: null }
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

  it('takes a corrected amount with cents as whole euros instead of silently blocking (real case 2024)', () => {
    const result = evaluateStagedDraft(
      draft({ bruttoarbeitslohn: field('78565', 'pruefen', true), lohnsteuer: field('18669', 'pruefen', true), sozialversicherung: field('18145,99', 'pruefen', true) }),
    )
    expect(result).toMatchObject({ readyToApply: true, hasUnconfirmedYellow: false, hasWiderspruch: false })
    expect(result.values.sozialversicherung).toBe(18146)
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

describe('evaluateStagedDraft — the further lines', () => {
  const three = { bruttoarbeitslohn: field('48000', 'ok'), lohnsteuer: field('7200', 'ok'), sozialversicherung: field('9555', 'ok') }

  it('rounds whole-euro lines as the mask does and keeps the cents of the Soli', () => {
    const result = evaluateStagedDraft({ ...draft(three), lines: { kirchensteuer: field('576,40', 'ok'), solidaritaetszuschlag: field('12,34', 'ok'), kvArbeitnehmer: field('', 'ok') } })
    expect(result.lineValues).toEqual({ kirchensteuer: 576, solidaritaetszuschlag: 12.34 })
    expect(result.readyToApply).toBe(true)
  })

  it('blocks on an unconfirmed yellow line and on a line that is no amount', () => {
    expect(evaluateStagedDraft({ ...draft(three), lines: { rvArbeitgeber: field('4474', 'pruefen') } }).hasUnconfirmedYellow).toBe(true)
    expect(evaluateStagedDraft({ ...draft(three), lines: { rvArbeitgeber: field('viel', 'ok') } }).readyToApply).toBe(false)
  })

  it('blocks on a yellow employer until it is confirmed', () => {
    const employer = { text: 'Beispielwerke GmbH', status: 'pruefen' as const, confirmed: false, reason: 'ocr_source' as const }
    expect(evaluateStagedDraft({ ...draft(three), employer }).hasUnconfirmedYellow).toBe(true)
    expect(evaluateStagedDraft({ ...draft(three), employer: { ...employer, confirmed: true } }).hasUnconfirmedYellow).toBe(false)
  })
})

