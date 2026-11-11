import { describe, expect, it } from 'vitest'
import {
  churchMembership,
  churchTaxMixedMarriage,
  churchTaxOnIncome,
  churchTaxRate,
  flatRateTaxWithChurchTax,
  kirchgeldFor,
} from './church-tax'
import { CHURCH_RULES, KIRCHGELD_TABLE_FROM_2025, KIRCHGELD_TABLE_UNTIL_2024 } from './church-tax.data'
import { GERMAN_STATES } from '../common/public-holidays'

const point = (n: number) => ({ from: n, to: n })

describe('churchMembership', () => {
  it('maps the ELStAM keys: VD is no member, empty or unknown is unknown, EV/RK are their church', () => {
    expect(churchMembership('VD')).toEqual({ kind: 'none' })
    expect(churchMembership(null)).toEqual({ kind: 'unknown' })
    expect(churchMembership(undefined)).toEqual({ kind: 'unknown' })
    expect(churchMembership('')).toEqual({ kind: 'unknown' })
    expect(churchMembership('EV')).toEqual({ kind: 'member', church: 'EV' })
    expect(churchMembership('RK')).toEqual({ kind: 'member', church: 'RK' })
    expect(churchMembership('AK')).toEqual({ kind: 'member', church: 'other' })
  })
})

describe('churchTaxRate (§ 51a EStG with the state laws)', () => {
  it('Bayern and Baden-Württemberg 8 %, Berlin 9 %, unknown state the range 8–9 %', () => {
    expect(churchTaxRate('BY', 'RK', null)).toEqual(point(0.08))
    expect(churchTaxRate('BW', 'EV', '70173')).toEqual(point(0.08))
    expect(churchTaxRate('BE', 'EV', '10115')).toEqual(point(0.09))
    expect(churchTaxRate(null, 'EV', null)).toEqual({ from: 0.08, to: 0.09 })
  })

  it('Catholics in Bad Wimpfen belong to the Diözese Mainz and pay 9 %', () => {
    expect(churchTaxRate('BW', 'RK', '74206')).toEqual(point(0.09))
    expect(churchTaxRate('BW', 'EV', '74206')).toEqual(point(0.08))
  })
})

describe('churchTaxOnIncome', () => {
  const ev = { kind: 'member', church: 'EV' } as const

  it('no member: nothing, and no hint', () => {
    expect(churchTaxOnIncome({ year: 2025, membership: { kind: 'none' }, state: 'BE', postalCode: null, basis: point(10_000), zvE: point(50_000) })).toEqual({ kind: 'none' })
  })

  it('unknown confession: honest "offen", never a silent 0 €', () => {
    expect(churchTaxOnIncome({ year: 2025, membership: { kind: 'unknown' }, state: 'BE', postalCode: null, basis: point(10_000), zvE: point(50_000) })).toEqual({
      kind: 'offen',
      reason: 'konfession-fehlt',
    })
  })

  it('Berlin, 9 %, rounded down to the euro', () => {
    // 10.999 € × 9 % = 989,91 € → 989 €
    expect(churchTaxOnIncome({ year: 2025, membership: ev, state: 'BE', postalCode: null, basis: point(10_999), zvE: point(50_000) })).toEqual({
      kind: 'spanne',
      due: point(989),
      capOnApplication: false,
    })
  })

  it('unknown state: the range 8–9 %', () => {
    expect(churchTaxOnIncome({ year: 2025, membership: ev, state: null, postalCode: null, basis: point(10_000), zvE: point(50_000) })).toMatchObject({
      kind: 'spanne',
      due: { from: 800, to: 900 },
    })
  })

  it('Berlin caps automatically at 3 % of the zvE (high income)', () => {
    // 400.000 € zvE: ESt 162.000 € × 9 % = 14.580 €; cap 3 % × 400.000 = 12.000 €
    expect(churchTaxOnIncome({ year: 2025, membership: ev, state: 'BE', postalCode: null, basis: point(162_000), zvE: point(400_000) })).toMatchObject({
      kind: 'spanne',
      due: point(12_000),
    })
  })

  it('NRW grants the cap only on application: assessed uncapped, with the hint', () => {
    expect(churchTaxOnIncome({ year: 2025, membership: ev, state: 'NW', postalCode: null, basis: point(162_000), zvE: point(400_000) })).toEqual({
      kind: 'spanne',
      due: point(14_580),
      capOnApplication: true,
    })
  })

  it('Bayern has no cap at all', () => {
    expect(churchTaxOnIncome({ year: 2025, membership: { kind: 'member', church: 'RK' }, state: 'BY', postalCode: null, basis: point(162_000), zvE: point(400_000) })).toEqual({
      kind: 'spanne',
      due: point(12_960),
      capOnApplication: false,
    })
  })

  it('a state without an official cap value is "offen" only where the cap could bite', () => {
    const high = churchTaxOnIncome({ year: 2025, membership: ev, state: 'HE', postalCode: null, basis: point(162_000), zvE: point(400_000) })
    expect(high).toEqual({ kind: 'offen', reason: 'kappung-unbekannt' })
    // 50.000 € zvE: 9 % × 10.000 € = 900 € < 2,75 % × 50.000 € = 1.375 € → the cap cannot matter
    const normal = churchTaxOnIncome({ year: 2025, membership: ev, state: 'HE', postalCode: null, basis: point(10_000), zvE: point(50_000) })
    expect(normal).toMatchObject({ kind: 'spanne', due: point(900) })
  })
})

