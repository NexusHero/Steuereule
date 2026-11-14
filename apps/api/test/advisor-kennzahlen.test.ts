import { describe, expect, it } from 'vitest'
import { getTaxYearParameters, type IncomeTaxYear } from '@steuereule/core'
import { ADVISOR_KNOWLEDGE } from '../src/ki/skills.generated.js'

// The owl quotes `kennzahlen` for what the app does not compute, the app computes with the core's
// parameters. Both are written by hand, so a value that differs is a bug in one of them (the 2023
// tariff once was). This test reads the table of the skill and holds it against the core.

const YEARS: readonly IncomeTaxYear[] = [2023, 2024, 2025, 2026]
const text = ADVISOR_KNOWLEDGE.kennzahlen.text

/** The cells of a table row for 2023–2026, a "←" taking the value on its left. */
function yearRow(label: string): string[] {
  const line = text.split('\n').find((row) => row.startsWith(`| ${label} |`))
  if (!line) throw new Error(`kennzahlen has no row "${label}"`)
  const cells = line.split('|').slice(2, 6).map((cell) => cell.trim())
  return cells.map((cell, i) => (cell === '←' ? cells.slice(0, i).filter((left) => left !== '←').pop()! : cell))
}

/** The numbers in a cell: "17.543 / 35.086" → [17543, 35086], "0,38 €" → [0.38]. */
const numbers = (cell: string): number[] => (cell.replace(/\*/g, '').match(/\d[\d.]*(,\d+)?/g) ?? []).map((n) => Number(n.replace(/\./g, '').replace(',', '.')))

describe('kennzahlen of the steuerberater skill agree with the tax core', () => {
  it.each([
    ['Soli-Freigrenze (ESt) Einzel / Zusammen', (y: IncomeTaxYear) => [getTaxYearParameters(y).soliLimits.single, getTaxYearParameters(y).soliLimits.joint]],
    ['Kindergeld je Kind/Monat', (y: IncomeTaxYear) => [getTaxYearParameters(y).children.monthlyBenefitEur]],
    ['Kinderfreibetrag (sächl. Existenzmin., beide Eltern)', (y: IncomeTaxYear) => [getTaxYearParameters(y).children.childAllowanceOnlyEur]],
    ['BEA-Freibetrag (beide Eltern)', (y: IncomeTaxYear) => [getTaxYearParameters(y).children.beaAllowanceEur]],
    ['Entlastungsbetrag Alleinerziehende (1. Kind)', (y: IncomeTaxYear) => [getTaxYearParameters(y).children.singleParentReliefEur]],
    ['Arbeitnehmer-Pauschbetrag', (y: IncomeTaxYear) => [getTaxYearParameters(y).lumpSums.employee]],
    ['Sonderausgaben-Pauschbetrag Einzel/Zus.', (y: IncomeTaxYear) => [getTaxYearParameters(y).lumpSums.specialExpensesSingle, getTaxYearParameters(y).lumpSums.specialExpensesJoint]],
    ['Sparer-Pauschbetrag Einzel/Zus.', (y: IncomeTaxYear) => [getTaxYearParameters(y).lumpSums.saverSingle, getTaxYearParameters(y).lumpSums.saverJoint]],
    ['Höchstbetrag ohne eigenen/überlassenen Pkw', (y: IncomeTaxYear) => [getTaxYearParameters(y).commute.maxWithoutCarEur]],
    ['Homeoffice-Tagespauschale', (y: IncomeTaxYear) => [getTaxYearParameters(y).homeOffice.dailyRateEur, getTaxYearParameters(y).homeOffice.maxDays, getTaxYearParameters(y).homeOffice.maxAnnualEur]],
  ] as const)('%s', (label, fromCore) => {
    const row = yearRow(label)
    YEARS.forEach((year, i) => expect(numbers(row[i]!), `${label} ${year}`).toEqual(expect.arrayContaining(fromCore(year))))
  })

  it('Entfernungspauschale', () => {
    const row = yearRow('Entfernungspauschale')
    YEARS.forEach((year, i) => {
      const { rateFirstEur, rateAdditionalEur } = getTaxYearParameters(year).commute
      expect(numbers(row[i]!), String(year)).toEqual(expect.arrayContaining([rateFirstEur, rateAdditionalEur]))
    })
  })

  it('240 € more for each further child of a single parent', () => {
    expect(text).toContain('+240 je weiteres Kind')
    for (const year of YEARS) expect(getTaxYearParameters(year).children.singleParentAdditionalChildEur, String(year)).toBe(240)
  })

  it('the filing deadlines', () => {
    const german = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
    for (const year of YEARS) {
      const line = text.split('\n').find((row) => row.startsWith(`| ${year} |`))!
      const { standardFilingDeadline, voluntaryFilingDeadline } = getTaxYearParameters(year).deadlines
      expect(line, String(year)).toContain(german(standardFilingDeadline))
      expect(line, String(year)).toContain(german(voluntaryFilingDeadline))
    }
  })

  it('§ 35a and the other provision', () => {
    const { householdServices, maxOtherProvisionEur, provision } = getTaxYearParameters(2026)
    const line = (label: string) => text.split('\n').find((row) => row.startsWith(`| ${label}`))!
    expect(numbers(line('Haushaltsnahe Minijobs'))).toEqual(expect.arrayContaining([householdServices.minijobMaxEur]))
    expect(numbers(line('Haushaltsnahe Dienstleistungen'))).toEqual(expect.arrayContaining([householdServices.servicesMaxEur]))
    expect(numbers(line('Handwerkerleistungen'))).toEqual(expect.arrayContaining([householdServices.craftsmenMaxEur]))
    expect(numbers(line('Sonstige Vorsorge'))).toEqual(expect.arrayContaining([provision.maxOtherProvisionEmployeeEur, maxOtherProvisionEur]))
  })
})
