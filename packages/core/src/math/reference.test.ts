// #450 Teil 6A/6B: the income tax formula against official BMF values, and structural rules that
// would have caught the 2023 coefficient error (Zone 2/3 used 2021 values) immediately.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GERMAN_STATES, publicHolidays } from '../common/public-holidays'
import { TAX_YEARS, incomeTax, soliExemptionLimits, solidaritaetszuschlag, splittingTariff, zoneBoundaries, type IncomeTaxYear } from './tarif'
import { getTaxYearParameters } from './tax-parameters'

const here = path.dirname(fileURLToPath(import.meta.url))
const YEARS = Object.keys(TAX_YEARS).map(Number) as IncomeTaxYear[]

interface ReferenceCase {
  readonly zvE: number
  readonly splitting: boolean
  readonly incomeTax: number
  readonly soli: number
}
interface ReferenceFixture {
  readonly source: string
  readonly url: string
  readonly retrieved: string
  readonly year: IncomeTaxYear
  readonly cases: readonly ReferenceCase[]
}

const fixture = (year: IncomeTaxYear): ReferenceFixture =>
  JSON.parse(readFileSync(path.join(here, '__fixtures__', `bmf-reference.${year}.json`), 'utf8')) as ReferenceFixture

describe('6A — tarifliche Einkommensteuer gegen den BMF-Rechner', () => {
  for (const year of YEARS) {
    const ref = fixture(year)

    it(`${year}: the fixture names its source and retrieval date`, () => {
      expect(ref.source).toMatch(/BMF/)
      expect(ref.url).toMatch(/^https:\/\/www\.bmf-steuerrechner\.de\//)
      expect(ref.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(ref.cases.length).toBeGreaterThanOrEqual(20)
    })

    it(`${year}: every Grundtarif value matches to the euro`, () => {
      const wrong = ref.cases
        .filter((c) => !c.splitting)
        .map((c) => ({ zvE: c.zvE, bmf: c.incomeTax, core: incomeTax(c.zvE, year) }))
        .filter((c) => c.bmf !== c.core)
      expect(wrong).toEqual([])
    })

    it(`${year}: every Splittingtarif value matches to the euro`, () => {
      const wrong = ref.cases
        .filter((c) => c.splitting)
        .map((c) => ({ zvE: c.zvE, bmf: c.incomeTax, core: splittingTariff(c.zvE / 2, c.zvE / 2, year) }))
        .filter((c) => c.bmf !== c.core)
      expect(wrong).toEqual([])
    })

    // The core rounds the Soli down to whole euros for the euro-based estimate; the BMF keeps the
    // cents (§ 4 SolZG). So the core may be up to 0,99 € below, never above, and Freigrenze and
    // Milderungszone must land exactly where the BMF puts them.
    it(`${year}: the Solidaritätszuschlag matches within the whole-euro rounding (Freigrenze and Milderungszone)`, () => {
      const limits = soliExemptionLimits(year)
      const wrong = ref.cases
        .map((c) => ({ zvE: c.zvE, bmf: c.soli, core: solidaritaetszuschlag(c.incomeTax, c.splitting ? limits.joint : limits.single) }))
        .filter((c) => c.bmf - c.core < 0 || c.bmf - c.core >= 1 || (c.bmf === 0) !== (c.core === 0))
      expect(wrong).toEqual([])
    })
  }
})

/** Continuous formula value without the final rounding, to see jumps that rounding would hide. */
function rawTariff(zvE: number, year: IncomeTaxYear): number {
  const c = TAX_YEARS[year]
  if (zvE <= c.basicAllowance) return 0
  if (zvE <= c.zone2Upper) {
    const y = (zvE - c.basicAllowance) / 10000
    return (c.zone2C1 * y + c.zone2C2) * y
  }
  if (zvE <= c.zone3Upper) {
    const z = (zvE - c.zone2Upper) / 10000
    return (c.zone3C1 * z + c.zone3C2) * z + c.zone3Const
  }
  if (zvE <= c.zone4Upper) return c.zone4Rate * zvE - c.zone4Sub
  return c.zone5Rate * zvE - c.zone5Sub
}

describe('6B — Strukturtests des Tarifs', () => {
  for (const year of YEARS) {
    it(`${year}: the formula is continuous at every zone boundary (jump < 1 €)`, () => {
      const c = TAX_YEARS[year]
      for (const boundary of [c.basicAllowance, ...zoneBoundaries(year)]) {
        const jump = Math.abs(rawTariff(boundary + 1, year) - rawTariff(boundary, year))
        // One euro more income raises the tax by at most the top marginal rate.
        expect(jump, `${year} at ${boundary}`).toBeLessThan(1)
      }
    })

    it(`${year}: more income never means less tax`, () => {
      let previous = 0
      for (let zvE = 0; zvE <= 320_000; zvE += 37) {
        const tax = incomeTax(zvE, year)
        expect(tax, `${year} at ${zvE}`).toBeGreaterThanOrEqual(previous)
        previous = tax
      }
    })
  }
})

const federalHolidays = (year: number): ReadonlySet<string> => {
  const sets = GERMAN_STATES.map((state) => new Set(publicHolidays(year, state)))
  return new Set([...sets[0]!].filter((day) => sets.every((s) => s.has(day))))
}

describe('6B — Fristen', () => {
  for (const year of YEARS) {
    it(`${year}: no filing deadline falls on a weekend or a nationwide public holiday (§ 108 Abs. 3 AO)`, () => {
      const { standardFilingDeadline, voluntaryFilingDeadline } = getTaxYearParameters(year).deadlines
      for (const deadline of [standardFilingDeadline, voluntaryFilingDeadline]) {
        const day = new Date(`${deadline}T00:00:00Z`).getUTCDay()
        expect([0, 6], `${year}: ${deadline}`).not.toContain(day)
        expect(federalHolidays(Number(deadline.slice(0, 4))).has(deadline), `${year}: ${deadline} is a holiday`).toBe(false)
      }
    })
  }
})

/**
 * 6B — every parameter is used somewhere in the calculation, or listed here with the reason it is
 * not (finds e.g. a § 24b relief that is stored but never applied).
 */
const UNUSED_ON_PURPOSE: Readonly<Record<string, string>> = {
  tariff: 'Spiegel von TAX_YEARS; incomeTax() liest die Koeffizienten direkt aus tarif.ts',
  annualBenefitEur: 'abgeleitet (12 × monthlyBenefitEur); gerechnet wird monatsgenau',
  childAllowanceOnlyEur: 'Bestandteil von childAllowanceTotalEur, das gerechnet wird',
  beaAllowanceEur: 'Bestandteil von childAllowanceTotalEur, das gerechnet wird',
  maxOtherProvisionSingleEur: 'gleich maxOtherProvisionEur (2.800 €), das die Grenzgänger-Schätzung liest',
  maxOtherProvisionEmployeeEur: 'Vereinfachung: Angestellte rechnen die Vorsorge über den absetzbaren SV-Anteil (91–93 %), ohne Höchstbetrag 1.900 €',
  churchTaxReductionShare: 'steckt in der exakten Formel des § 32d Abs. 1 Satz 4 EStG, ESt = e / (4 + k) (flatRateTaxWithChurchTax)',
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(full)
    return entry.name.endsWith('.ts') && !/\.(test|bench)\.ts$/.test(entry.name) && entry.name !== 'tax-parameters.ts' ? [full] : []
  })
}

describe('6B — jeder Parameter wird verwendet', () => {
  it('every TaxYearParameters field is read outside tax-parameters.ts, or is a documented exception', () => {
    const roots = [path.join(here, '..'), path.join(here, '../../../../apps/api/src')]
    const code = roots.flatMap(sourceFiles).map((f) => readFileSync(f, 'utf8')).join('\n')
    const params = getTaxYearParameters(2025) as unknown as Record<string, unknown>
    const leafKeys = (obj: Record<string, unknown>): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        value !== null && typeof value === 'object' && !Array.isArray(value) && key !== 'tariff' && key !== 'soliLimits' && key !== 'rates'
          ? leafKeys(value as Record<string, unknown>)
          : [key],
      )
    const unused = leafKeys(params).filter((key) => key !== 'year' && !UNUSED_ON_PURPOSE[key] && !new RegExp(`\\.${key}\\b`).test(code))
    expect(unused).toEqual([])
  })
})
