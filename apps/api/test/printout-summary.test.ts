import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildPrintoutSummary, type SummaryInput } from '../src/printout/printout-summary.js'
import { renderSummary, summaryText } from '../src/printout/summary-renderer.js'

const NBSP = ' '

const JOINT: SummaryInput = {
  taxYear: 2025,
  createdOn: '2026-11-27',
  persons: ['Anna Beispiel', 'Ben Beispiel'],
  estimate: {
    kind: 'spanne',
    werbungskosten: 2460,
    provision: { from: 9100, to: 9300 },
    specialExpenses: 400,
    taxableIncome: { from: 71000, to: 71200 },
    incomeTax: { from: 13450, to: 13520 },
    solidaritaetszuschlag: { from: 0, to: 0 },
    anrechnung: 14400,
    result: { from: 880, to: 950 },
    churchTaxOpen: false,
    jointAssessment: true,
    breakdown: {
      persons: [
        { incomeEur: 56070, workExpensesEur: 1230, creditedTaxEur: 9400 },
        { incomeEur: 39970, workExpensesEur: 1230, creditedTaxEur: 5000 },
      ],
      totalIncomeEur: 96040,
      extraordinaryBurdenEur: 0,
      tariffTax: { from: 13650, to: 13720 },
      householdReductionEur: 200,
      childAllowance: { allowanceEur: 9600, childBenefitEur: 3060, used: false },
    },
  },
  forms: [
    { formular: 'est-1-a', instances: [{ person: null, entityId: null, values: { 'est1a.steuernummer': '2010304050', 'est1a.einkommensteuererklaerung': true } }] },
    { formular: 'anlage-kind', instances: [{ person: null, entityId: 'k1', values: {} }, { person: null, entityId: 'k2', values: {} }] },
  ],
  names: { k1: 'Mia', k2: null },
}

const labels = (input: SummaryInput) => buildPrintoutSummary(input).steps.map((s) => s.label)

describe('the printout summary: the result, step by step', () => {
  it('walks from each person’s income to the refund, in the order of an assessment', () => {
    expect(labels(JOINT)).toEqual([
      'Einkünfte Anna Beispiel',
      'Einkünfte Ben Beispiel',
      'Summe der Einkünfte',
      'Vorsorgeaufwendungen',
      'Sonderausgaben',
      'Zu versteuerndes Einkommen',
      'Tarifliche Einkommensteuer',
      'Steuerermäßigung nach § 35a EStG',
      'Festzusetzende Einkommensteuer',
      'Solidaritätszuschlag',
      'Bereits gezahlt (einbehaltene Steuer)',
      'Voraussichtliche Erstattung',
    ])
  })

  it('takes every figure from the estimate: it never calculates a second time', () => {
    const summary = buildPrintoutSummary(JOINT)
    const amount = (label: string) => summary.steps.find((s) => s.label === label)!.amount
    expect(amount('Einkünfte Anna Beispiel')).toBe(`56.070${NBSP}€`)
    expect(amount('Vorsorgeaufwendungen')).toBe(`9.100–9.300${NBSP}€`)
    expect(amount('Zu versteuerndes Einkommen')).toBe(`71.000–71.200${NBSP}€`)
    expect(amount('Voraussichtliche Erstattung')).toBe(`880–950${NBSP}€`)
    expect(summary.steps.find((s) => s.label === 'Einkünfte Anna Beispiel')!.detail).toBe(`nach Werbungskosten von 1.230${NBSP}€`)
  })

  it('marks what is deducted, what is a subtotal and what is the result', () => {
    const kinds = Object.fromEntries(buildPrintoutSummary(JOINT).steps.map((s) => [s.label, s.kind]))
    expect(kinds['Vorsorgeaufwendungen']).toBe('minus')
    expect(kinds['Summe der Einkünfte']).toBe('subtotal')
    expect(kinds['Voraussichtliche Erstattung']).toBe('result')
  })

  it('names a back payment as one, with its amount unsigned', () => {
    const summary = buildPrintoutSummary({ ...JOINT, estimate: { ...JOINT.estimate!, result: { from: -4100, to: -3900 } } })
    const last = summary.steps.at(-1)!
    expect(last.label).toBe('Voraussichtliche Nachzahlung')
    expect(last.amount).toBe(`3.900–4.100${NBSP}€`)
    expect(summary.headline).toBe(`Voraussichtliche Nachzahlung: 3.900–4.100${NBSP}€`)
  })

  it('leaves out steps the return does not have, and adds those it has', () => {
    const base = JOINT.estimate!
    const with35a = labels(JOINT)
    expect(with35a).not.toContain('Außergewöhnliche Belastungen')
    expect(with35a).not.toContain('Kinderfreibetrag')
    const fuller = labels({
      ...JOINT,
      estimate: {
        ...base,
        prepayments: 1200,
        churchTax: { kind: 'spanne', due: { from: 300, to: 320 }, withheld: 280, capOnApplication: false },
        breakdown: { ...base.breakdown!, rentalSurplusEur: 2400, extraordinaryBurdenEur: 150, capitalFlatTaxEur: 90, childAllowance: { allowanceEur: 9600, childBenefitEur: 3060, used: true } },
      },
    })
    expect(fuller).toEqual(expect.arrayContaining(['Vermietung und Verpachtung', 'Außergewöhnliche Belastungen', 'Kinderfreibetrag', 'Abgeltungsteuer auf Kapitalerträge', 'Kirchensteuer', 'Vorauszahlungen']))
  })

  it('says so when the result cannot be calculated yet, and still lists what was entered', () => {
    const summary = buildPrintoutSummary({ ...JOINT, estimate: { kind: 'offen' } })
    expect(summary.steps).toEqual([])
    expect(summary.headline).toBe('Das Ergebnis lässt sich noch nicht berechnen.')
    expect(summary.sections.length).toBeGreaterThan(0)
  })

  it('always says it is an estimate, and names open church tax and open amounts', () => {
    const summary = buildPrintoutSummary({ ...JOINT, estimate: { ...JOINT.estimate!, churchTaxOpen: true, laterAmounts: 2 } })
    expect(summary.notes[0]).toBe('Das Ergebnis ist eine Schätzung aus deinen Angaben. Maßgeblich ist der Steuerbescheid des Finanzamts.')
    expect(summary.notes).toContain('Die Kirchensteuer ist im Ergebnis noch nicht enthalten.')
    expect(summary.notes).toContain('2 Beträge sind noch offen und nicht eingerechnet.')
  })
})

