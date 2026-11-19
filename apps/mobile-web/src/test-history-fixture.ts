// The mock's example household (docs/mocks/steuer-verlauf.html) in the shape of `GET /v1/verlauf`, for
// tests only: 2021 an Eckjahr from an old Bescheid, 2022 two single returns, from 2023 joint, 2024 a
// Bescheid with two cuts and a running Einspruchsfrist, 2025 filed and waiting, 2026 open.
import type {
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

/** ADR-0099: no events, checklist, groups or Unterlagen in this household's fixture. */
const NO_INSIGHTS: Pick<YearHistoryResponseDto, 'events' | 'recurring' | 'prepayments' | 'repeatedCuts' | 'couples' | 'groups' | 'documents'> = {
  events: [],
  recurring: null,
  prepayments: { years: [], backPaymentYears: 0, consecutiveBackPayments: 0, averageBackPayment: null, hint: null },
  repeatedCuts: [],
  couples: [],
  groups: { crossBorder: null, rental: null, capital: null, pension: null, lossCarryForward: { status: 'notRecorded' } },
  documents: [],
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
  ...NO_INSIGHTS,
}

/** A fresh account: no year in the app yet. */
export const EMPTY_HISTORY_RESPONSE: YearHistoryResponseDto = { today: '2026-11-18', years: [], list: [], openItems: [], diffs: [], maskLessons: null, ...NO_INSIGHTS }
