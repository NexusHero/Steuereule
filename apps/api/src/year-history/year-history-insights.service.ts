import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  assessmentWait,
  capitalGroup,
  coupleComparison,
  crossBorderGroup,
  deserializeCapitalField,
  deserializePensionField,
  deserializeRentalField,
  deserializeRentalRepairs,
  isAppealReason,
  isPensionType,
  lifeEvents,
  pensionGroup,
  prepaymentSeries,
  recurringFactsOf,
  recurringItems,
  rentalGroup,
  repeatedCuts,
  wageTaxCertificateStatus,
  type AppealOutcome,
  type AppealReason,
  type AssessmentPositionValues,
  type AssessmentWait,
  type CapitalGroup,
  type ChurchTaxFactor,
  type CoupleComparison,
  type CrossBorderGroup,
  type LifeEvent,
  type LifeEventPerson,
  type PensionGroup,
  type PrepaymentSeries,
  type ProgressionClauseInput,
  type RecurringChecklist,
  type RecurringReceiptDraft,
  type RecurringYearFacts,
  type RentalGroup,
  type RentalPropertyYearFacts,
  type RepeatedCut,
} from '@steuereule/core'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../advisor/advisor.repository.js'
import { assessedValuesOf, hasAssessedValues } from '../assessment/assessment-positions.js'
import type { AssessmentRecord } from '../assessment/assessment.repository.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { exchangeRateFromRecord, nGreInputFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { RECEIPT_REPOSITORY, type ReceiptRepository } from '../receipt/receipt.repository.js'
import { RENTAL_REPOSITORY, type RentalObjectRecord, type RentalRepository } from '../rental/rental.repository.js'
import type { GatheredPerson, GatheredYear, YearDiff, YearListItem } from './year-history.service.js'

/** One Bescheid of the Unterlagen page: a stored receipt of the kind `Steuerbescheid` (ADR-0098 §4). */
export interface AssessmentDocument {
  readonly receiptId: string
  readonly fileName: string
  readonly uploadedAt: string
}

export interface AppealHistoryEntry {
  readonly person: 'A' | 'B' | null
  readonly date: string | null
  readonly reason: AppealReason | null
  readonly outcome: AppealOutcome | null
  readonly amount: number | null
}

/** Per year: its Bescheide, how long the Finanzamt took and the Einsprüche (ADR-0099 §9). */
export interface YearDocuments {
  readonly year: number
  readonly documents: readonly AssessmentDocument[]
  readonly submittedOn: string | null
  readonly assessmentDate: string | null
  readonly wait: AssessmentWait | null
  readonly appeals: readonly AppealHistoryEntry[]
}

export interface HistoryGroups {
  readonly crossBorder: CrossBorderGroup | null
  readonly rental: RentalGroup | null
  readonly capital: CapitalGroup | null
  readonly pension: PensionGroup | null
  /** Verlustvortrag and Verlustverrechnungstöpfe: the app does not record them yet (ADR-0099 §7). */
  readonly lossCarryForward: { readonly status: 'notRecorded' }
}

/** The ADR-0099 additions of `GET /v1/verlauf`. */
export interface YearHistoryInsights {
  readonly events: readonly LifeEvent[]
  readonly recurring: RecurringChecklist | null
  readonly prepayments: PrepaymentSeries
  readonly repeatedCuts: readonly RepeatedCut[]
  readonly couples: readonly CoupleComparison[]
  readonly groups: HistoryGroups
  /** Oldest first; only years with a Bescheid upload, a submission or an Einspruch. */
  readonly documents: readonly YearDocuments[]
}

export interface InsightsContext {
  readonly today: string
  readonly years: readonly GatheredYear[]
  readonly diffs: readonly YearDiff[]
  readonly list: readonly YearListItem[]
}

/** A whole-euro amount of a stored field; null when open, unclear or not a number. */
const amountOf = (value: string | null | undefined): number | null => (value !== null && value !== undefined && /^\d+$/.test(value) ? Number(value) : null)

function germanGross(person: GatheredPerson | null): number {
  if (person?.lstb == null) return 0
  const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(person.lstb))
  return state.kind === 'vollstaendig' ? state.bruttoarbeitslohn : 0
}

function employersOf(person: GatheredPerson | null): string[] {
  const names = [person?.lstb?.arbeitgeber, person?.ch?.nGre.arbeitgeberName].filter((n): n is string => typeof n === 'string' && n.trim() !== '')
  return names
}

function lifeEventPerson(person: GatheredPerson | null): LifeEventPerson {
  const crossBorder = person?.ch != null && exchangeRateFromRecord(person.ch) !== null
  return { employers: employersOf(person), crossBorder, wage: crossBorder || germanGross(person) > 0 }
}

