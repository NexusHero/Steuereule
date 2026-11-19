import { describe, expect, it } from 'vitest'
import { incomeTax, splittingTariff } from '../math/tarif'
import { coupleComparison } from './couple-comparison'

// ADR-0099 §6 — Paare: for every Bescheid year of a couple, what the Veranlagungsart brought, in both
// directions. Exact only for two single returns; a joint Bescheid is split by the filed facts, „etwa“.

const filedJoint = {
  bruttoarbeitslohnA: 54_900,
  werbungskostenA: 2_960,
  bruttoarbeitslohnB: 39_000,
  werbungskostenB: 1_930,
  vorsorgeaufwand: 17_968,
  sonderausgaben: 72,
}

describe('coupleComparison', () => {
  it('compares two single returns exactly on the assessed zvE', () => {
    const result = coupleComparison({ year: 2022, filedAs: 'einzel', zveA: 36_000, zveB: 26_000, progressionClause: { kind: 'keine' } })
    const single = incomeTax(36_000, 2022) + incomeTax(26_000, 2022)
    const joint = splittingTariff(36_000, 26_000, 2022)
    expect(result).toMatchObject({ status: 'gerechnet', filedAs: 'einzel', approximate: false, singleTax: single, jointTax: joint, jointSaving: single - joint, jointSavingRange: null })
  })

  it('splits a joint Bescheid by the filed facts and says it is approximate', () => {
    const result = coupleComparison({ year: 2024, filedAs: 'zusammen', zvE: 71_271, split: filedJoint, progressionClause: { kind: 'keine' } })
    expect(result.status).toBe('gerechnet')
    if (result.status !== 'gerechnet') return
    expect(result.approximate).toBe(true)
    expect(result.jointTax).toBe(splittingTariff(71_271, 0, 2024))
    expect(result.jointSaving).toBeGreaterThan(0)
    // The deductions cannot be attributed exactly: the range spans the ways of splitting them.
    expect(result.jointSavingRange).not.toBeNull()
    expect(result.jointSavingRange!.from).toBeLessThanOrEqual(result.jointSaving)
    expect(result.jointSavingRange!.to).toBeGreaterThanOrEqual(result.jointSaving)
  })

  it('is open without a split of the joint Bescheid', () => {
    expect(coupleComparison({ year: 2024, filedAs: 'zusammen', zvE: 71_271, split: null, progressionClause: { kind: 'keine' } })).toEqual({ year: 2024, status: 'unvollstaendig', missing: ['aufteilung'] })
  })

  it('is open without the assessed zvE', () => {
    expect(coupleComparison({ year: 2022, filedAs: 'einzel', zveA: 36_000, zveB: undefined, progressionClause: { kind: 'keine' } })).toEqual({ year: 2022, status: 'unvollstaendig', missing: ['personB.zuVersteuerndesEinkommen'] })
  })

  it('says so for a year without a tariff', () => {
    expect(coupleComparison({ year: 2021, filedAs: 'einzel', zveA: 36_000, zveB: 26_000, progressionClause: { kind: 'keine' } })).toEqual({ year: 2021, status: 'tarif-fehlt' })
  })
})
