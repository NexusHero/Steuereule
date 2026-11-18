import { employeeLumpSum, type AssessmentPositionId, type AssessmentPositionValues } from '../engine/assessment'
import type { Range } from '../engine/tax-estimate'
import { incomeTax, isSupportedIncomeTaxYear, splittingTariff } from '../math/tarif'

/**
 * Steuer-Verlauf (ADR-0098): the four key figures of every year, each with its tier, and the change to
 * the year before. A pure function over the facts the API decrypted; nothing here is stored.
 *
 * Tiers (ADR-0098 §3): `bescheid` is an exact number — from the Bescheid, or a fact of the LStB or the
 * Swiss Lohnausweis, which are exact without a Bescheid (the source says which). `schaetzung` is a range
 * from the core's estimate, never a midpoint. `offen` names what is missing.
 */

export type HistoryTier = 'bescheid' | 'schaetzung' | 'offen'
export type HistorySource = 'bescheid' | 'lohnsteuerbescheinigung' | 'lohnausweis' | 'erklaerung' | 'schaetzung'

export type HistoryValue =
  | { readonly tier: 'bescheid'; readonly value: number; readonly source: HistorySource }
  | { readonly tier: 'schaetzung'; readonly range: Range; readonly source: HistorySource }
  | { readonly tier: 'offen'; readonly missing: readonly string[] }

/** The change to the year before: a range when either side is one, none from or to an open year. */
export type HistoryDelta =
  | { readonly kind: 'exact'; readonly absolute: number; readonly percent: number | null }
  | { readonly kind: 'range'; readonly absolute: Range; readonly percent: Range | null }
  | { readonly kind: 'none'; readonly reason: 'kein-vorjahr' | 'offen' | 'veranlagungsart-gewechselt' }

export type HistoryFigure = HistoryValue & { readonly delta: HistoryDelta }

/** Wage facts of one person in EUR; a Swiss wage converted at the year's rate (ADR-0042). */
export interface WageFacts {
  readonly gross: number
  readonly wageTax: number
  readonly solidaritaetszuschlag: number
  readonly churchTax: number
  readonly socialSecurity: number
  readonly source: 'lohnsteuerbescheinigung' | 'lohnausweis'
  readonly exchangeRate: { readonly rate: number; readonly period: string } | null
}

export interface WorkExpenseParts {
  readonly fahrtweg: number
  readonly homeoffice: number
  readonly arbeitsmittel: number
  readonly sonstiges: number
}

export interface PersonYearFacts {
  readonly wage: WageFacts | null
  /** What the declaration (today's answers or, once filed, the frozen version) claims. */
  readonly declaredWorkExpenses: WorkExpenseParts | null
}

/** The core's estimate of one filing, as the Cockpit computes it (ADR-0094); null when it cannot. */
export interface EstimateFacts {
  readonly result: Range
  readonly incomeTax: Range
  readonly taxableIncome: Range
}

/**
 * One filing of the year: the household's joint one (`person: null`), or one per person in single
 * returns. In a single return the Bescheid's person-A positions are the filing person's.
 */
export interface FilingYearFacts {
  readonly person: 'A' | 'B' | null
  readonly estimate: EstimateFacts | null
  /** The positions read from the Bescheid; null without a Bescheid. Unread positions are absent. */
  readonly assessment: AssessmentPositionValues | null
  /** The refund of the version frozen at submission; null when nothing was filed in the app. */
  readonly declaredRefund: number | null
  /** The last estimate before the Bescheid, frozen with the submission. */
  readonly estimateAtSubmission: Range | null
}

export interface YearHistoryInput {
  readonly year: number
  readonly filingType: 'einzel' | 'zusammen'
  /** A year known only from an uploaded Bescheid (ADR-0098 §4, `extern-erledigt`). */
  readonly eckjahr: boolean
  readonly people: { readonly A: PersonYearFacts; readonly B: PersonYearFacts | null }
  readonly filings: readonly FilingYearFacts[]
  /** What the year still lacks for an estimate (the estimate's `missing`). */
  readonly missing: readonly string[]
}

