// ADR-0101 §16 + REQ-015 amended: with the self-employment switch on, the pre-filing check does not stop
// at the Gewerbe gate, and a person without employment needs no Lohnsteuerbescheinigung.
import { describe, expect, it } from 'vitest'
import { calculateEmployeeStatus } from '../domains/employee'
import { wageTaxCertificateStatus } from '../domains/lstb'
import { calculateWorkdays } from '../common/workdays'
import { checkPlausibility, type PlausibilityInput } from './plausibility'

const emptyLstb = wageTaxCertificateStatus({ bruttoarbeitslohn: { kind: 'offen' }, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' } })
const input = (job: string): PlausibilityInput => ({
  lstb: emptyLstb,
  workdays: calculateWorkdays({ year: 2025, workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 0, homeOfficeDays: 0 }),
  status: calculateEmployeeStatus({ income: 0, incomeRelatedExpenses: 0, specialExpenses: 0, openItems: 0, conflicts: 0, gated: ['Gewerbe'] }),
  recordedNotCalculated: 0,
  answers: { job },
})

describe('pre-filing check of the self-employed', () => {
  it('switch off: as before, the gate and the missing LStB block', () => {
    const result = checkPlausibility(input('Selbstständig'))
    expect(result.kind === 'nicht-einreichbar' ? result.conflicts.map((c) => c.kind) : []).toEqual(['lstb-offen', 'gated-einkunftsart'])
  })

  it('switch on, only self-employed: no gate, no LStB', () => {
    expect(checkPlausibility(input('Selbstständig'), { selfEmployment: true })).toMatchObject({ kind: 'einreichbar' })
  })

  it('switch on, „Beides“: the job still needs its LStB, the business no gate', () => {
    const result = checkPlausibility(input('Beides'), { selfEmployment: true })
    expect(result.kind === 'nicht-einreichbar' ? result.conflicts.map((c) => c.kind) : []).toEqual(['lstb-offen'])
  })
})