describe('the printout summary: what was entered, form by form', () => {
  it('lists each printed form with the line of its Vordruck, in form order', () => {
    const [first] = buildPrintoutSummary(JOINT).sections
    expect(first!.title).toBe('Hauptvordruck ESt 1 A')
    expect(first!.rows).toEqual([
      { zeile: '1', label: 'Einkommensteuererklärung', value: 'X' },
      { zeile: '4', label: 'Steuernummer', value: '2010304050' },
    ])
  })

  it('tells two copies of a form apart by the record’s name, else by a number', () => {
    const titles = buildPrintoutSummary(JOINT).sections.map((s) => s.title)
    expect(titles).toEqual(['Hauptvordruck ESt 1 A', 'Anlage Kind · Mia', 'Anlage Kind · 2'])
  })
})

describe('the printout summary as pages', () => {
  it('renders A4 pages that name the document, the result and every section', async () => {
    const summary = buildPrintoutSummary(JOINT)
    const bytes = await renderSummary(summary)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(0)
    const { width, height } = pdf.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
    const text = summaryText(summary)
    expect(text).toContain('Zusammenfassung zur Einkommensteuererklärung 2025')
    expect(text).toContain('Nicht mit einreichen')
    expect(text).toContain('Voraussichtliche Erstattung')
    expect(text).toContain('Anlage Kind · Mia')
  })

  it('draws text a standard PDF font cannot encode without failing (minus sign, narrow space)', async () => {
    const odd = buildPrintoutSummary({ ...JOINT, persons: ['Zoë − Ünal Jr.', 'Ben 😀'] })
    await expect(renderSummary(odd)).resolves.toBeInstanceOf(Uint8Array)
  })

  it('breaks onto further pages when the forms have many lines', async () => {
    const values = Object.fromEntries(Array.from({ length: 140 }, (_, i) => [`unbekannt.feld${i}`, String(i)]))
    const long = buildPrintoutSummary({ ...JOINT, forms: [{ formular: 'anlage-n', instances: [{ person: 'A', entityId: null, values }] }] })
    const pdf = await PDFDocument.load(await renderSummary(long))
    expect(pdf.getPageCount()).toBeGreaterThan(2)
  })
})
