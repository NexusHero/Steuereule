import { describe, expect, it } from 'vitest'
import { buildYearHistory, type HistoryFigure, type WageFacts, type YearHistoryEntry, type YearHistoryInput } from './year-history'

// ADR-0098 — the mock's household (docs/mocks/steuer-verlauf.html): an Eckjahr 2021 from two uploaded
// Bescheide, two single returns 2022, joint returns 2023–2025 (2024 with Person A's Werbungskosten cut),
// 2025 submitted without a Bescheid, 2026 still open.

const wage = (gross: number, wageTax: number, socialSecurity: number, extra: Partial<WageFacts> = {}): WageFacts => ({
  gross,
  wageTax,
  solidaritaetszuschlag: 0,
  churchTax: 0,
  socialSecurity,
  source: 'lohnsteuerbescheinigung',
  exchangeRate: null,
  ...extra,
})
const wk = (fahrtweg: number, homeoffice: number, arbeitsmittel: number, sonstiges = 0) => ({ fahrtweg, homeoffice, arbeitsmittel, sonstiges })

const HOUSEHOLD: YearHistoryInput[] = [
  {
    year: 2021,
    filingType: 'einzel',
    eckjahr: true,
    people: { A: { wage: null, declaredWorkExpenses: null }, B: { wage: null, declaredWorkExpenses: null } },
    filings: [
      { person: 'A', estimate: null, assessment: { werbungskostenA: 1_850, festgesetzteSteuer: 6_410, erstattung: 280 }, declaredRefund: null, estimateAtSubmission: null },
      { person: 'B', estimate: null, assessment: { werbungskostenA: 1_000, festgesetzteSteuer: 4_020, erstattung: -60 }, declaredRefund: null, estimateAtSubmission: null },
    ],
    missing: [],
  },
  {
    year: 2022,
    filingType: 'einzel',
    eckjahr: false,
    people: {
      A: { wage: wage(48_200, 7_457, 9_880), declaredWorkExpenses: wk(1_540, 600, 240) },
      B: { wage: wage(36_400, 4_444, 7_460), declaredWorkExpenses: wk(980, 0, 120) },
    },
    filings: [
      { person: 'A', estimate: null, assessment: { werbungskostenA: 2_380, festgesetzteSteuer: 7_065, erstattung: 393 }, declaredRefund: 393, estimateAtSubmission: null },
      { person: 'B', estimate: null, assessment: { werbungskostenA: 1_100, festgesetzteSteuer: 4_444, erstattung: 0 }, declaredRefund: 0, estimateAtSubmission: null },
    ],
    missing: [],
  },
  {
    year: 2023,
    filingType: 'zusammen',
    eckjahr: false,
    people: {
      A: { wage: wage(51_600, 8_014, 10_630), declaredWorkExpenses: wk(680, 300, 140) },
      B: { wage: wage(38_100, 4_586, 7_850), declaredWorkExpenses: wk(1_020, 420, 90) },
    },
    filings: [
      {
        person: null,
        estimate: null,
        assessment: { werbungskostenA: 1_120, werbungskostenB: 1_530, zuVersteuerndesEinkommen: 69_500, festgesetzteSteuer: 12_390, erstattung: 210 },
        declaredRefund: 210,
        estimateAtSubmission: { from: 150, to: 420 },
      },
    ],
    missing: [],
  },
  {
    year: 2024,
    filingType: 'zusammen',
    eckjahr: false,
    people: {
      A: { wage: wage(54_900, 8_489, 11_420), declaredWorkExpenses: wk(1_320, 1_260, 380) },
      B: { wage: wage(39_000, 4_490, 8_110), declaredWorkExpenses: wk(1_050, 720, 160) },
    },
    filings: [
      {
        person: null,
        estimate: null,
        assessment: { fahrtwegA: 1_320, homeofficeA: 1_080, arbeitsmittelA: 260, werbungskostenA: 2_660, werbungskostenB: 1_930, zuVersteuerndesEinkommen: 71_271, festgesetzteSteuer: 12_170, erstattung: 809 },
        declaredRefund: 901,
        estimateAtSubmission: { from: 700, to: 1_050 },
      },
    ],
    missing: [],
  },
  {
    year: 2025,
    filingType: 'zusammen',
    eckjahr: false,
    people: {
      A: { wage: wage(58_300, 9_205, 12_300), declaredWorkExpenses: wk(1_380, 1_260, 520, 250) },
      B: { wage: wage(41_200, 4_861, 8_690), declaredWorkExpenses: wk(1_080, 840, 210) },
    },
    filings: [
      {
        person: null,
        estimate: { result: { from: 1_066, to: 1_196 }, incomeTax: { from: 12_870, to: 13_000 }, taxableIncome: { from: 73_400, to: 73_800 } },
        assessment: null,
        declaredRefund: 1_131,
        estimateAtSubmission: { from: 1_066, to: 1_196 },
      },
    ],
    missing: [],
  },
  {
    year: 2026,
    filingType: 'zusammen',
    eckjahr: false,
    people: { A: { wage: null, declaredWorkExpenses: wk(1_400, 1_260, 0) }, B: { wage: null, declaredWorkExpenses: null } },
    filings: [{ person: null, estimate: null, assessment: null, declaredRefund: null, estimateAtSubmission: null }],
    missing: ['bruttoarbeitslohn', 'personB.bruttoarbeitslohn'],
  },
]

