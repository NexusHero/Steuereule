import { Inject, Injectable } from '@nestjs/common'
import { withSpan } from '../telemetry/tracer.js'
import {
  annexNGreAmounts,
  employeeFromAnswers,
  calculateWorkdays,
  chfToEur,
  gatedIncomeTypes,
  wageTaxCertificateStatus,
  openSalaryCertificateFields,
  commuterAllowance,
  taxEstimateEmployee,
  homeOfficeAllowance,
  churchMembership,
  lookupPostalCode,
  type ChurchTaxInput,
  type EstimateChurchTax,
  type GermanState,
  taxEstimateCrossBorder,
  depreciationRatePercent,
  claimMonths,
  estimateMarriedCouple,
  monthlyChildBenefitClaim,
  laterAmountSteps,
  widenForLaterAmounts,
  householdServicesFromAnswers,
  calculateHouseholdServicesReduction,
  extraordinaryBurdenFromAnswers,
  burdenChildrenBracket,
  amountFromAnswer,
  type Answers,
  type SpouseIncome,
  type TaxEstimate,
  effectivePublicHolidays,
} from '@steuereule/core'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../config/features.js'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from '../commute/commute.repository.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersFrom } from '../interview/answers.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { churchTaxDtoFrom } from '../lstb/lstb.service.js'
import type { WageTaxCertificateRecord } from '../lstb/lstb.repository.js'

export type TaxEstimateStatus =
  | (Omit<Extract<TaxEstimate, { kind: 'spanne' }>, 'churchTax'> & {
      /** True when church tax applies but is not part of the result (kept for the cockpit hint). */
      readonly churchTaxOpen: boolean
      readonly churchTax?: EstimateChurchTax
      readonly jointAssessment?: boolean
      readonly laterAmounts?: number
    })
  | { readonly kind: 'offen'; readonly missing: readonly string[] }
  | { readonly kind: 'nicht-moeglich'; readonly reason: string }

const CH_FOREIGN = 'Ja, in die Schweiz'

/** Ranged refund / back-payment estimate from everything the user has entered for one tax year (product ADR-015). */
@Injectable()
export class TaxEstimateService {
  constructor(
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstb: WageTaxCertificateRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chSalaryCertificate: CrossBorderSalaryStatementRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterData: MasterDataRepository,
    @Inject(COMMUTE_REPOSITORY) private readonly commute: CommuteRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly link?: PartnerCouplingRepository,
    @Inject(CHILD_REPOSITORY) private readonly kinder?: ChildRepository,
    @Inject(RENTAL_REPOSITORY) private readonly rental?: RentalRepository,
  ) {}

