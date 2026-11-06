import { describe, expect, it } from 'vitest'
import {
  checkPlausibility,
  type Notice,
  type PlausibilityResult,
  type PlausibilityInput,
  type Conflict,
} from './plausibilitaet'
import { calculateEmployeeStatus, type EmployeeStatus } from './angestellte'
import { wageTaxCertificateStatus } from './lstb'
import { calculateWorkdays, type WorkdaysResult } from './werktage'

/** Narrows to the blocker list (empty when einreichbar — the guard, not a cast). */
function conflicts(r: PlausibilityResult): readonly Conflict[] {
  return r.kind === 'nicht-einreichbar' ? r.conflicts : []
}

/** Hinweise live on both variants, so this is a convenience, not a narrowing. */
function notices(r: PlausibilityResult): readonly Notice[] {
  return r.notices
}

function inputs(over: {
  lstb?: ReturnType<typeof wageTaxCertificateStatus>
  workdays?: WorkdaysResult
  status?: EmployeeStatus
  recordedNotCalculated?: number
} = {}): PlausibilityInput {
  return {
    lstb:
      over.lstb ??
      wageTaxCertificateStatus({ bruttoarbeitslohn: { kind: 'erfasst', value: 50000 }, lohnsteuer: { kind: 'erfasst', value: 9000 }, sozialversicherung: { kind: 'erfasst', value: 10000 } }),
    workdays: over.workdays ?? calculateWorkdays({ year: 2026, workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 40 }),
    status:
      over.status ??
      calculateEmployeeStatus({ income: 50000, incomeRelatedExpenses: 1200, specialExpenses: 3000, openItems: 0, conflicts: 0, gated: [] }),
    recordedNotCalculated: over.recordedNotCalculated ?? 0,
  }
}

describe('pruefePlausibilitaet (M2)', () => {
  it('a complete, consistent case is einreichbar', () => {
    expect(checkPlausibility(inputs())).toEqual({ kind: 'einreichbar', notices: [] })
  })

  it('an open LStB field blocks, naming the field', () => {
    const r = checkPlausibility(
      inputs({ lstb: wageTaxCertificateStatus({ bruttoarbeitslohn: { kind: 'offen' }, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' } }) }),
    )
    expect(conflicts(r)).toEqual([{ art: 'lstb-offen', fields: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'] }])
  })

  it('an unreadable ("unklar") LStB field blocks separately from merely-open', () => {
    const state = wageTaxCertificateStatus({ bruttoarbeitslohn: { kind: 'erfasst', value: 50000 }, lohnsteuer: { kind: 'unklar' }, sozialversicherung: { kind: 'erfasst', value: 10000 } })
    expect(conflicts(checkPlausibility(inputs({ lstb: state })))).toContainEqual({ art: 'lstb-unklar', fields: ['lohnsteuer'] })
  })

  it('an LStB contradiction blocks', () => {
    const state = wageTaxCertificateStatus({ bruttoarbeitslohn: { kind: 'erfasst', value: 1000 }, lohnsteuer: { kind: 'erfasst', value: 2000 }, sozialversicherung: { kind: 'erfasst', value: 0 } })
    expect(conflicts(checkPlausibility(inputs({ lstb: state })))).toContainEqual({ art: 'lstb-widerspruch' })
  })

  it('a werktage contradiction blocks', () => {
    const work = calculateWorkdays({ year: 2026, workdays: [1], vacationDays: 0, sickDays: 0, homeOfficeDays: 99 })
    expect(conflicts(checkPlausibility(inputs({ workdays: work })))).toContainEqual({ art: 'werktage-widerspruch' })
  })

  it('a gated Einkunftsart blocks, naming it', () => {
    const status = calculateEmployeeStatus({ income: 0, incomeRelatedExpenses: 0, specialExpenses: 0, openItems: 0, conflicts: 0, gated: ['Kapital'] })
    expect(conflicts(checkPlausibility(inputs({ status })))).toContainEqual({ art: 'gated-einkunftsart', incomeType: 'Kapital' })
  })

  it('captured-but-not-computed amounts are a Hinweis, never a blocker', () => {
    expect(checkPlausibility(inputs({ recordedNotCalculated: 24650 }))).toEqual({
      kind: 'einreichbar',
      notices: [{ art: 'erfasst-nicht-gerechnet', amount: 24650 }],
    })
  })

  it('Werbungskosten over Einnahmen is a Hinweis (possible Verlust, not a contradiction)', () => {
    const status = calculateEmployeeStatus({ income: 1000, incomeRelatedExpenses: 1500, specialExpenses: 0, openItems: 0, conflicts: 0, gated: [] })
    expect(notices(checkPlausibility(inputs({ status })))).toContainEqual({
      art: 'werbungskosten-uebersteigt-einnahmen',
      werbungskosten: 1500,
      einnahmen: 1000,
    })
  })
})