const history = buildYearHistory(HOUSEHOLD)
const year = (y: number): YearHistoryEntry => history.find((e) => e.year === y)!

describe('buildYearHistory — three tiers', () => {
  it('orders the years oldest first and gives each its tier', () => {
    expect(history.map((e) => [e.year, e.tier])).toEqual([
      [2021, 'bescheid'],
      [2022, 'bescheid'],
      [2023, 'bescheid'],
      [2024, 'bescheid'],
      [2025, 'schaetzung'],
      [2026, 'offen'],
    ])
  })

  it('takes the LStB facts as exact without a Bescheid, with the LStB as their source', () => {
    expect(year(2025).netto.A.brutto).toMatchObject({ tier: 'bescheid', value: 58_300, source: 'lohnsteuerbescheinigung' })
    expect(year(2025).netto.beide.netto).toMatchObject({ tier: 'bescheid', value: 58_300 - 9_205 - 12_300 + 41_200 - 4_861 - 8_690 })
    expect(year(2025).netto.beide.nettoQuote).toMatchObject({ tier: 'bescheid', value: 64.8 })
  })

  it('gives what depends on the Bescheid as a range without one, never a midpoint', () => {
    expect(year(2025).erstattung.amount).toMatchObject({ tier: 'schaetzung', range: { from: 1_066, to: 1_196 } })
    expect(year(2025).netto.beide.nettoNachErstattung).toMatchObject({ tier: 'schaetzung' })
    expect(year(2025).werbungskosten.A.angesetzt).toMatchObject({ tier: 'schaetzung', range: { from: 3_410, to: 3_410 }, source: 'erklaerung' })
    expect(year(2025).steuerquote.effective).toMatchObject({ tier: 'schaetzung' })
  })

  it('says what is missing for an open year', () => {
    expect(year(2026).missing).toEqual(['bruttoarbeitslohn', 'personB.bruttoarbeitslohn'])
    expect(year(2026).erstattung.amount).toEqual(expect.objectContaining({ tier: 'offen', missing: ['bruttoarbeitslohn', 'personB.bruttoarbeitslohn'] }))
    expect(year(2026).netto.A.netto).toMatchObject({ tier: 'offen', missing: ['lohnsteuerbescheinigung'] })
  })
})

describe('buildYearHistory — the Eckjahr', () => {
  it('counts as Bescheid, with the Werbungskosten only as the Bescheid’s sum', () => {
    const wk2021 = year(2021).werbungskosten
    expect(year(2021).eckjahr).toBe(true)
    expect(wk2021.A.total).toMatchObject({ tier: 'bescheid', value: 1_850, source: 'bescheid' })
    expect(wk2021.A.parts).toBeNull()
    expect(wk2021.B!.belowLumpSum).toBe(false)
    expect(wk2021.beide.pauschbetrag).toBe(2_000)
  })

  it('cannot read Brutto → Netto off the Bescheid', () => {
    expect(year(2021).netto.beide.netto).toMatchObject({ tier: 'offen', missing: ['lohnsteuerbescheinigung'] })
  })

  it('adds the two single returns up and flags it', () => {
    expect(year(2021).erstattung).toMatchObject({ amount: { tier: 'bescheid', value: 220 }, sumOfSingleFilings: true })
    expect(year(2021).steuerquote.marginal).toBeNull()
  })
})

describe('buildYearHistory — Werbungskosten and the lump sum', () => {
  it('counts the lump sum where the Werbungskosten stayed below it', () => {
    const b = year(2022).werbungskosten.B!
    expect(b.total).toMatchObject({ value: 1_100 })
    expect(b.angesetzt).toMatchObject({ value: 1_200 })
    expect(b.belowLumpSum).toBe(true)
  })

  it('shows the parts the Bescheid read, and the declared ones where it read none', () => {
    expect(year(2024).werbungskosten.A).toMatchObject({ partsSource: 'bescheid', parts: { homeoffice: 1_080, arbeitsmittel: 260 } })
    expect(year(2024).werbungskosten.B).toMatchObject({ partsSource: 'erklaerung', parts: { homeoffice: 720 } })
  })
})