  async getState(
    userId: string,
    year: number,
    boostersEnabled: boolean = HOUSEHOLD_AND_HEALTH_BOOSTERS,
  ): Promise<TaxEstimateStatus> {
    return withSpan('tax_estimate.calculate', async () => {
      const [lstbRecord, interviewRows, chRecord, masterData, path] = await Promise.all([
      this.lstb.findForUserAndYear(userId, year),
      this.interview.findAllForUserAndYear(userId, year),
      this.chSalaryCertificate.findForUserAndYear(userId, year),
      this.masterData.findByUserId(userId),
      this.commute.findForUserAndYear(userId, year),
    ])
    const answers = answersFrom(interviewRows)

    if (answers.job !== 'Angestellt') return { kind: 'nicht-moeglich', reason: 'nur-angestellte' }
    if (masterData?.familienstand === 'verheiratet' || answers.familienstand === 'Verheiratet') {
      return this.marriedCouple(userId, year, boostersEnabled)
    }
    if (gatedIncomeTypes(answers).length > 0 || specialCircumstance(answers)) {
      return { kind: 'nicht-moeglich', reason: 'besondere-lebenslage' }
    }

    const numbers = employeeFromAnswers(answers)
    const allowance = commuterAllowanceFrom(year, path) + homeOfficeAllowanceFrom(year, path)
    const laterCount = countLaterAmounts(answers, boostersEnabled)
    // § 24b EStG: not married, at least one child, and no other adult in the household (Abs. 3).
    const singleParent =
      answers.kinder !== undefined &&
      answers.kinder !== 'Nein' &&
      (answers.familienstand === 'Ledig' ||
        answers.familienstand === 'Geschieden oder getrennt' ||
        answers.familienstand === 'Verwitwet') &&
      answers['ae-weitere-person'] !== 'Ja' &&
      answers['ae-haushaltsgemeinschaft'] !== 'Ja'
    const singleParentChildren = singleParent ? await this.childrenForRelief(userId, year, answers) : 0
    const childrenBracket = burdenChildrenBracket(answers.kinder)
    const householdReductionEur = boostersEnabled ? householdServicesFromAnswers(answers, year).totalReductionEur : 0
    const healthExpensesEur = boostersEnabled ? extraordinaryBurdenFromAnswers(answers) : 0
    const churchTax = churchTaxInput(masterData, lstbRecord, 'own', await this.childrenForChurchTax(userId, year, answers))

    if (answers.ausland === CH_FOREIGN) {
      const values = salaryCertificateValuesFromRecord(chRecord)
      const exchangeRate = exchangeRateFromRecord(chRecord)
      const status = crossBorderStatusFromAnswers(answers)
      const nGre = chRecord?.nGre
      const missing = [
        ...(status === null ? ['grenzgaenger-status'] : openSalaryCertificateFields(values, status)),
        ...(exchangeRate === null ? ['wechselkurs'] : []),
        ...(nGre?.pkArbeitnehmerChf === null || nGre?.pkArbeitnehmerChf === undefined ? ['pk-obligatorium'] : []),
      ]
      if (missing.length > 0 || exchangeRate === null || nGre === undefined) return { kind: 'offen', missing }
      const rows = annexNGreAmounts({
        grossWageChf: values['bruttolohn-total'] ?? 0,
        familienzulagenChf: Number(nGre.familienzulagenChf ?? 0),
        ahvContributionsChf: values['ahv-beitraege'] ?? 0,
        withholdingTaxChf: values.quellensteuer ?? 0,
        krankentaggeldChf: Number(nGre.krankentaggeldChf ?? 0),
        pkArbeitnehmerChf: Number(nGre.pkArbeitnehmerChf ?? 0),
        pkArbeitgeberChf: Number(nGre.pkArbeitgeberChf ?? 0),
        krankentaggeldArbeitgeberProzent: optionalNumber(nGre.krankentaggeldArbeitgeberProzent),
        krankentaggeldArbeitgeberChf: optionalNumber(nGre.krankentaggeldArbeitgeberChf),
        nbuvArbeitgeberProzent: optionalNumber(nGre.nbuvArbeitgeberProzent),
        nbuvArbeitgeberChf: optionalNumber(nGre.nbuvArbeitgeberChf),
        rate: exchangeRate.rate,
      }).eur
      const krankenkasseChf = chRecord?.krankenkasseChf === null || chRecord?.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      return withEstimateExtras(
        taxEstimateCrossBorder({
          year,
          wageEur: rows.z23,
          withholdingTaxEur: rows.z25,
          retirementProvisionEur: rows.z85,
          otherProvisionEur: rows.z82,
          healthInsuranceEur: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + numbers.healthCareContributions,
          commuterAllowance: allowance,
          donations: numbers.donations,
          householdReductionEur,
          healthExpensesEur,
          singleParent,
          singleParentChildren,
          childrenBracket,
          churchTax,
        }),
        laterCount,
      )
    }

    const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (state.kind === 'unvollstaendig') return { kind: 'offen', missing: [...state.open, ...state.unclear] }
    if (state.kind === 'widerspruch') return { kind: 'offen', missing: state.conflicts.map((w) => w.kind) }
      return withEstimateExtras(
        taxEstimateEmployee({
          year,
          bruttoarbeitslohn: state.bruttoarbeitslohn,
          lohnsteuer: state.lohnsteuer,
          sozialversicherung: state.sozialversicherung,
          commuterAllowance: allowance,
          otherIncomeRelatedExpenses: numbers.relocationCosts + numbers.trainingCosts,
          donations: numbers.donations,
          selfPaidKvPv: numbers.healthCareContributions,
          householdReductionEur,
          healthExpensesEur,
          singleParent,
          singleParentChildren,
          childrenBracket,
          churchTax,
        }),
        laterCount,
      )
    }, { 'tax.year': year, 'user.id': userId })
  }

  /** § 24b Abs. 2 Satz 2: the recorded children, else what the interview says (1 or "2 oder mehr" → 2). */
  private async childrenForRelief(userId: string, year: number, answers: Answers): Promise<number> {
    const recorded = this.kinder ? (await this.kinder.listForUserAndYear(userId, year)).length : 0
    if (recorded > 0) return recorded
    return answers.kinder === '2 oder mehr' ? 2 : 1
  }

