// The mock's example household (docs/mocks/steuer-verlauf.html) in the shape of `GET /v1/verlauf`, for
// tests only: 2021 an Eckjahr from an old Bescheid, 2022 two single returns, from 2023 joint, 2024 a
// Bescheid with two cuts and a running Einspruchsfrist, 2025 filed and waiting, 2026 open. ADR-0099
// (docs/mocks/steuer-verlauf-ideen.html): marriage 2023, a new employer and the start as a Grenzgänger
// in 2024, a child in 2025, the checklist of 2026, Homeoffice cut twice, the couple comparison, the
// cross-border and capital tabs, and the Unterlagen. Variants: a year without data (§1), all groups (§7).
import type {
  AppealHistoryEntryDto,
  AssessmentDiffDto,
  AssessmentLessonDto,
  HistoryDeltaDto,
  HistoryFigureDto,
  HouseholdNetFiguresDto,
  NetFiguresDto,
  WorkExpenseFiguresDto,
  YearDiffDto,
  YearDeadlineDto,
  YearHistoryEntryDto,
  YearHistoryResponseDto,
  YearListItemDto,
} from '@steuereule/api-client'

const none = (reason: 'kein-vorjahr' | 'offen' | 'veranlagungsart-gewechselt' = 'kein-vorjahr'): HistoryDeltaDto => ({ kind: 'none', reason })
const exact = (absolute: number, pct: number | null = null): HistoryDeltaDto => ({ kind: 'exact', absolute, percent: pct })

export const fig = (value: number, delta: HistoryDeltaDto = none(), source: HistoryFigureDto['source'] = 'bescheid'): HistoryFigureDto => ({ tier: 'bescheid', value, source, delta })
export const est = (from: number, to: number, delta: HistoryDeltaDto = none()): HistoryFigureDto => ({ tier: 'schaetzung', range: { from, to }, source: 'schaetzung', delta })
export const open = (missing: string[] = ['lohnsteuerbescheinigung']): HistoryFigureDto => ({ tier: 'offen', missing, delta: none('offen') })

function net(brutto: number, lst: number, sv: number, delta: HistoryDeltaDto = none()): NetFiguresDto {
  const netto = brutto - lst - sv
  return {
    brutto: fig(brutto, none(), 'lohnsteuerbescheinigung'),
    lohnsteuer: fig(lst, none(), 'lohnsteuerbescheinigung'),
    solidaritaetszuschlag: fig(0, none(), 'lohnsteuerbescheinigung'),
    kirchensteuer: fig(0, none(), 'lohnsteuerbescheinigung'),
    sozialversicherung: fig(sv, none(), 'lohnsteuerbescheinigung'),
    netto: fig(netto, delta, 'lohnsteuerbescheinigung'),
    nettoQuote: fig(Math.round((netto / brutto) * 1000) / 10, none(), 'lohnsteuerbescheinigung'),
    exchangeRates: [],
  }
}

const openNet = (): NetFiguresDto => ({
  brutto: open(),
  lohnsteuer: open(),
  solidaritaetszuschlag: open(),
  kirchensteuer: open(),
  sozialversicherung: open(),
  netto: open(),
  nettoQuote: open(),
  exchangeRates: [],
})

function household(a: NetFiguresDto, b: NetFiguresDto, refund: HistoryFigureDto, delta: HistoryDeltaDto = none()): HouseholdNetFiguresDto {
  const sum = (k: 'brutto' | 'lohnsteuer' | 'sozialversicherung' | 'netto') => (a[k].value ?? 0) + (b[k].value ?? 0)
  if (a.brutto.tier === 'offen') return { ...openNet(), nettoNachErstattung: open() }
  const netto = sum('netto')
  const brutto = sum('brutto')
  return {
    brutto: fig(brutto, none(), 'lohnsteuerbescheinigung'),
    lohnsteuer: fig(sum('lohnsteuer'), none(), 'lohnsteuerbescheinigung'),
    solidaritaetszuschlag: fig(0, none(), 'lohnsteuerbescheinigung'),
    kirchensteuer: fig(0, none(), 'lohnsteuerbescheinigung'),
    sozialversicherung: fig(sum('sozialversicherung'), none(), 'lohnsteuerbescheinigung'),
    netto: fig(netto, delta, 'lohnsteuerbescheinigung'),
    nettoQuote: fig(Math.round((netto / brutto) * 1000) / 10, none(), 'lohnsteuerbescheinigung'),
    exchangeRates: [],
    nettoNachErstattung: refund.tier === 'bescheid' ? fig(netto + (refund.value ?? 0)) : refund.tier === 'schaetzung' ? est(netto + refund.range!.from, netto + refund.range!.to) : open(),
  }
}