export interface NetFigures {
  readonly brutto: HistoryFigure
  readonly lohnsteuer: HistoryFigure
  readonly solidaritaetszuschlag: HistoryFigure
  readonly kirchensteuer: HistoryFigure
  readonly sozialversicherung: HistoryFigure
  readonly netto: HistoryFigure
  /** Netto ÷ Brutto in %, one decimal. */
  readonly nettoQuote: HistoryFigure
  /** The CHF rates the Swiss wages went in at (for the tooltip). */
  readonly exchangeRates: ReadonlyArray<{ readonly rate: number; readonly period: string }>
}

export interface HouseholdNetFigures extends NetFigures {
  /** Netto plus the Abschlusszahlung (ADR-0098 §2); household only, the refund is not split. */
  readonly nettoNachErstattung: HistoryFigure
}

export interface WorkExpenseFigures {
  /** The sum of the Werbungskosten: from the Bescheid, else what was declared. */
  readonly total: HistoryFigure
  /** What counted: the sum, at least the Arbeitnehmer-Pauschbetrag. */
  readonly angesetzt: HistoryFigure
  /** The parts as declared (or read from the Bescheid); null where only the sum is known (an Eckjahr). */
  readonly parts: WorkExpenseParts | null
  readonly partsSource: 'bescheid' | 'erklaerung' | null
  /** The year's Arbeitnehmer-Pauschbetrag times the persons; null for a year the app knows nothing of. */
  readonly pauschbetrag: number | null
  /** The sum stayed below the lump sum, so the lump sum counted; null while the sum is open. */
  readonly belowLumpSum: boolean | null
}

export interface RefundFigures {
  /** Positive = Erstattung, negative = Nachzahlung. */
  readonly amount: HistoryFigure
  readonly declared: number | null
  /** Assessed minus declared; null without both. */
  readonly difference: number | null
  readonly estimateBeforeAssessment: Range | null
  /** Two single returns added up (ADR-0098 §8). */
  readonly sumOfSingleFilings: boolean
}

export interface TaxRateFigures {
  readonly incomeTax: HistoryFigure
  /** Income tax ÷ household gross in %, one decimal. */
  readonly effective: HistoryFigure
  /** Grenzsteuersatz in whole %, from the tariff at the zvE (splitting when joint); null for single returns. */
  readonly marginal: HistoryFigure | null
}