  /** § 51a Abs. 2 EStG: children with a Kinderfreibetrag — the recorded ones, else what the interview says. */
  private async childrenForChurchTax(userId: string, year: number, answers: Answers): Promise<number> {
    if (answers.kinder === undefined || answers.kinder === 'Nein') return 0
    return this.childrenForRelief(userId, year, answers)
  }

  /** ADR-0054: a couple's estimate from both spouses' figures — only once the joint return for the year is set up. */
  private async marriedCouple(userId: string, year: number, boostersEnabled: boolean): Promise<TaxEstimateStatus> {
    const link = this.link ? await this.link.findByUserAndYear(userId, year) : null
    if (!link || link.filingType !== 'zusammen') return { kind: 'offen', missing: ['veranlagungsart'] }
    const [a, b] = await Promise.all([
      this.income(link.personAUserId, year, boostersEnabled),
      link.personBUserId ? this.income(link.personBUserId, year, boostersEnabled) : Promise.resolve(null),
    ])
    const missing = [...(a?.kind === 'offen' ? a.missing : []), ...(b?.kind === 'offen' ? b.missing.map((f) => `personB.${f}`) : [])]
    if (a.kind === 'none') missing.unshift('einkommen')
    if (missing.length > 0 || a.kind !== 'ok') return { kind: 'offen', missing }
    const [kinder, properties, sdA, sdB] = await Promise.all([
      this.kinder ? this.kinder.listForUserAndYear(link.personAUserId, year) : Promise.resolve([]),
      this.rental ? this.rental.listForUserAndYear(link.personAUserId, year) : Promise.resolve([]),
      this.masterData.findByUserId(link.personAUserId),
      link.personBUserId ? this.masterData.findByUserId(link.personBUserId) : Promise.resolve(null),
    ])
    const [lstbA, lstbB] = await Promise.all([
      this.lstb.findForUserAndYear(link.personAUserId, year),
      link.personBUserId ? this.lstb.findForUserAndYear(link.personBUserId, year) : Promise.resolve(null),
    ])
    const churchA = churchTaxInput(sdA, lstbA, 'with-spouse-line', 0)
    const churchB = churchTaxInput(sdB ?? sdA, lstbB, 'with-spouse-line', 0)
    const bAnswers = b?.kind === 'ok' || b?.kind === 'none' ? b.answers : {}
    const householdReductionEur = boostersEnabled ? jointHouseholdReduction(a.answers, bAnswers, year) : 0
    const healthExpensesEur = boostersEnabled
      ? extraordinaryBurdenFromAnswers(a.answers) + extraordinaryBurdenFromAnswers(bAnswers)
      : 0
    const estimate = estimateMarriedCouple({
      year,
      a: a.spouse,
      b: b?.kind === 'ok' ? b.spouse : null,
      children: kinder.length,
      childBenefit: kinder.reduce((sum, k) => sum + monthlyChildBenefitClaim(year) * claimMonths(k.geburtsdatum, year), 0),
      rentalSurplus: properties.reduce((sum, o) => sum + rentalSurplus(o), 0),
      donations: a.donations + (b?.kind === 'ok' ? b.donations : 0),
      churchTax: {
        state: churchA.state,
        postalCode: churchA.postalCode,
        a: { membership: churchA.membership, withheld: churchA.withheld },
        // Person B's confession is their own; without master data for B it is unknown, never "none".
        b: { membership: sdB ? churchB.membership : { kind: 'unknown' }, withheld: churchB.withheld },
      },
      householdReductionEur,
      healthExpensesEur,
      childrenBracket: burdenChildrenBracket(a.answers.kinder ?? bAnswers.kinder),
    })
    if (estimate.kind !== 'spanne') return { kind: 'nicht-moeglich', reason: estimate.reason }
    const { childAllowanceUsed: _k, churchTax, ...range } = estimate
    const laterCount = a.laterCount + (b && b.kind !== 'offen' ? b.laterCount : 0)
    return {
      ...range,
      result: widenForLaterAmounts(range.result, laterCount),
      churchTaxOpen: churchTax.kind === 'offen',
      churchTax,
      jointAssessment: true,
      ...(laterCount > 0 ? { laterAmounts: laterCount } : {}),
    }
  }

