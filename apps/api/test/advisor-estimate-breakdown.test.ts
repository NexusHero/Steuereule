// The owl's result table subtracted the § 35a reduction twice (real-data run): the estimate now hands
// over the way from the income to the result as finished lines, and the owl quotes them.
import { describe, expect, it } from 'vitest'
import { estimateReadingFrom } from '../src/advisor/advisor.service.js'
import { computedFiguresOf } from '../src/ki/advisor-tools.js'
import { buildStableSystemPrompt } from '../src/ki/advisor-prompt.js'
import { toolResult } from '../src/ki/advisor-tools.js'
import type { TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'

const exact = (value: number) => ({ from: value, to: value })

const status: TaxEstimateStatus = {
  kind: 'spanne',
  werbungskosten: 3400,
  provision: exact(21000),
  specialExpenses: 900,
  taxableIncome: exact(120000),
  // After the § 35a reduction: 31.000 tariff tax − 400.
  incomeTax: exact(30600),
  solidaritaetszuschlag: exact(700),
  anrechnung: 9000,
  prepayments: 20000,
  result: exact(-2300),
  churchTaxOpen: false,
  jointAssessment: true,
  breakdown: {
    persons: [
      { incomeEur: 80000, workExpensesEur: 1230, creditedTaxEur: 5000 },
      { incomeEur: 65300, workExpensesEur: 2170, creditedTaxEur: 4000 },
    ],
    totalIncomeEur: 145300,
    extraordinaryBurdenEur: 0,
    tariffTax: exact(31000),
    householdReductionEur: 400,
  },
}

describe('the estimate as the owl reads it', () => {
  const reading = estimateReadingFrom(status)
  const lines = reading.kind === 'computed' ? (reading.breakdown ?? []) : []
  const line = (label: RegExp) => lines.find((entry) => label.test(entry.label))

  it('hands over the calculation as finished lines, in order, from the income to the result', () => {
    expect(lines.map((entry) => entry.label)).toEqual([
      'Einkünfte Person A (nach Werbungskosten)',
      'Werbungskosten Person A',
      'Einkünfte Person B (nach Werbungskosten)',
      'Werbungskosten Person B',
      'Summe der Einkünfte',
      'Vorsorgeaufwendungen (abziehbar)',
      'Sonderausgaben',
      'Zu versteuerndes Einkommen',
      'Tarifliche Einkommensteuer',
      'Steuerermäßigung § 35a EStG (schon abgezogen)',
      'Festzusetzende Einkommensteuer',
      'Solidaritätszuschlag',
      'Angerechnete Steuer (Lohnsteuer, Quellensteuer)',
      'Vorauszahlungen',
      'Ergebnis (positiv = Erstattung, negativ = Nachzahlung)',
    ])
  })

  it('names the § 35a reduction once: the income tax line already contains it', () => {
    expect(line(/Tarifliche/)).toMatchObject({ amountEur: 31000 })
    expect(line(/§ 35a/)).toMatchObject({ amountEur: -400 })
    expect(line(/Festzusetzende/)).toMatchObject({ amountEur: 30600 })
    expect(line(/Ergebnis/)).toMatchObject({ amountEur: -2300 })
  })

  it('keeps a range a range and leaves out what the estimate has no steps for', () => {
    const { breakdown: _steps, ...withoutSteps } = status as Extract<TaxEstimateStatus, { kind: 'spanne' }>
    const ranged = estimateReadingFrom({ ...withoutSteps, incomeTax: { from: 30600, to: 30900 } })
    const rows = ranged.kind === 'computed' ? (ranged.breakdown ?? []) : []
    expect(rows.find((entry) => /Festzusetzende/.test(entry.label))).toMatchObject({ fromEur: 30600, toEur: 30900 })
    expect(rows.some((entry) => /Tarifliche|§ 35a|Person A/.test(entry.label))).toBe(false)
  })

  it('backs every figure of the lines, so quoting them raises no notice', () => {
    const figures = computedFiguresOf([toolResult('c1', 'read_current_estimate', { ok: true, estimate: reading })])
    for (const amount of [31000, -400, 30600, 145300, 80000, 2170]) expect(figures).toContain(amount)
  })

  it('tells the owl to quote the lines and to add nothing up itself', () => {
    const prompt = buildStableSystemPrompt()
    expect(prompt).toContain('`breakdown`')
    expect(prompt).toMatch(/Zeile für Zeile/)
  })
})

// Real-data run: the owl explained an estimate range with a reason it made up. The reading names the causes.
describe('why the estimate is a range', () => {
  it('names nothing for a point value', () => {
    const reading = estimateReadingFrom(status)
    expect(reading.kind === 'computed' && reading.rangeCauses).toEqual([])
  })

  it('names the provision range, amounts marked for later and open church tax, and the prompt says to quote only these', () => {
    const ranged: TaxEstimateStatus = { ...status, provision: { from: 20500, to: 21000 }, result: { from: -2500, to: -2300 }, laterAmounts: 2, churchTaxOpen: true }
    const reading = estimateReadingFrom(ranged)
    const causes = (reading.kind === 'computed' ? reading.rangeCauses : undefined) ?? []
    expect(causes.join(' ')).toContain('Vorsorgeaufwendungen')
    expect(causes.join(' ')).toContain('20.500')
    expect(causes.join(' ')).toContain('2 Beträge')
    expect(causes.join(' ')).toContain('Kirchensteuer')
    expect(buildStableSystemPrompt()).toContain('rangeCauses')
  })
})