function work(parts: WorkExpenseFiguresDto['parts'], lumpSum: number, tier: 'bescheid' | 'schaetzung' = 'bescheid', delta: HistoryDeltaDto = none()): WorkExpenseFiguresDto {
  const total = parts ? parts.fahrtweg + parts.homeoffice + parts.arbeitsmittel + parts.sonstiges : 0
  const f = tier === 'bescheid' ? fig(total) : est(total, total)
  const counted = Math.max(total, lumpSum)
  return {
    total: f,
    angesetzt: tier === 'bescheid' ? fig(counted, delta) : est(counted, counted, delta),
    parts,
    partsSource: parts ? (tier === 'bescheid' ? 'bescheid' : 'erklaerung') : null,
    pauschbetrag: lumpSum,
    belowLumpSum: total < lumpSum,
  }
}

const parts = (fahrtweg: number, homeoffice: number, arbeitsmittel: number, sonstiges = 0) => ({ fahrtweg, homeoffice, arbeitsmittel, sonstiges })
const sumParts = (a: ReturnType<typeof parts>, b: ReturnType<typeof parts>) => parts(a.fahrtweg + b.fahrtweg, a.homeoffice + b.homeoffice, a.arbeitsmittel + b.arbeitsmittel, a.sonstiges + b.sonstiges)

function year(input: Partial<YearHistoryEntryDto> & Pick<YearHistoryEntryDto, 'year'>): YearHistoryEntryDto {
  return {
    filingType: 'zusammen',
    filingTypeChanged: false,
    eckjahr: false,
    tier: 'bescheid',
    missing: [],
    persons: ['A', 'B'],
    netto: { beide: { ...openNet(), nettoNachErstattung: open() }, A: openNet(), B: openNet() },
    werbungskosten: { beide: work(null, 2460), A: work(null, 1230), B: work(null, 1230) },
    erstattung: { amount: open(), declared: null, difference: null, estimateBeforeAssessment: null, sumOfSingleFilings: false },
    steuerquote: { incomeTax: open(), effective: open(), marginal: null },
    ...input,
  }
}

const p22A = parts(1540, 600, 240)
const p22B = parts(980, 0, 120)
const p23A = parts(680, 300, 140)
const p23B = parts(1020, 420, 90)
const p24A = parts(1320, 1080, 260)
const p24B = parts(1050, 720, 160)
const p25A = parts(1380, 1260, 520, 250)
const p25B = parts(1080, 840, 210)

const n22A = net(48200, 7457, 9880)
const n22B = net(36400, 4444, 7460)
const n23A = net(51600, 8014, 10630)
const n23B = net(38100, 4586, 7850)
const n24A = net(54900, 8489, 11420)
const n24B = net(39000, 4490, 8110)
const n25A = net(58300, 9205, 12300)
const n25B = net(41200, 4861, 8690)

const refund22 = fig(393)
const refund23 = fig(210, none('veranlagungsart-gewechselt'))
const refund24 = fig(809, exact(599, 285.2))
const refund25 = est(1066, 1196, { kind: 'range', absoluteRange: { from: 257, to: 387 }, percentRange: { from: 31.8, to: 47.8 } })