  /** One spouse's wage income for the couple estimate; kind 'none' when they have none. */
  private async income(
    userId: string,
    year: number,
    boostersEnabled: boolean,
  ): Promise<
    | { kind: 'ok'; spouse: SpouseIncome; donations: number; laterCount: number; answers: Answers }
    | { kind: 'offen'; missing: string[] }
    | { kind: 'none'; laterCount: number; answers: Answers }
  > {
    const [lstbRecord, interviewRows, chRecord, path] = await Promise.all([
      this.lstb.findForUserAndYear(userId, year),
      this.interview.findAllForUserAndYear(userId, year),
      this.chSalaryCertificate.findForUserAndYear(userId, year),
      this.commute.findForUserAndYear(userId, year),
    ])
    const answers = answersFrom(interviewRows)
    const laterCount = countLaterAmounts(answers, boostersEnabled)
    const numbers = employeeFromAnswers(answers)
    const allowance = commuterAllowanceFrom(year, path) + homeOfficeAllowanceFrom(year, path)
    if (chRecord && (answers.ausland === CH_FOREIGN || lstbRecord === null)) {
      const values = salaryCertificateValuesFromRecord(chRecord)
      const exchangeRate = exchangeRateFromRecord(chRecord)
      const nGre = chRecord.nGre
      const missing = [...(exchangeRate === null ? ['wechselkurs'] : []), ...(nGre.pkArbeitnehmerChf === null ? ['pk-obligatorium'] : [])]
      if (values['bruttolohn-total'] === undefined) missing.unshift('bruttolohn-total')
      if (missing.length > 0 || exchangeRate === null) return { kind: 'offen', missing }
      const rows = annexNGreAmounts({
        grossWageChf: values['bruttolohn-total'] ?? 0,
        familienzulagenChf: Number(nGre.familienzulagenChf ?? 0),
        ahvContributionsChf: values['ahv-beitraege'] ?? 0,
        withholdingTaxChf: values.quellensteuer ?? 0,
        krankentaggeldChf: Number(nGre.krankentaggeldChf ?? 0),
        pkArbeitnehmerChf: Number(nGre.pkArbeitnehmerChf ?? 0),
        pkArbeitgeberChf: Number(nGre.pkArbeitgeberChf ?? 0),
        krankentaggeldArbeitgeberProzent: optionalNumber(nGre.krankentaggeldArbeitgeberProzent),
        krankentaggeldArbeitgeberChf: optionalNumber(nGre.krankentaggeldArbeitgeberChf),
        nbuvArbeitgeberProzent: optionalNumber(nGre.nbuvArbeitgeberProzent),
        nbuvArbeitgeberChf: optionalNumber(nGre.nbuvArbeitgeberChf),
        rate: exchangeRate.rate,
      }).eur
      const krankenkasseChf = chRecord.krankenkasseChf === null || chRecord.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      return {
        kind: 'ok',
        donations: numbers.donations,
        laterCount,
        answers,
        spouse: {
          kind: 'crossBorder',
          wageEur: rows.z23,
          swissWithholdingEur: rows.z25,
          pensionContributionsEur: rows.z85,
          otherProvisionEur: rows.z82,
          commuteAllowance: allowance,
          selfPaidHealthCare: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + numbers.healthCareContributions,
        },
      }
    }
    if (lstbRecord === null) return { kind: 'none', laterCount, answers }
    const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (state.kind === 'unvollstaendig') return { kind: 'offen', missing: [...state.open, ...state.unclear] }
    if (state.kind === 'widerspruch') return { kind: 'offen', missing: state.conflicts.map((w) => w.kind) }
    return {
      kind: 'ok',
      donations: numbers.donations,
      laterCount,
      answers,
      spouse: {
        kind: 'employee',
        grossWage: state.bruttoarbeitslohn,
        wageTax: state.lohnsteuer,
        socialSecurity: state.sozialversicherung,
        commuteAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts,
        selfPaidHealthCare: numbers.healthCareContributions,
      },
    }
  }
}

function countLaterAmounts(answers: Answers, boostersEnabled: boolean): number {
  return laterAmountSteps(answers).filter((step) => boostersEnabled || !step.startsWith('haushalt-')).length
}

