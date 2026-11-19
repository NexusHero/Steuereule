import { describe, expect, it } from 'vitest'
import { assessmentWait } from './history-documents'

// ADR-0099 §9 — Unterlagen: how long the Bescheid took, and when asking the Finanzamt is worth it.

describe('assessmentWait', () => {
  it('counts the days and weeks from the submission to the Bescheid', () => {
    expect(assessmentWait('2026-09-21', '2026-11-02', '2026-11-19')).toEqual({ days: 42, weeks: 6, pending: false, askTaxOffice: false })
  })

  it('counts up to today while the Bescheid is pending', () => {
    expect(assessmentWait('2026-10-12', null, '2026-11-19')).toEqual({ days: 38, weeks: 5, pending: true, askTaxOffice: false })
  })

  it('says asking is worth it after twelve weeks without a Bescheid', () => {
    expect(assessmentWait('2026-08-20', null, '2026-11-12').askTaxOffice).toBe(false)
    expect(assessmentWait('2026-08-20', null, '2026-11-13').askTaxOffice).toBe(true)
  })
})