/** The church tax rate the Bescheid implies, as the refund model reads it (8 % or 9 %). */
function churchTaxFactorOf(values: AssessmentPositionValues): ChurchTaxFactor {
  const tax = values.festgesetzteSteuer ?? 0
  const church = values.kirchensteuer ?? 0
  if (tax <= 0 || church <= 0) return 0
  return church / tax >= 0.085 ? 0.09 : 0.08
}

/** The progression clause as the year's answers name it; unknown when Lohnersatz was declared without an amount. */
function progressionClauseOf(answers: Readonly<Record<string, string>>): ProgressionClauseInput {
  if (answers.lohnersatz !== 'Ja') return { kind: 'keine' }
  const amount = amountOf(answers['lohnersatz-betrag'])
  return amount === null ? { kind: 'nicht-angegeben' } : { kind: 'lohnersatzleistungen', amount }
}

function zvEOf(assessment: AssessmentRecord | null): number | undefined {
  return hasAssessedValues(assessment) ? assessedValuesOf(assessment).zuVersteuerndesEinkommen : undefined
}

/**
 * The ADR-0099 parts of the Verlauf: events, the checklist of the open year, prepayments, repeated cuts,
 * couples, the groups and the Unterlagen. Reads the further facts it needs (children, Anlagen, receipts),
 * hands everything to the core and returns what it computed; nothing is stored.
 */
/** The records of several years by their tax year. */
function byYear<T extends { readonly taxYear: number }>(records: readonly T[]): Map<number, T> {
  return new Map(records.map((record) => [record.taxYear, record]))
}

@Injectable()
export class YearHistoryInsightsService {
  constructor(
    @Inject(CHILD_REPOSITORY) private readonly children: ChildRepository,
    @Inject(CAPITAL_REPOSITORY) private readonly capital: CapitalRepository,
    @Inject(PENSION_REPOSITORY) private readonly pension: PensionRepository,
    @Inject(RENTAL_REPOSITORY) private readonly rental: RentalRepository,
    @Inject(COMMUTE_REPOSITORY) private readonly commute: CommuteRepository,
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    /** The drafts the receipts staged (ADR-0097); without them the checklist shows no receipt state. */
    @Optional() @Inject(ADVISOR_REPOSITORY) private readonly advisor?: Pick<AdvisorRepository, 'listReceiptDrafts'>,
  ) {}

  async build(userId: string, context: InsightsContext): Promise<YearHistoryInsights> {
    const dataYears = context.years.filter((g) => g.hasData)
    const [children, rentals, receipts, capitals, pensions] = await Promise.all([
      this.children.listAllForUser(userId),
      this.rental.listForUser(userId),
      this.receipts.findAllForUser(userId),
      this.capital.listForUserAndYears(userId, dataYears.map((g) => g.year)),
      this.pension.listForUserAndYears(userId, dataYears.map((g) => g.year)),
    ])
    const cuts = repeatedCuts(context.diffs)
    return {
      events: this.events(dataYears, children.map((c) => c.geburtsdatum), rentals),
      recurring: await this.recurring(userId, context, cuts, { children, rentals, capitals: byYear(capitals), pensions: byYear(pensions) }),
      prepayments: prepaymentSeries(
        context.list
          .filter((l) => l.assessedRefund !== null)
          .map((l) => ({ year: l.year, refund: l.assessedRefund!, prepayments: amountOf(context.years.find((g) => g.year === l.year)?.answers['vorauszahlungen-betrag']) })),
      ),
      repeatedCuts: cuts,
      couples: context.years.flatMap((g) => this.couple(g)),
      groups: this.groups(context, rentals, byYear(capitals), byYear(pensions)),
      documents: this.documents(context, receipts),
    }
  }

  private events(years: readonly GatheredYear[], birthDates: readonly string[], rentals: readonly RentalObjectRecord[]): LifeEvent[] {
    return lifeEvents({
      years: years.map((g) => ({
        year: g.year,
        filingType: g.input.filingType,
        people: { A: lifeEventPerson(g.persons.A), B: g.persons.B === null ? null : lifeEventPerson(g.persons.B) },
        moved: g.answers.umzug === 'Ja',
      })),
      childBirthDates: birthDates,
      propertyAcquisitions: rentals.flatMap((r) => (r.anschaffungsdatum ? [{ propertyKey: r.propertyKey ?? r.id, acquiredOn: r.anschaffungsdatum }] : [])),
    })
  }