describe('kirchgeldFor', () => {
  it('uses the table up to 2024 and the raised table from 2025', () => {
    expect(kirchgeldFor(2024, 45_000)).toBe(96)
    expect(kirchgeldFor(2025, 45_000)).toBe(0)
    expect(kirchgeldFor(2025, 50_000)).toBe(96)
    expect(kirchgeldFor(2025, 57_499)).toBe(96)
    expect(kirchgeldFor(2025, 57_500)).toBe(156)
    expect(kirchgeldFor(2025, 500_000)).toBe(3_600)
    expect(kirchgeldFor(2023, 310_000)).toBe(3_600)
  })

  it('both tables have 13 steps from 96 € to 3.600 €', () => {
    for (const table of [KIRCHGELD_TABLE_UNTIL_2024, KIRCHGELD_TABLE_FROM_2025]) {
      expect(table).toHaveLength(13)
      expect(table[0]!.annualEur).toBe(96)
      expect(table.at(-1)!.annualEur).toBe(3_600)
    }
  })
})

describe('churchTaxMixedMarriage (glaubensverschiedene Ehe)', () => {
  const ev = { kind: 'member', church: 'EV' } as const

  it('the member pays church tax on their share, or the besonderes Kirchgeld if that is higher', () => {
    // Joint ESt 20.000 €, member's share 10 % → 2.000 € × 9 % = 180 €; Kirchgeld for 90.000 € zvE (2025) = 396 €
    expect(
      churchTaxMixedMarriage({ year: 2025, membership: ev, state: 'SN', postalCode: null, basis: point(20_000), zvE: point(90_000), memberShare: point(0.1), kirchgeldBase: point(90_000) }),
    ).toMatchObject({ kind: 'spanne', due: point(396) })
    // Member's share 60 % → 1.080 € > 396 €
    expect(
      churchTaxMixedMarriage({ year: 2025, membership: ev, state: 'SN', postalCode: null, basis: point(20_000), zvE: point(90_000), memberShare: point(0.6), kirchgeldBase: point(90_000) }),
    ).toMatchObject({ kind: 'spanne', due: point(1_080) })
  })

  it('Bayern levies no Kirchgeld: only the church tax on the share', () => {
    expect(
      churchTaxMixedMarriage({ year: 2025, membership: { kind: 'member', church: 'RK' }, state: 'BY', postalCode: null, basis: point(20_000), zvE: point(90_000), memberShare: point(0.1), kirchgeldBase: point(90_000) }),
    ).toMatchObject({ kind: 'spanne', due: point(160) })
  })

  it('a state without an official Kirchgeld rule is "offen" once the table would apply', () => {
    expect(
      churchTaxMixedMarriage({ year: 2025, membership: ev, state: 'HH', postalCode: null, basis: point(20_000), zvE: point(90_000), memberShare: point(0.1), kirchgeldBase: point(90_000) }),
    ).toEqual({ kind: 'offen', reason: 'kirchgeld-unbekannt' })
    // Below the first step the Kirchgeld cannot apply anywhere.
    expect(
      churchTaxMixedMarriage({ year: 2025, membership: ev, state: 'HH', postalCode: null, basis: point(5_000), zvE: point(40_000), memberShare: point(0.5), kirchgeldBase: point(40_000) }),
    ).toMatchObject({ kind: 'spanne', due: point(225) })
  })
})

describe('flatRateTaxWithChurchTax (§ 32d Abs. 1 Satz 4 EStG)', () => {
  it('without church tax: 25 % of the capital income', () => {
    expect(flatRateTaxWithChurchTax(10_000, 0)).toEqual({ incomeTax: 2_500, churchTax: 0 })
  })

  it('with 9 %: ESt = e / (4 + k), church tax = k × ESt', () => {
    // 10.000 / 4,09 = 2.444,98 → 2.444 €; church tax 9 % × 2.444 = 219,96 → 219 €
    expect(flatRateTaxWithChurchTax(10_000, 0.09)).toEqual({ incomeTax: 2_444, churchTax: 219 })
    // 8 %: 10.000 / 4,08 = 2.450,98 → 2.450 €; 196 €
    expect(flatRateTaxWithChurchTax(10_000, 0.08)).toEqual({ incomeTax: 2_450, churchTax: 196 })
  })
})

describe('church tax data', () => {
  it('covers every state for both churches, and every known rule names its source', () => {
    for (const state of GERMAN_STATES) {
      for (const church of ['EV', 'RK'] as const) {
        const rules = CHURCH_RULES[state][church]
        if (rules.cap.kind !== 'unknown') expect(rules.cap.source.length, `${state} ${church}`).toBeGreaterThan(5)
        for (const k of rules.kirchgeld) expect(k.source.length, `${state} ${church}`).toBeGreaterThan(5)
      }
    }
  })
})