export const HISTORY_YEARS: YearHistoryEntryDto[] = [
  year({
    year: 2021,
    filingType: 'einzel',
    eckjahr: true,
    werbungskosten: {
      beide: { ...work(null, 2000), total: fig(2850), angesetzt: fig(2850), belowLumpSum: false },
      A: { ...work(null, 1000), total: fig(1850), angesetzt: fig(1850), belowLumpSum: false },
      B: { ...work(null, 1000), total: fig(1000), angesetzt: fig(1000), belowLumpSum: false },
    },
    erstattung: { amount: fig(220), declared: null, difference: null, estimateBeforeAssessment: null, sumOfSingleFilings: true },
    steuerquote: { incomeTax: fig(10430), effective: open(['bruttoarbeitslohn']), marginal: null },
  }),
  year({
    year: 2022,
    filingType: 'einzel',
    netto: { beide: household(n22A, n22B, refund22), A: n22A, B: n22B },
    werbungskosten: { beide: work(sumParts(p22A, p22B), 2400), A: work(p22A, 1200), B: work(p22B, 1200) },
    erstattung: { amount: refund22, declared: 393, difference: 0, estimateBeforeAssessment: null, sumOfSingleFilings: true },
    steuerquote: { incomeTax: fig(11509), effective: fig(13.6), marginal: null },
  }),
  year({
    year: 2023,
    filingTypeChanged: true,
    netto: { beide: household(n23A, n23B, refund23), A: n23A, B: n23B },
    werbungskosten: { beide: work(sumParts(p23A, p23B), 2460), A: work(p23A, 1230), B: work(p23B, 1230) },
    erstattung: { amount: refund23, declared: 210, difference: 0, estimateBeforeAssessment: { from: 150, to: 420 }, sumOfSingleFilings: false },
    steuerquote: { incomeTax: fig(12390), effective: fig(13.8, { kind: 'none', reason: 'veranlagungsart-gewechselt' }), marginal: fig(31) },
  }),
  year({
    year: 2024,
    netto: { beide: household(n24A, n24B, refund24), A: n24A, B: n24B },
    werbungskosten: { beide: work(sumParts(p24A, p24B), 2460), A: work(p24A, 1230), B: work(p24B, 1230) },
    erstattung: { amount: refund24, declared: 901, difference: -92, estimateBeforeAssessment: { from: 700, to: 1050 }, sumOfSingleFilings: false },
    steuerquote: { incomeTax: fig(12170), effective: fig(13.0, exact(-0.8)), marginal: fig(31) },
  }),
  year({
    year: 2025,
    tier: 'schaetzung',
    netto: { beide: household(n25A, n25B, refund25), A: n25A, B: n25B },
    werbungskosten: { beide: work(sumParts(p25A, p25B), 2460, 'schaetzung'), A: work(p25A, 1230, 'schaetzung'), B: work(p25B, 1230, 'schaetzung') },
    erstattung: { amount: refund25, declared: 1196, difference: null, estimateBeforeAssessment: null, sumOfSingleFilings: false },
    steuerquote: { incomeTax: est(12870, 13000), effective: est(13.0, 13.1), marginal: fig(31) },
  }),
  year({
    year: 2026,
    tier: 'offen',
    missing: ['lohnsteuerbescheinigung', 'personB.lohnsteuerbescheinigung'],
    werbungskosten: { beide: { ...work(null, 2460), total: open(['werbungskosten']), angesetzt: open(['werbungskosten']) }, A: { ...work(null, 1230), total: open(), angesetzt: open() }, B: { ...work(null, 1230), total: open(), angesetzt: open() } },
  }),
]