describe('buildYearHistory — Erstattung declared against assessed', () => {
  it('gives the declared refund, the Bescheid’s and the difference', () => {
    expect(year(2024).erstattung).toMatchObject({ amount: { value: 809 }, declared: 901, difference: -92, estimateBeforeAssessment: { from: 700, to: 1_050 } })
  })

  it('has a marginal rate from the tariff for the household', () => {
    expect(year(2024).steuerquote.marginal).toMatchObject({ tier: 'bescheid', value: 32 })
    expect(year(2024).steuerquote.effective).toMatchObject({ tier: 'bescheid', value: 13 })
  })
})

describe('buildYearHistory — the change to the year before', () => {
  it('is exact between two exact values, absolute and in %', () => {
    expect(year(2023).netto.A.brutto.delta).toEqual({ kind: 'exact', absolute: 3_400, percent: 7.1 })
  })

  it('is a range when one side is a range', () => {
    expect(year(2025).erstattung.amount.delta).toMatchObject({ kind: 'range', absolute: { from: 257, to: 387 } })
  })

  it('is in percentage points for a quote', () => {
    expect(year(2024).steuerquote.effective.delta).toMatchObject({ kind: 'exact', percent: null })
  })

  it('drops out for Erstattung and Steuerquote when the Veranlagungsart changed, not for the wage', () => {
    expect(year(2023).filingTypeChanged).toBe(true)
    expect(year(2023).erstattung.amount.delta).toEqual({ kind: 'none', reason: 'veranlagungsart-gewechselt' })
    expect(year(2023).steuerquote.effective.delta).toEqual({ kind: 'none', reason: 'veranlagungsart-gewechselt' })
    expect(year(2023).netto.beide.netto.delta.kind).toBe('exact')
  })

  it('has no change for the first year, nor across a gap', () => {
    expect(year(2021).erstattung.amount.delta).toEqual({ kind: 'none', reason: 'kein-vorjahr' })
    const gap = buildYearHistory([HOUSEHOLD[1]!, HOUSEHOLD[3]!])
    expect(gap[1]!.netto.A.brutto.delta).toEqual({ kind: 'none', reason: 'kein-vorjahr' })
  })
})

describe('buildYearHistory — a Grenzgänger', () => {
  it('carries the year’s CHF rate of the Swiss wage', () => {
    const [entry] = buildYearHistory([
      {
        ...HOUSEHOLD[4]!,
        people: { A: { wage: wage(80_000, 3_600, 9_000, { source: 'lohnausweis', exchangeRate: { rate: 0.9502, period: '2025' } }), declaredWorkExpenses: wk(2_000, 0, 0) }, B: null },
      },
    ])
    expect(entry!.netto.A.brutto).toMatchObject({ tier: 'bescheid', value: 80_000, source: 'lohnausweis' })
    expect(entry!.netto.beide.exchangeRates).toEqual([{ rate: 0.9502, period: '2025' }])
  })
})

// The contract the ADR's „Folgen“ name: no year without a Bescheid shows an exact Bescheid-dependent
// number, and no change to the year before is formed from an open year.
describe('buildYearHistory — contract', () => {
  const figures = (e: YearHistoryEntry): HistoryFigure[] => [
    ...[e.netto.beide, e.netto.A, ...(e.netto.B ? [e.netto.B] : [])].flatMap((n) => [n.brutto, n.lohnsteuer, n.solidaritaetszuschlag, n.kirchensteuer, n.sozialversicherung, n.netto, n.nettoQuote]),
    e.netto.beide.nettoNachErstattung,
    ...[e.werbungskosten.beide, e.werbungskosten.A, ...(e.werbungskosten.B ? [e.werbungskosten.B] : [])].flatMap((w) => [w.total, w.angesetzt]),
    e.erstattung.amount,
    e.steuerquote.incomeTax,
    e.steuerquote.effective,
    ...(e.steuerquote.marginal ? [e.steuerquote.marginal] : []),
  ]

  it('shows no exact Bescheid-dependent number for a year without a Bescheid', () => {
    for (const e of history.filter((x) => x.tier !== 'bescheid')) {
      const dependent = [e.netto.beide.nettoNachErstattung, e.werbungskosten.beide.angesetzt, e.werbungskosten.A.angesetzt, e.erstattung.amount, e.steuerquote.incomeTax, e.steuerquote.effective, e.steuerquote.marginal!]
      for (const f of dependent) expect(f.tier, `${e.year}`).not.toBe('bescheid')
    }
  })

  it('forms no change to the year before from an open value', () => {
    const byYear = new Map(history.map((e) => [e.year, e]))
    for (const e of history) {
      const prev = byYear.get(e.year - 1)
      const current = figures(e)
      const previous = prev ? figures(prev) : []
      current.forEach((f, i) => {
        if (f.tier === 'offen' || previous[i]?.tier === 'offen') expect(f.delta.kind, `${e.year} #${i}`).toBe('none')
      })
    }
  })
})