function jointHouseholdReduction(a: Answers, b: Answers, year: number): number {
  const services = (ans: Answers) => (ans['haushalt-gate'] === 'Ja' ? amountFromAnswer(ans['haushalt-dienstleistung-betrag']) ?? 0 : 0)
  const craftsmen = (ans: Answers) => (ans['haushalt-gate'] === 'Ja' ? amountFromAnswer(ans['haushalt-handwerker-betrag']) ?? 0 : 0)
  const minijob = (ans: Answers) => (ans['haushalt-gate'] === 'Ja' ? amountFromAnswer(ans['haushalt-minijob-betrag']) ?? 0 : 0)
  return calculateHouseholdServicesReduction({
    year,
    servicesEur: services(a) + services(b),
    craftsmenEur: craftsmen(a) + craftsmen(b),
    minijobEur: minijob(a) + minijob(b),
  }).totalReductionEur
}

/** Anlage V result of one object as the estimate needs it: rent and Umlagen less costs, interest and linear AfA. */
function rentalSurplus(o: {
  mieteinnahmen: string | null
  werbungskosten: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  umlagen?: string | null
  schuldzinsen?: string | null
}): number {
  const number = (value: string | null | undefined) => (value && /^\d+$/.test(value) ? Number(value) : 0)
  const rate = o.baujahr && /^\d+$/.test(o.baujahr) ? depreciationRatePercent(Number(o.baujahr)) : null
  const depreciation = rate === null ? 0 : Math.round((number(o.anschaffungskosten) * rate) / 100)
  return number(o.mieteinnahmen) + number(o.umlagen) - number(o.werbungskosten) - number(o.schuldzinsen) - depreciation
}

/** A stored optional number; absent and null both mean "not entered". */
function optionalNumber(value: string | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value)
}

function specialCircumstance(answers: Answers): boolean {
  return answers.dhf === 'Ja' || answers.abfindung === 'Ja' || answers.lohnersatz === 'Ja' || answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob'
}

function commuterAllowanceFrom(year: number, path: CommuteInputs | null): number {
  if (path === null || path.oneWayKm === null || path.transport === null) return 0
  const days = calculateWorkdays({
    year,
    workdays: path.workdays,
    vacationDays: path.vacationDays,
    sickDays: path.sickDays,
    homeOfficeDays: path.homeOfficeDays,
    publicHolidays: effectivePublicHolidays(year, path),
  })
  if (days.kind !== 'bestimmt') return 0
  try {
    return commuterAllowance({ oneWayKm: path.oneWayKm, days: days.commuteDays, year, withCar: path.transport === 'pkw' })
  } catch {
    return 0
  }
}

/** Homeoffice-Pauschale from the home-office days of the Arbeitstage mask (#450 Teil 6). */
function homeOfficeAllowanceFrom(year: number, path: CommuteInputs | null): number {
  return path?.homeOfficeDays ? homeOfficeAllowance(year, path.homeOfficeDays) : 0
}

function withEstimateExtras(estimate: TaxEstimate, laterCount: number): TaxEstimateStatus {
  if (estimate.kind !== 'spanne') return { kind: 'nicht-moeglich', reason: estimate.reason }
  return {
    ...estimate,
    result: widenForLaterAmounts(estimate.result, laterCount),
    churchTaxOpen: estimate.churchTax?.kind === 'offen',
    ...(laterCount > 0 ? { laterAmounts: laterCount } : {}),
  }
}

/** Bundesland from the PLZ of the master data; null when unknown or when the PLZ spans two Länder. */
function stateFromPostalCode(plz: string | null | undefined): GermanState | null {
  if (!plz) return null
  const lookup = lookupPostalCode(plz)
  if (lookup.kind !== 'found') return null
  const states = new Set(lookup.places.map((p) => p.state))
  return states.size === 1 ? [...states][0]! : null
}

/**
 * Church tax facts of one person (#450 Teil 6F, ADR-0063): confession and residence from the master
 * data, the withheld church tax from the LStB (Zeile 6, for a married person plus Zeile 7).
 */
function churchTaxInput(
  masterData: { religion?: string | null; plz?: string | null } | null | undefined,
  lstbRecord: WageTaxCertificateRecord | null,
  lines: 'own' | 'with-spouse-line',
  children: number,
): ChurchTaxInput {
  const lstb = churchTaxDtoFrom(lstbRecord)
  const own = lstb.kirchensteuer
  const withheld = own === null ? null : own + (lines === 'with-spouse-line' ? (lstb.kirchensteuerEhegatte ?? 0) : 0)
  return {
    membership: churchMembership(masterData?.religion),
    state: stateFromPostalCode(masterData?.plz),
    postalCode: masterData?.plz ?? null,
    withheld,
    children,
  }
}