export const DIFF_2024: AssessmentDiffDto = {
  year: 2024,
  filingType: 'zusammen',
  groups: [
    {
      group: 'einkuenfte',
      rows: [
        { position: 'bruttoarbeitslohnA', label: 'Bruttoarbeitslohn · Person A', role: 'own', person: 'A', declared: 54900, assessed: 54900, difference: 0, status: 'same', explanation: null, shortReason: null },
        { position: 'bruttoarbeitslohnB', label: 'Bruttoarbeitslohn · Person B', role: 'own', person: 'B', declared: 39000, assessed: 39000, difference: 0, status: 'same', explanation: null, shortReason: null },
      ],
    },
    {
      group: 'werbungskostenA',
      rows: [
        { position: 'fahrtwegA', label: 'Fahrtweg (Entfernungspauschale)', role: 'own', person: 'A', declared: 1320, assessed: 1320, difference: 0, status: 'same', explanation: null, shortReason: null },
        { position: 'homeofficeA', label: 'Homeoffice-Pauschale', role: 'own', person: 'A', declared: 1260, assessed: 1080, difference: -180, status: 'deviation', explanation: 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.', shortReason: '180 statt 210 Tage' },
        { position: 'arbeitsmittelA', label: 'Arbeitsmittel', role: 'own', person: 'A', declared: 380, assessed: 260, difference: -120, status: 'deviation', explanation: 'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.', shortReason: 'Handy nur zu 50 %' },
        { position: 'werbungskostenA', label: 'Summe Werbungskosten A', role: 'followOn', person: 'A', declared: 2960, assessed: 2660, difference: -300, status: 'deviation', explanation: null, shortReason: null },
      ],
    },
    {
      group: 'vorsorge',
      rows: [
        { position: 'vorsorgeaufwand', label: 'Vorsorgeaufwendungen', role: 'own', person: null, declared: 17968, assessed: 17968, difference: 0, status: 'same', explanation: null, shortReason: null },
        { position: 'sonderausgaben', label: 'Sonderausgaben', role: 'own', person: null, declared: 72, assessed: null, difference: null, status: 'not_read', explanation: null, shortReason: null },
      ],
    },
    {
      group: 'steuer',
      rows: [
        { position: 'zuVersteuerndesEinkommen', label: 'Zu versteuerndes Einkommen', role: 'followOn', person: null, declared: 70971, assessed: 71271, difference: 300, status: 'deviation', explanation: null, shortReason: null },
        { position: 'festgesetzteSteuer', label: 'Einkommensteuer', role: 'followOn', person: null, declared: 12078, assessed: 12170, difference: 92, status: 'deviation', explanation: null, shortReason: null },
        { position: 'anrechnung', label: 'Einbehaltene Lohnsteuer und anrechenbare Steuern', role: 'own', person: null, declared: 12979, assessed: 12979, difference: 0, status: 'same', explanation: null, shortReason: null },
        { position: 'erstattung', label: 'Erstattung', role: 'followOn', person: null, declared: 901, assessed: 809, difference: -92, status: 'deviation', explanation: null, shortReason: null },
      ],
    },
  ],
  ownDeviations: [
    { position: 'homeofficeA', label: 'Homeoffice-Pauschale', role: 'own', person: 'A', declared: 1260, assessed: 1080, difference: -180, status: 'deviation', explanation: 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.', shortReason: '180 statt 210 Tage', refundEffect: -56 },
    { position: 'arbeitsmittelA', label: 'Arbeitsmittel', role: 'own', person: 'A', declared: 380, assessed: 260, difference: -120, status: 'deviation', explanation: 'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.', shortReason: 'Handy nur zu 50 %', refundEffect: -37 },
  ],
  followOnChain: [
    { position: 'werbungskostenA', label: 'Summe Werbungskosten A', difference: -300 },
    { position: 'zuVersteuerndesEinkommen', label: 'Zu versteuerndes Einkommen', difference: 300 },
    { position: 'festgesetzteSteuer', label: 'Einkommensteuer', difference: 92 },
    { position: 'erstattung', label: 'Erstattung', difference: -92 },
  ],
  totalRefundEffect: -92,
  singleEffectsSum: -93,
  effectsDifferFromTotal: true,
  generalExplanations: [],
  counts: { positions: 11, same: 5, deviations: 2, notRead: 1 },
}

export const LESSONS_2024: AssessmentLessonDto[] = [
  {
    position: 'homeofficeA',
    label: 'Homeoffice-Pauschale',
    person: 'A',
    recognised: { declared: 1260, assessed: 1080, difference: -180 },
    nextYear: { year: 2025, source: 'filed', declared: 1260, declaredAboveRecognised: true },
    hint: 'Homeoffice-Tage laufend festhalten, zum Beispiel im Kalender oder mit einer Bescheinigung des Arbeitgebers.',
    mask: { screen: 'commute', field: 'homeOfficeDays', label: 'Homeoffice' },
  },
  {
    position: 'arbeitsmittelA',
    label: 'Arbeitsmittel',
    person: 'A',
    recognised: { declared: 380, assessed: 260, difference: -120 },
    nextYear: { year: 2025, source: 'filed', declared: 520, declaredAboveRecognised: true },
    hint: 'Den beruflichen Anteil gemischt genutzter Geräte belegen; ohne Nachweis erkennt das Finanzamt oft nur die Hälfte an.',
    mask: { screen: 'commute', field: 'workEquipmentEur', label: 'Arbeitsmittel' },
  },
]

const sameDiff = (yr: number, filingType: 'einzel' | 'zusammen', positions: number): AssessmentDiffDto => ({
  year: yr,
  filingType,
  groups: [{ group: 'steuer', rows: [{ position: 'erstattung', label: 'Erstattung', role: 'followOn', person: null, declared: 210, assessed: 210, difference: 0, status: 'same', explanation: null, shortReason: null }] }],
  ownDeviations: [],
  followOnChain: [],
  totalRefundEffect: 0,
  singleEffectsSum: 0,
  effectsDifferFromTotal: false,
  generalExplanations: [],
  counts: { positions, same: positions, deviations: 0, notRead: 0 },
})

export const HISTORY_DIFFS: YearDiffDto[] = [
  { year: 2024, person: null, submittedOn: '2026-09-21', assessmentDate: '2026-11-02', deadline: { endsOn: '2026-12-07', remainingDays: 19, running: true }, diff: DIFF_2024, lessons: LESSONS_2024 },
  { year: 2023, person: null, submittedOn: '2024-03-18', assessmentDate: '2024-05-22', deadline: { endsOn: '2024-06-24', remainingDays: -877, running: false }, diff: sameDiff(2023, 'zusammen', 12), lessons: [] },
  { year: 2022, person: 'A', submittedOn: '2023-04-02', assessmentDate: '2023-06-07', deadline: { endsOn: '2023-07-11', remainingDays: -1226, running: false }, diff: sameDiff(2022, 'einzel', 9), lessons: [] },
  { year: 2022, person: 'B', submittedOn: '2023-04-02', assessmentDate: '2023-06-07', deadline: { endsOn: '2023-07-11', remainingDays: -1226, running: false }, diff: sameDiff(2022, 'einzel', 9), lessons: [] },
]

/** ADR-0099 §1: until when the year can be filed or its Bescheid changed. */
const deadline = (kind: YearDeadlineDto['kind'], endsOn: string, remainingDays: number): YearDeadlineDto => ({ kind, endsOn, remainingDays, running: remainingDays >= 0, endsOnIfMandatory: null })
const listExtras = (d: YearDeadlineDto) => ({ hasData: true, filedElsewhere: null, withoutAssessment: false, deadline: d })

type Insights = Pick<YearHistoryResponseDto, 'events' | 'recurring' | 'prepayments' | 'repeatedCuts' | 'couples' | 'groups' | 'documents'>

/** ADR-0099: no events, checklist, groups or Unterlagen (a fresh account). */
export const NO_INSIGHTS: Insights = {
  events: [],
  recurring: null,
  prepayments: { years: [], backPaymentYears: 0, consecutiveBackPayments: 0, averageBackPayment: null, hint: null },
  repeatedCuts: [],
  couples: [],
  groups: { crossBorder: null, rental: null, capital: null, pension: null, lossCarryForward: { status: 'notRecorded' } },
  documents: [],
}

const APPEAL_2022: AppealHistoryEntryDto = { person: 'A', date: '2023-07-03', reason: 'betrag-falsch', outcome: 'teilweise', amount: 140 }

/** ADR-0099 for the mock's household: what the ideas mock shows, from the household's own data. */
const HOUSEHOLD_INSIGHTS: Insights = {
  events: [
    { year: 2023, kind: 'zusammenveranlagung', person: null },
    { year: 2024, kind: 'neuer-arbeitgeber', person: 'A', employers: ['Roche AG'] },
    { year: 2024, kind: 'grenzgaenger', person: 'A' },
    { year: 2025, kind: 'kind', person: null, date: '2025-03-14', count: 1 },
  ],
  recurring: {
    year: 2026,
    done: 2,
    open: 3,
    items: [
      { id: 'kontofuehrung', label: 'Kontoführung', lastYear: 2025, lastAmount: 32, lastDetail: null, currentAmount: 32, currentDetail: null, status: 'erledigt', receipt: null, cutInYears: [], fields: [{ screen: 'interview', field: 'kontofuehrung' }] },
      { id: 'arbeitsweg', label: 'Arbeitsweg', lastYear: 2025, lastAmount: null, lastDetail: { km: 67, days: 226 }, currentAmount: null, currentDetail: { km: 67, days: 226 }, status: 'erledigt', receipt: 'uebernommen', cutInYears: [], fields: [{ screen: 'commute', field: 'oneWayKm' }] },
      { id: 'homeoffice', label: 'Homeoffice', lastYear: 2025, lastAmount: null, lastDetail: { km: null, days: 210 }, currentAmount: null, currentDetail: null, status: 'offen', receipt: null, cutInYears: [2023, 2024], fields: [{ screen: 'commute', field: 'homeOfficeDays' }] },
      { id: 'spenden', label: 'Spenden', lastYear: 2025, lastAmount: 3135, lastDetail: null, currentAmount: null, currentDetail: null, status: 'offen', receipt: 'vorschlag', cutInYears: [], fields: [{ screen: 'interview', field: 'spenden-betrag' }] },
      { id: 'kita', label: 'Kita', lastYear: 2025, lastAmount: 591, lastDetail: null, currentAmount: null, currentDetail: null, status: 'offen', receipt: null, cutInYears: [], fields: [{ screen: 'children', field: 'kinderbetreuung' }] },
    ],
  },
  prepayments: {
    years: [
      { year: 2022, refund: 393, backPayment: null, prepayments: null, adjustPrepayments: false },
      { year: 2023, refund: 210, backPayment: null, prepayments: null, adjustPrepayments: false },
      { year: 2024, refund: 809, backPayment: null, prepayments: null, adjustPrepayments: false },
    ],
    backPaymentYears: 0,
    consecutiveBackPayments: 0,
    averageBackPayment: null,
    hint: null,
  },
  repeatedCuts: [
    {
      position: 'homeofficeA',
      type: 'homeoffice',
      person: 'A',
      label: 'Homeoffice-Pauschale',
      years: [
        { year: 2023, declared: 1260, assessed: 1080, difference: -180, refundEffect: -56 },
        { year: 2024, declared: 1260, assessed: 1080, difference: -180, refundEffect: -56 },
      ],
      hint: 'Homeoffice-Tage laufend festhalten, zum Beispiel im Kalender oder mit einer Bescheinigung des Arbeitgebers.',
    },
  ],
  couples: [
    { year: 2022, status: 'gerechnet', filedAs: 'einzel', approximate: false, singleTax: 11509, jointTax: 10869, jointSaving: 640, jointSavingRange: null, statement: 'eindeutig' },
    { year: 2023, status: 'gerechnet', filedAs: 'zusammen', approximate: true, singleTax: 13450, jointTax: 12390, jointSaving: 1060, jointSavingRange: { from: 940, to: 1180 }, statement: 'eindeutig' },
    { year: 2024, status: 'gerechnet', filedAs: 'zusammen', approximate: true, singleTax: 13290, jointTax: 12170, jointSaving: 1120, jointSavingRange: { from: 1010, to: 1230 }, statement: 'eindeutig' },
  ],
  groups: {
    crossBorder: {
      years: [
        { year: 2024, person: 'A', rate: 1.05, period: '2024', grossChf: 8000, grossEur: 8400, rateChangePercent: null, withholdingTaxChf: 360, creditedEur: 378, creditCapped: false },
        { year: 2025, person: 'A', rate: 1.065, period: '2025', grossChf: 49000, grossEur: 52185, rateChangePercent: 1.4, withholdingTaxChf: 2600, creditedEur: 2348, creditCapped: true },
      ],
      swissShare: [
        { year: 2024, percent: 18 },
        { year: 2025, percent: 100 },
      ],
    },
    rental: null,
    capital: {
      years: [
        { year: 2024, income: 2682, allowanceLimit: 2000, allowanceUsed: 2000, aboveAllowance: 682, fullyUsed: true, favourableCheck: { statement: 'eindeutig', delta: 0, recommendation: 'abgeltung' } },
        { year: 2025, income: 2449, allowanceLimit: 2000, allowanceUsed: 2000, aboveAllowance: 449, fullyUsed: true, favourableCheck: null },
      ],
    },
    pension: null,
    lossCarryForward: { status: 'notRecorded' },
  },
  documents: [
    { year: 2022, documents: [], submittedOn: '2023-04-02', assessmentDate: '2023-06-07', wait: { days: 66, weeks: 9, pending: false, askTaxOffice: false }, appeals: [APPEAL_2022] },
    { year: 2023, documents: [{ receiptId: 'bescheid-2023', fileName: 'Bescheid_2023.pdf', uploadedAt: '2024-05-24T09:12:00.000Z', downloadPath: '/v1/belege/bescheid-2023/datei' }], submittedOn: '2024-03-18', assessmentDate: '2024-05-22', wait: { days: 65, weeks: 9, pending: false, askTaxOffice: false }, appeals: [] },
    { year: 2024, documents: [{ receiptId: 'bescheid-2024', fileName: 'Bescheid_2024.pdf', uploadedAt: '2026-11-04T18:40:00.000Z', downloadPath: '/v1/belege/bescheid-2024/datei' }], submittedOn: '2026-09-21', assessmentDate: '2026-11-02', wait: { days: 42, weeks: 6, pending: false, askTaxOffice: false }, appeals: [] },
    { year: 2025, documents: [], submittedOn: '2026-08-14', assessmentDate: null, wait: { days: 96, weeks: 13, pending: true, askTaxOffice: true }, appeals: [] },
  ],
}

export const HISTORY_RESPONSE: YearHistoryResponseDto = {
  today: '2026-11-18',
  years: HISTORY_YEARS,
  list: [
    { year: 2021, status: 'extern-erledigt', kind: 'eckjahr', filingType: 'einzel', declaredRefund: null, assessedRefund: 220, difference: null, deviations: 0, noDiffReason: 'eckjahr', withinAssessmentPeriod: false, ...listExtras(deadline('aenderbar-bis', '2025-12-31', -322)) },
    { year: 2022, status: 'bescheid', kind: 'bescheid', filingType: 'einzel', declaredRefund: 393, assessedRefund: 393, difference: 0, deviations: 0, noDiffReason: null, withinAssessmentPeriod: true, ...listExtras(deadline('aenderbar-bis', '2026-12-31', 43)) },
    { year: 2023, status: 'bescheid', kind: 'bescheid', filingType: 'zusammen', declaredRefund: 210, assessedRefund: 210, difference: 0, deviations: 0, noDiffReason: null, withinAssessmentPeriod: true, ...listExtras(deadline('aenderbar-bis', '2027-12-31', 408)) },
    { year: 2024, status: 'bescheid', kind: 'bescheid', filingType: 'zusammen', declaredRefund: 901, assessedRefund: 809, difference: -92, deviations: 2, noDiffReason: null, withinAssessmentPeriod: true, ...listExtras(deadline('aenderbar-bis', '2029-01-02', 776)) },
    { year: 2025, status: 'eingereicht', kind: 'eingereicht', filingType: 'zusammen', declaredRefund: 1196, assessedRefund: null, difference: null, deviations: 0, noDiffReason: 'kein-bescheid', withinAssessmentPeriod: true, ...listExtras(deadline('abgabe-moeglich-bis', '2029-12-31', 1139)) },
    { year: 2026, status: 'entwurf', kind: 'offen', filingType: 'zusammen', declaredRefund: null, assessedRefund: null, difference: null, deviations: 0, noDiffReason: 'kein-bescheid', withinAssessmentPeriod: true, ...listExtras(deadline('abgabe-moeglich-bis', '2030-12-31', 1504)) },
  ],
  openItems: [
    { kind: 'einspruchsfrist', year: 2024, highlighted: true, refundDifference: -92, deviations: 2, deadline: { endsOn: '2026-12-07', remainingDays: 19, running: true } },
    { kind: 'offen', year: 2026, highlighted: false, missing: ['lohnsteuerbescheinigung', 'personB.lohnsteuerbescheinigung'] },
    {
      kind: 'wartet-auf-bescheid',
      year: 2025,
      highlighted: false,
      repeatedCuts: [
        { position: 'homeofficeA', label: 'Homeoffice-Pauschale' },
        { position: 'arbeitsmittelA', label: 'Arbeitsmittel' },
      ],
    },
  ],
  diffs: HISTORY_DIFFS,
  maskLessons: { year: 2026, fromYear: 2024, lessons: [LESSONS_2024[0]!] },
  ...HOUSEHOLD_INSIGHTS,
}

/**
 * ADR-0099 §1: the same household without 2022 in the app. The year of the Festsetzungsfrist has no data,
 * asks „Schon abgegeben?“ once, has no amount and can be filed until 31.12.2026.
 */
const GAP_2022: YearListItemDto = {
  year: 2022,
  status: 'entwurf',
  kind: 'offen',
  filingType: 'einzel',
  declaredRefund: null,
  assessedRefund: null,
  difference: null,
  deviations: 0,
  noDiffReason: 'kein-bescheid',
  withinAssessmentPeriod: true,
  hasData: false,
  filedElsewhere: { answer: null, answeredOn: null, askAgainFrom: null, ask: true },
  withoutAssessment: false,
  deadline: { kind: 'abgabe-moeglich-bis', endsOn: '2026-12-31', remainingDays: 43, running: true, endsOnIfMandatory: null },
}

export const HISTORY_GAP_RESPONSE: YearHistoryResponseDto = {
  ...HISTORY_RESPONSE,
  years: HISTORY_RESPONSE.years.map((y) => (y.year === 2022 ? year({ year: 2022, filingType: 'einzel', tier: 'offen', missing: ['erklaerung'] }) : y)),
  list: HISTORY_RESPONSE.list.map((l) => (l.year === 2022 ? GAP_2022 : l)),
  openItems: [...HISTORY_RESPONSE.openItems, { kind: 'offen', year: 2022, highlighted: false, missing: ['erklaerung'], filingDeadline: '2026-12-31', askFiledElsewhere: true }],
  diffs: HISTORY_RESPONSE.diffs.filter((d) => d.year !== 2022),
  couples: HISTORY_RESPONSE.couples.filter((c) => c.year !== 2022),
  documents: HISTORY_RESPONSE.documents.filter((d) => d.year !== 2022),
}

/** ADR-0099 §3, §7: every group tab with data — back payments, Grenzgänger, a rental flat, capital, a pension. */
export const HISTORY_ALL_GROUPS_RESPONSE: YearHistoryResponseDto = {
  ...HISTORY_RESPONSE,
  prepayments: {
    years: [
      { year: 2022, refund: -2100, backPayment: 2100, prepayments: 1200, adjustPrepayments: true },
      { year: 2023, refund: -2600, backPayment: 2600, prepayments: 1200, adjustPrepayments: true },
      { year: 2024, refund: -2500, backPayment: 2500, prepayments: 1600, adjustPrepayments: true },
    ],
    backPaymentYears: 3,
    consecutiveBackPayments: 3,
    averageBackPayment: 2400,
    hint: 'Vorauszahlungen anpassen lassen (Antrag beim Finanzamt).',
  },
  groups: {
    ...HISTORY_RESPONSE.groups,
    rental: {
      properties: [
        {
          propertyKey: 'objekt-1',
          label: 'Lindenstraße 4',
          acquiredOn: '2023-04-01',
          depreciation: { annual: 4200, ratePercent: 2 },
          years: [
            { year: 2023, result: -3100, missing: [], depreciation: 3150, bookValueEnd: 206850 },
            { year: 2024, result: -800, missing: [], depreciation: 4200, bookValueEnd: 202650 },
            { year: 2025, result: 1450, missing: [], depreciation: 4200, bookValueEnd: 198450 },
            { year: 2026, result: null, missing: ['mieteinnahmen'], depreciation: null, bookValueEnd: null },
          ],
          bookValue: 198450,
          yearsLeft: 47,
          acquisitionRelated: { windowEnd: '2026-04-01', limitEur: 37500, withinWindowEur: 12300, exceeds: false, roomLeftEur: 25200, windowOpen: false, undatedCounted: 1 },
        },
      ],
    },
    pension: {
      startYear: 2021,
      sharePercent: 81,
      allowance: 2944,
      allowanceYear: 2022,
      years: [
        { year: 2024, amount: 18400, taxablePart: 15456 },
        { year: 2025, amount: 19200, taxablePart: 16256 },
      ],
    },
  },
}

/** A fresh account: no year in the app yet. */
export const EMPTY_HISTORY_RESPONSE: YearHistoryResponseDto = { today: '2026-11-18', years: [], list: [], openItems: [], diffs: [], maskLessons: null, ...NO_INSIGHTS }