  /** The checklist of the latest open year with the items of the two years before (ADR-0099 §2). */
  private async recurring(
    userId: string,
    context: InsightsContext,
    cuts: readonly RepeatedCut[],
    sources: {
      children: Awaited<ReturnType<ChildRepository['listAllForUser']>>
      rentals: readonly RentalObjectRecord[]
      capitals: ReadonlyMap<number, Awaited<ReturnType<CapitalRepository['findForUserAndYear']>>>
      pensions: ReadonlyMap<number, Awaited<ReturnType<PensionRepository['findForUserAndYear']>>>
    },
  ): Promise<RecurringChecklist | null> {
    const open = context.years.filter((g) => g.kind === 'offen' && g.hasData).at(-1)
    if (open === undefined) return null
    const facts = new Map<number, RecurringYearFacts>()
    for (const g of context.years.filter((y) => y.hasData && y.year >= open.year - 2 && y.year <= open.year)) {
      const way = await this.commute.findForUserAndYear(userId, g.year)
      const rents = sources.rentals.filter((r) => r.taxYear === g.year).map((r) => deserializeRentalField(r.mieteinnahmen))
      const rentSum = rents.reduce((sum, f) => sum + (f.kind === 'erfasst' ? f.value : 0), 0)
      const capitalIncome = deserializeCapitalField(sources.capitals.get(g.year)?.kapitalertraege ?? null)
      const pensionAmount = deserializePensionField(sources.pensions.get(g.year)?.jahresbetrag ?? null)
      const lstb = g.persons.A.lstb
      const church = (amountOf(lstb?.kirchensteuer) ?? 0) + (amountOf(lstb?.kirchensteuerEhegatte) ?? 0)
      facts.set(
        g.year,
        recurringFactsOf({
          answers: g.answers,
          commute:
            way === null
              ? null
              : {
                  oneWayKm: way.oneWayKm,
                  travelDays: way.travelDays ?? null,
                  homeOfficeDays: way.homeOfficeDays,
                  workEquipmentEur: way.workEquipmentEur ?? null,
                  accountFeesEur: way.accountFeesEur ?? null,
                  professionalBodiesEur: way.professionalBodiesEur ?? null,
                },
          children: sources.children.filter((c) => c.taxYear === g.year).map((c) => ({ childcareEur: amountOf(c.childcareEur), healthBasicEur: amountOf(c.healthBasicEur) })),
          churchTax: church > 0 ? church : null,
          capitalIncome: capitalIncome.kind === 'erfasst' ? capitalIncome.value : null,
          rentalIncome: rentSum > 0 ? rentSum : null,
          pensionAmount: pensionAmount.kind === 'erfasst' ? pensionAmount.value : null,
        }),
      )
    }
    const drafts = (await this.advisor?.listReceiptDrafts(userId)) ?? []
    const receiptDrafts: RecurringReceiptDraft[] = drafts.filter((d) => d.taxYear === open.year && d.person === 'A').map((d) => ({ screen: d.screen, field: d.field, status: d.status }))
    return recurringItems({
      year: open.year,
      facts,
      receiptDrafts,
      cuts: cuts.flatMap((c) => c.years.map((y) => ({ type: c.type, year: y.year }))),
    })
  }

  /** The Veranlagungsart in both directions for a Bescheid year of a couple (ADR-0099 §6). */
  private couple(g: GatheredYear): CoupleComparison[] {
    if (g.input.people.B === null || !g.filings.every((f) => hasAssessedValues(f.assessment))) return []
    const progressionClause = progressionClauseOf(g.answers)
    if (g.input.filingType === 'zusammen') {
      const filing = g.filings[0]!
      const assessed = assessedValuesOf(filing.assessment)
      return [
        coupleComparison({
          year: g.year,
          filedAs: 'zusammen',
          zvE: assessed.zuVersteuerndesEinkommen,
          // The split per person comes from the version filed in the app, else from the Bescheid's own columns.
          split: filing.version?.positions ?? (assessed.bruttoarbeitslohnA !== undefined ? assessed : null),
          progressionClause,
          churchTaxFactor: churchTaxFactorOf(assessed),
        }),
      ]
    }
    const a = g.filings.find((f) => f.person === 'A')
    const b = g.filings.find((f) => f.person === 'B')
    if (a === undefined || b === undefined) return []
    return [
      coupleComparison({
        year: g.year,
        filedAs: 'einzel',
        zveA: zvEOf(a.assessment),
        zveB: zvEOf(b.assessment),
        progressionClause,
        churchTaxFactor: churchTaxFactorOf(assessedValuesOf(a.assessment)),
      }),
    ]
  }