export interface YearHistoryEntry {
  readonly year: number
  readonly filingType: 'einzel' | 'zusammen'
  readonly filingTypeChanged: boolean
  readonly eckjahr: boolean
  readonly tier: HistoryTier
  readonly missing: readonly string[]
  readonly persons: readonly ('A' | 'B')[]
  readonly netto: { readonly beide: HouseholdNetFigures; readonly A: NetFigures; readonly B: NetFigures | null }
  readonly werbungskosten: { readonly beide: WorkExpenseFigures; readonly A: WorkExpenseFigures; readonly B: WorkExpenseFigures | null }
  readonly erstattung: RefundFigures
  readonly steuerquote: TaxRateFigures
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

const exact = (value: number, source: HistorySource): HistoryValue => ({ tier: 'bescheid', value, source })
const estimated = (range: Range, source: HistorySource): HistoryValue => ({ tier: 'schaetzung', range, source })
const open = (missing: readonly string[]): HistoryValue => ({ tier: 'offen', missing })

const rangeOf = (v: HistoryValue): Range | null => (v.tier === 'bescheid' ? { from: v.value, to: v.value } : v.tier === 'schaetzung' ? v.range : null)

/** Adds values: open if any is open, a range if any is a range, exact otherwise. */
function sumValues(values: readonly HistoryValue[], source: HistorySource): HistoryValue {
  const missing = values.flatMap((v) => (v.tier === 'offen' ? v.missing : []))
  if (values.some((v) => v.tier === 'offen')) return open([...new Set(missing)])
  const ranges = values.map((v) => rangeOf(v)!)
  const total = { from: ranges.reduce((s, r) => s + r.from, 0), to: ranges.reduce((s, r) => s + r.to, 0) }
  return values.every((v) => v.tier === 'bescheid') ? exact(total.from, source) : estimated(total, source)
}

/** a ÷ b × 100 at one decimal over the corners of both ranges; open when either is. */
function quotient(a: HistoryValue, b: HistoryValue, source: HistorySource): HistoryValue {
  const ra = rangeOf(a)
  const rb = rangeOf(b)
  if (ra === null || rb === null) return open([...(a.tier === 'offen' ? a.missing : []), ...(b.tier === 'offen' ? b.missing : [])])
  if (rb.from <= 0 || rb.to <= 0) return open(['brutto'])
  const corners = [ra.from / rb.from, ra.from / rb.to, ra.to / rb.from, ra.to / rb.to].map((q) => round1(q * 100))
  const range = { from: Math.min(...corners), to: Math.max(...corners) }
  return a.tier === 'bescheid' && b.tier === 'bescheid' ? exact(range.from, source) : estimated(range, source)
}

const round1 = (n: number) => Math.round(n * 10) / 10

// ---------------------------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------------------------

/**
 * The change to the year before (ADR-0098 §2, §3): between two ranges a range (low = current low minus
 * previous high), none to or from an open year. `points` figures are percentages: their change is in
 * percentage points and has no percent of its own.
 */
export function historyDelta(current: HistoryValue, previous: HistoryValue | null, points = false): HistoryDelta {
  if (previous === null) return { kind: 'none', reason: 'kein-vorjahr' }
  const c = rangeOf(current)
  const p = rangeOf(previous)
  if (c === null || p === null) return { kind: 'none', reason: 'offen' }
  const absolute = { from: round1(c.from - p.to), to: round1(c.to - p.from) }
  const percentOf = (x: number, y: number) => round1((x / y - 1) * 100)
  const percent =
    points || p.from <= 0 || p.to <= 0
      ? null
      : (() => {
          const corners = [percentOf(c.from, p.from), percentOf(c.from, p.to), percentOf(c.to, p.from), percentOf(c.to, p.to)]
          return { from: Math.min(...corners), to: Math.max(...corners) }
        })()
  if (current.tier === 'bescheid' && previous.tier === 'bescheid') {
    return { kind: 'exact', absolute: absolute.from, percent: percent === null ? null : percent.from }
  }
  return { kind: 'range', absolute, percent }
}

const withDelta = (value: HistoryValue, previous: HistoryValue | null | undefined, points = false): HistoryFigure => ({
  ...value,
  delta: historyDelta(value, previous ?? null, points),
})

/** A household figure across a change of the Veranlagungsart has no change to the year before (§ 6). */
const withoutComparison = (value: HistoryValue): HistoryFigure => ({ ...value, delta: { kind: 'none', reason: 'veranlagungsart-gewechselt' } })

// ---------------------------------------------------------------------------------------------
// Per year, before the deltas
// ---------------------------------------------------------------------------------------------

interface RawNet {
  brutto: HistoryValue
  lohnsteuer: HistoryValue
  solidaritaetszuschlag: HistoryValue
  kirchensteuer: HistoryValue
  sozialversicherung: HistoryValue
  netto: HistoryValue
  nettoQuote: HistoryValue
  exchangeRates: { rate: number; period: string }[]
}

interface RawWorkExpenses {
  total: HistoryValue
  angesetzt: HistoryValue
  parts: WorkExpenseParts | null
  partsSource: 'bescheid' | 'erklaerung' | null
  pauschbetrag: number | null
}

interface RawYear {
  input: YearHistoryInput
  tier: HistoryTier
  persons: ('A' | 'B')[]
  net: { beide: RawNet & { nettoNachErstattung: HistoryValue }; A: RawNet; B: RawNet | null }
  wk: { beide: RawWorkExpenses; A: RawWorkExpenses; B: RawWorkExpenses | null }
  refund: { amount: HistoryValue; declared: number | null; difference: number | null; estimateBeforeAssessment: Range | null; sumOfSingleFilings: boolean }
  rate: { incomeTax: HistoryValue; effective: HistoryValue; marginal: HistoryValue | null }
}

const MISSING_WAGE = 'lohnsteuerbescheinigung'

/** The Bescheid's position of a person: the joint Bescheid's own column, or the person's single Bescheid. */
function assessedOf(input: YearHistoryInput, person: 'A' | 'B', position: 'bruttoarbeitslohn' | 'werbungskosten' | 'fahrtweg' | 'homeoffice' | 'arbeitsmittel' | 'sonstigeWerbungskosten'): number | undefined {
  if (input.filingType === 'zusammen') return input.filings[0]?.assessment?.[`${position}${person}` as AssessmentPositionId]
  const filing = input.filings.find((f) => (f.person ?? 'A') === person)
  return filing?.assessment?.[`${position}A` as AssessmentPositionId]
}

function hasAssessment(input: YearHistoryInput, person: 'A' | 'B'): boolean {
  return input.filingType === 'zusammen' ? input.filings[0]?.assessment != null : input.filings.find((f) => (f.person ?? 'A') === person)?.assessment != null
}

function rawNet(input: YearHistoryInput, person: 'A' | 'B'): RawNet {
  const wage = input.people[person]?.wage ?? null
  if (wage === null) {
    // An Eckjahr's Bescheid may print the gross wage, but not what was withheld: netto stays open.
    const gross = assessedOf(input, person, 'bruttoarbeitslohn')
    const brutto = gross === undefined ? open([MISSING_WAGE]) : exact(gross, 'bescheid')
    const missing = open([MISSING_WAGE])
    return { brutto, lohnsteuer: missing, solidaritaetszuschlag: missing, kirchensteuer: missing, sozialversicherung: missing, netto: missing, nettoQuote: missing, exchangeRates: [] }
  }
  const netto = wage.gross - wage.wageTax - wage.solidaritaetszuschlag - wage.churchTax - wage.socialSecurity
  const brutto = exact(wage.gross, wage.source)
  const nettoValue = exact(netto, wage.source)
  return {
    brutto,
    lohnsteuer: exact(wage.wageTax, wage.source),
    solidaritaetszuschlag: exact(wage.solidaritaetszuschlag, wage.source),
    kirchensteuer: exact(wage.churchTax, wage.source),
    sozialversicherung: exact(wage.socialSecurity, wage.source),
    netto: nettoValue,
    nettoQuote: quotient(nettoValue, brutto, wage.source),
    exchangeRates: wage.exchangeRate ? [wage.exchangeRate] : [],
  }
}

function sumNet(a: RawNet, b: RawNet | null): RawNet {
  if (b === null) return a
  const source = (x: HistoryValue): HistorySource => (x.tier === 'offen' ? 'lohnsteuerbescheinigung' : x.source)
  const add = (key: keyof Omit<RawNet, 'exchangeRates' | 'nettoQuote'>) => sumValues([a[key], b[key]], source(a[key]))
  const brutto = add('brutto')
  const netto = add('netto')
  return {
    brutto,
    lohnsteuer: add('lohnsteuer'),
    solidaritaetszuschlag: add('solidaritaetszuschlag'),
    kirchensteuer: add('kirchensteuer'),
    sozialversicherung: add('sozialversicherung'),
    netto,
    nettoQuote: quotient(netto, brutto, source(netto)),
    exchangeRates: [...a.exchangeRates, ...b.exchangeRates],
  }
}

const partsTotal = (p: WorkExpenseParts) => p.fahrtweg + p.homeoffice + p.arbeitsmittel + p.sonstiges

function rawWorkExpenses(input: YearHistoryInput, person: 'A' | 'B', yearOpen: boolean): RawWorkExpenses {
  const lumpSum = employeeLumpSum(input.year)
  const declared = input.people[person]?.declaredWorkExpenses ?? null
  if (hasAssessment(input, person)) {
    const total = assessedOf(input, person, 'werbungskosten')
    const parts = {
      fahrtweg: assessedOf(input, person, 'fahrtweg'),
      homeoffice: assessedOf(input, person, 'homeoffice'),
      arbeitsmittel: assessedOf(input, person, 'arbeitsmittel'),
      sonstiges: assessedOf(input, person, 'sonstigeWerbungskosten'),
    }
    const readParts = Object.values(parts).some((v) => v !== undefined)
      ? { fahrtweg: parts.fahrtweg ?? 0, homeoffice: parts.homeoffice ?? 0, arbeitsmittel: parts.arbeitsmittel ?? 0, sonstiges: parts.sonstiges ?? 0 }
      : null
    const sum = total ?? (readParts ? partsTotal(readParts) : undefined)
    if (sum !== undefined) {
      return {
        total: exact(sum, 'bescheid'),
        angesetzt: exact(lumpSum === null ? sum : Math.max(sum, lumpSum), 'bescheid'),
        parts: readParts ?? declared,
        partsSource: readParts ? 'bescheid' : declared ? 'erklaerung' : null,
        pauschbetrag: lumpSum,
      }
    }
  }
  if (declared === null || yearOpen) {
    const missing = open(['werbungskosten'])
    return { total: missing, angesetzt: missing, parts: declared, partsSource: declared ? 'erklaerung' : null, pauschbetrag: lumpSum }
  }
  // Without a Bescheid what counts depends on it (ADR-0098 §3): a range, even when it is one number.
  const sum = partsTotal(declared)
  const counted = lumpSum === null ? sum : Math.max(sum, lumpSum)
  return {
    total: estimated({ from: sum, to: sum }, 'erklaerung'),
    angesetzt: estimated({ from: counted, to: counted }, 'erklaerung'),
    parts: declared,
    partsSource: 'erklaerung',
    pauschbetrag: lumpSum,
  }
}

function sumWorkExpenses(a: RawWorkExpenses, b: RawWorkExpenses | null): RawWorkExpenses {
  if (b === null) return a
  const parts =
    a.parts && b.parts
      ? { fahrtweg: a.parts.fahrtweg + b.parts.fahrtweg, homeoffice: a.parts.homeoffice + b.parts.homeoffice, arbeitsmittel: a.parts.arbeitsmittel + b.parts.arbeitsmittel, sonstiges: a.parts.sonstiges + b.parts.sonstiges }
      : null
  const source = (x: HistoryValue): HistorySource => (x.tier === 'offen' ? 'erklaerung' : x.source)
  return {
    total: sumValues([a.total, b.total], source(a.total)),
    angesetzt: sumValues([a.angesetzt, b.angesetzt], source(a.angesetzt)),
    parts,
    partsSource: parts ? (a.partsSource === 'bescheid' && b.partsSource === 'bescheid' ? 'bescheid' : 'erklaerung') : null,
    pauschbetrag: a.pauschbetrag === null || b.pauschbetrag === null ? null : a.pauschbetrag + b.pauschbetrag,
  }
}

/** One filing's value: the Bescheid's position, else the estimate's range, else open. */
function filingValue(filing: FilingYearFacts, position: 'erstattung' | 'festgesetzteSteuer', estimate: (e: EstimateFacts) => Range, missing: readonly string[]): HistoryValue {
  const assessed = filing.assessment?.[position]
  if (assessed !== undefined) return exact(assessed, 'bescheid')
  if (filing.assessment != null) return open([`bescheid-${position}`])
  if (filing.estimate !== null) return estimated(estimate(filing.estimate), 'schaetzung')
  return open(missing.length > 0 ? missing : ['schaetzung'])
}

/** Grenzsteuersatz in whole % from the core's tariff: the tax on the next 100 € of zvE. */
function marginalRate(zvE: number, year: number, joint: boolean): number {
  const tariff = (v: number) => (joint ? splittingTariff(v, 0, year) : incomeTax(v, year))
  return Math.round(tariff(Math.max(0, zvE) + 100) - tariff(Math.max(0, zvE)))
}

function rawMarginal(input: YearHistoryInput): HistoryValue | null {
  if (input.filingType !== 'zusammen') return null
  if (!isSupportedIncomeTaxYear(input.year)) return open(['tarif'])
  const filing = input.filings[0]
  const zvE = filing?.assessment?.zuVersteuerndesEinkommen
  if (zvE !== undefined) return exact(marginalRate(zvE, input.year, true), 'bescheid')
  if (filing?.estimate) {
    const lo = marginalRate(filing.estimate.taxableIncome.from, input.year, true)
    const hi = marginalRate(filing.estimate.taxableIncome.to, input.year, true)
    return estimated({ from: Math.min(lo, hi), to: Math.max(lo, hi) }, 'schaetzung')
  }
  return open(input.missing.length > 0 ? input.missing : ['schaetzung'])
}

function yearTier(input: YearHistoryInput): HistoryTier {
  if (input.filings.length === 0) return 'offen'
  if (input.filings.every((f) => f.assessment != null)) return 'bescheid'
  return input.filings.every((f) => f.assessment != null || f.estimate !== null) ? 'schaetzung' : 'offen'
}

function rawYear(input: YearHistoryInput): RawYear {
  const tier = yearTier(input)
  const persons: ('A' | 'B')[] = input.people.B === null ? ['A'] : ['A', 'B']
  const netA = rawNet(input, 'A')
  const netB = input.people.B === null ? null : rawNet(input, 'B')
  const wkA = rawWorkExpenses(input, 'A', tier === 'offen')
  const wkB = input.people.B === null ? null : rawWorkExpenses(input, 'B', tier === 'offen')

  const refunds = input.filings.map((f) => filingValue(f, 'erstattung', (e) => e.result, input.missing))
  const amount = refunds.length === 0 ? open(input.missing.length > 0 ? input.missing : ['erklaerung']) : sumValues(refunds, refunds[0]!.tier === 'offen' ? 'schaetzung' : refunds[0]!.source)
  const declaredAll = input.filings.map((f) => f.declaredRefund)
  const declared = declaredAll.length > 0 && declaredAll.every((d) => d !== null) ? declaredAll.reduce<number>((s, d) => s + d!, 0) : null
  const assessedRefund = amount.tier === 'bescheid' && amount.source === 'bescheid' ? amount.value : null
  const before = input.filings.map((f) => f.estimateAtSubmission)
  const estimateBeforeAssessment =
    before.length > 0 && before.every((r) => r !== null) ? { from: before.reduce((s, r) => s + r!.from, 0), to: before.reduce((s, r) => s + r!.to, 0) } : null

  const taxes = input.filings.map((f) => filingValue(f, 'festgesetzteSteuer', (e) => e.incomeTax, input.missing))
  const incomeTaxValue = taxes.length === 0 ? open(input.missing.length > 0 ? input.missing : ['erklaerung']) : sumValues(taxes, taxes[0]!.tier === 'offen' ? 'schaetzung' : taxes[0]!.source)
  const householdNet = sumNet(netA, netB)

  const nettoNachErstattung = sumValues([householdNet.netto, amount], amount.tier === 'bescheid' ? 'bescheid' : 'schaetzung')
  return {
    input,
    tier,
    persons,
    net: { beide: { ...householdNet, nettoNachErstattung }, A: netA, B: netB },
    wk: { beide: sumWorkExpenses(wkA, wkB), A: wkA, B: wkB },
    refund: {
      amount,
      declared,
      difference: declared !== null && assessedRefund !== null ? assessedRefund - declared : null,
      estimateBeforeAssessment,
      sumOfSingleFilings: input.filingType === 'einzel' && input.filings.length > 1,
    },
    rate: {
      incomeTax: incomeTaxValue,
      effective: quotient(incomeTaxValue, householdNet.brutto, incomeTaxValue.tier === 'bescheid' ? incomeTaxValue.source : 'schaetzung'),
      marginal: rawMarginal(input),
    },
  }
}

// ---------------------------------------------------------------------------------------------
// With the year before
// ---------------------------------------------------------------------------------------------

function netWithDelta(cur: RawNet, prev: RawNet | null | undefined): NetFigures {
  return {
    brutto: withDelta(cur.brutto, prev?.brutto),
    lohnsteuer: withDelta(cur.lohnsteuer, prev?.lohnsteuer),
    solidaritaetszuschlag: withDelta(cur.solidaritaetszuschlag, prev?.solidaritaetszuschlag),
    kirchensteuer: withDelta(cur.kirchensteuer, prev?.kirchensteuer),
    sozialversicherung: withDelta(cur.sozialversicherung, prev?.sozialversicherung),
    netto: withDelta(cur.netto, prev?.netto),
    nettoQuote: withDelta(cur.nettoQuote, prev?.nettoQuote, true),
    exchangeRates: cur.exchangeRates,
  }
}

function wkWithDelta(cur: RawWorkExpenses, prev: RawWorkExpenses | null | undefined): WorkExpenseFigures {
  const total = rangeOf(cur.total)
  return {
    total: withDelta(cur.total, prev?.total),
    angesetzt: withDelta(cur.angesetzt, prev?.angesetzt),
    parts: cur.parts,
    partsSource: cur.partsSource,
    pauschbetrag: cur.pauschbetrag,
    belowLumpSum: total === null || cur.pauschbetrag === null ? null : total.to < cur.pauschbetrag,
  }
}

function entry(cur: RawYear, prev: RawYear | undefined): YearHistoryEntry {
  const changed = prev !== undefined && prev.input.filingType !== cur.input.filingType
  // Erstattung and Steuerquote exist only for the household; across a change of the Veranlagungsart
  // the two years are not the same thing, so there is no change to the year before (ADR-0098 §6).
  const household = (value: HistoryValue, previous: HistoryValue | null | undefined, points = false) =>
    changed ? withoutComparison(value) : withDelta(value, previous, points)
  return {
    year: cur.input.year,
    filingType: cur.input.filingType,
    filingTypeChanged: changed,
    eckjahr: cur.input.eckjahr,
    tier: cur.tier,
    missing: cur.tier === 'offen' ? (cur.input.missing.length > 0 ? cur.input.missing : ['erklaerung']) : [],
    persons: cur.persons,
    netto: {
      beide: { ...netWithDelta(cur.net.beide, prev?.net.beide), nettoNachErstattung: household(cur.net.beide.nettoNachErstattung, prev?.net.beide.nettoNachErstattung) },
      A: netWithDelta(cur.net.A, prev?.net.A),
      B: cur.net.B === null ? null : netWithDelta(cur.net.B, prev?.net.B),
    },
    werbungskosten: {
      beide: wkWithDelta(cur.wk.beide, prev?.wk.beide),
      A: wkWithDelta(cur.wk.A, prev?.wk.A),
      B: cur.wk.B === null ? null : wkWithDelta(cur.wk.B, prev?.wk.B),
    },
    erstattung: { ...cur.refund, amount: household(cur.refund.amount, prev?.refund.amount) },
    steuerquote: {
      incomeTax: household(cur.rate.incomeTax, prev?.rate.incomeTax),
      effective: household(cur.rate.effective, prev?.rate.effective, true),
      marginal: cur.rate.marginal === null ? null : household(cur.rate.marginal, prev?.rate.marginal, true),
    },
  }
}

/**
 * The Verlauf over all years (ADR-0098 §5), oldest first. The year before is the calendar year before:
 * a gap year means no change is shown, not a change over two years.
 */
export function buildYearHistory(years: readonly YearHistoryInput[]): YearHistoryEntry[] {
  const raw = [...years].sort((a, b) => a.year - b.year).map(rawYear)
  const byYear = new Map(raw.map((r) => [r.input.year, r]))
  return raw.map((r) => entry(r, byYear.get(r.input.year - 1)))
}