  private groups(
    context: InsightsContext,
    rentals: readonly RentalObjectRecord[],
    capitals: ReadonlyMap<number, Awaited<ReturnType<CapitalRepository['findForUserAndYear']>>>,
    pensions: ReadonlyMap<number, Awaited<ReturnType<PensionRepository['findForUserAndYear']>>>,
  ): HistoryGroups {
    const years = context.years.filter((g) => g.hasData)
    const crossBorder = crossBorderGroup(
      years.map((g) => ({
        year: g.year,
        statements: (['A', 'B'] as const).flatMap((person) => {
          const ch = g.persons[person]?.ch ?? null
          const rate = exchangeRateFromRecord(ch)
          return ch === null || rate === null ? [] : [{ person, nGre: nGreInputFromRecord(ch, rate), period: rate.month }]
        }),
        germanGross: germanGross(g.persons.A) + germanGross(g.persons.B),
      })),
    )
    return {
      crossBorder,
      rental: rentalGroup(rentals.map(rentalFacts), context.today),
      capital: capitalGroup(
        years.map((g) => {
          const record = capitals.get(g.year) ?? null
          const income = deserializeCapitalField(record?.kapitalertraege ?? null)
          const used = deserializeCapitalField(record?.sparerPauschbetrag ?? null)
          return {
            year: g.year,
            filingType: g.input.filingType,
            income: income.kind === 'erfasst' ? income.value : null,
            allowanceUsed: used.kind === 'erfasst' ? used.value : null,
            zvE: zvEOf(g.filings[0]?.assessment ?? null) ?? null,
          }
        }),
      ),
      pension: pensionGroup(
        years.map((g) => {
          const record = pensions.get(g.year) ?? null
          const amount = deserializePensionField(record?.jahresbetrag ?? null)
          const start = deserializePensionField(record?.rentenbeginnJahr ?? null)
          return {
            year: g.year,
            kind: record?.rentenart && isPensionType(record.rentenart) ? record.rentenart : null,
            amount: amount.kind === 'erfasst' ? amount.value : null,
            startYear: start.kind === 'erfasst' ? start.value : null,
          }
        }),
      ),
      lossCarryForward: { status: 'notRecorded' },
    }
  }

  private documents(context: InsightsContext, receipts: Awaited<ReturnType<ReceiptRepository['findAllForUser']>>): YearDocuments[] {
    const notices = receipts.filter((r) => (r.kind ?? r.receiptType) === 'Steuerbescheid' && r.taxYear !== null)
    return context.years.flatMap((g): YearDocuments[] => {
      const documents = notices
        .filter((r) => r.taxYear === g.year)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((r) => ({ receiptId: r.id, fileName: r.fileName, uploadedAt: r.createdAt.toISOString() }))
      const submittedOn = g.filings.find((f) => f.version !== null)?.version?.submittedOn ?? null
      const assessmentDate = g.filings.find((f) => f.assessment?.assessmentDate)?.assessment?.assessmentDate ?? null
      const appeals = g.filings.flatMap((f): AppealHistoryEntry[] =>
        f.assessment === null || (f.assessment.status !== 'einspruch-eingelegt' && !f.assessment.appealDate)
          ? []
          : [
              {
                person: f.person,
                date: f.assessment.appealDate ?? null,
                reason: f.assessment.appealReason !== null && isAppealReason(f.assessment.appealReason) ? f.assessment.appealReason : null,
                outcome: f.assessment.appealOutcome ?? null,
                amount: f.assessment.appealOutcomeAmount !== null && f.assessment.appealOutcomeAmount !== undefined && /^-?\d+$/.test(f.assessment.appealOutcomeAmount) ? Number(f.assessment.appealOutcomeAmount) : null,
              },
            ],
      )
      if (documents.length === 0 && submittedOn === null && appeals.length === 0) return []
      return [{ year: g.year, documents, submittedOn, assessmentDate, wait: submittedOn === null ? null : assessmentWait(submittedOn, assessmentDate, context.today), appeals }]
    })
  }
}

/** A rental row as the core's group reads it; the address names the object. */
function rentalFacts(r: RentalObjectRecord): RentalPropertyYearFacts {
  const erfasst = (value: string | null) => {
    const f = deserializeRentalField(value)
    return f.kind === 'erfasst' ? f.value : null
  }
  const label = [r.strasse, r.hausnummer].filter((p) => p !== null && p !== undefined && p.trim() !== '').join(' ').trim() || (r.city ?? null)
  return {
    propertyKey: r.propertyKey ?? r.id,
    year: r.taxYear,
    label: label === '' ? null : label,
    income: erfasst(r.mieteinnahmen),
    umlagen: amountOf(r.umlagen),
    werbungskosten: erfasst(r.werbungskosten),
    schuldzinsen: amountOf(r.schuldzinsen),
    buildingCost: erfasst(r.anschaffungskosten),
    baujahr: erfasst(r.baujahr),
    acquiredOn: r.anschaffungsdatum ?? null,
    repairs: deserializeRentalRepairs(r.erhaltungsaufwand).map((repair) => ({ amount: repair.betrag, date: repair.datum })),
  }
}
