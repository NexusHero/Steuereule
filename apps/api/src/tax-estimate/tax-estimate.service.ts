import { Inject, Injectable, Optional } from '@nestjs/common'
import { withSpan } from '../telemetry/tracer.js'
import {
  annexNGreAmounts,
  pensionAsCoreLineItem,
  employeeFromAnswers,
  furtherWorkExpensesEur,
  childcareDeductionEur,
  calculateWorkdays,
  chfToEur,
  gatedIncomeTypes,
  wageTaxCertificateStatus,
  openSalaryCertificateFields,
  taxEstimateEmployee,
  taxEstimatePensioner,
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
import { allowanceOverWays } from '../commute/ways-to-work.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord, nGreInputFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersFrom } from '../interview/answers.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { pensionDataFromRecord } from '../pension/pension.service.js'
import { churchTaxDtoFrom } from '../lstb/lstb.service.js'
import type { WageTaxCertificateRecord } from '../lstb/lstb.repository.js'

export type TaxEstimateStatus =
  | (Omit<Extract<TaxEstimate, { kind: 'spanne' }>, 'churchTax'> & {
      /** True when church tax applies but is not part of the result (kept for the cockpit hint). */
      readonly churchTaxOpen: boolean
      readonly churchTax?: EstimateChurchTax
      readonly jointAssessment?: boolean
      readonly laterAmounts?: number
      /** Income tax prepayments of the year (§ 37 EStG), already part of the result (ADR-0081). */
      readonly prepayments?: number
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
    @Optional() @Inject(PENSION_REPOSITORY) private readonly pension?: PensionRepository,
  ) {}

  async getState(
    userId: string,
    year: number,
    boostersEnabled: boolean = HOUSEHOLD_AND_HEALTH_BOOSTERS,
  ): Promise<TaxEstimateStatus> {
    const status = await this.calculate(userId, year, boostersEnabled)
    if (status.kind !== 'spanne') return status
    // Prepayments the tax office set for the year count against the tax like withheld wage tax (§ 36
    // Abs. 2 Nr. 1 EStG); in a joint return there is one assessment, so they are asked once, of Person A.
    const prepayments = amountAnswer(answersFrom(await this.interview.findAllForUserAndYear(userId, year)), 'vorauszahlungen')
    if (prepayments === 0) return status
    return { ...status, prepayments, result: { from: status.result.from + prepayments, to: status.result.to + prepayments } }
  }

  private async calculate(userId: string, year: number, boostersEnabled: boolean): Promise<TaxEstimateStatus> {
    return withSpan('tax_estimate.calculate', async () => {
      const [lstbRecord, interviewRows, chRecord, masterData, path] = await Promise.all([
      this.lstb.findForUserAndYear(userId, year),
      this.interview.findAllForUserAndYear(userId, year),
      this.chSalaryCertificate.findForUserAndYear(userId, year),
      this.masterData.findByUserId(userId),
      this.commute.findForUserAndYear(userId, year),
    ])
    const answers = answersFrom(interviewRows)

    // Employees and pensioners get an estimate; the self-employed are out of scope (gewerbe gate).
    if (answers.job !== 'Angestellt' && answers.job !== 'Rente') return { kind: 'nicht-moeglich', reason: 'nur-angestellte' }
    if (masterData?.familienstand === 'verheiratet' || answers.familienstand === 'Verheiratet') {
      return this.marriedCouple(userId, year, boostersEnabled)
    }
    if (gatedIncomeTypes(answers).length > 0 || specialCircumstance(answers)) {
      return { kind: 'nicht-moeglich', reason: 'besondere-lebenslage' }
    }
    // § 32b EStG: the benefits are counted, not a reason to give up (UX review K3); the amount is needed though.
    const wageReplacement = wageReplacementFrom(answers)
    if (wageReplacement === null) return { kind: 'offen', missing: ['lohnersatz-betrag'] }
    if (answers.job === 'Rente') return this.pensioner(userId, year, answers, masterData, boostersEnabled)

    const numbers = employeeFromAnswers(answers)
    const allowance = commuterAllowanceFrom(year, path) + homeOfficeAllowanceFrom(year, path) + furtherWorkExpensesEur(path)
    // Kinderbetreuung is a Sonderausgabe like the donations (§ 10 Abs. 1 Nr. 5 EStG, ADR-0076).
    const childcare = await this.childcareDeduction(userId, year)
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
    const recordedChildren = this.kinder ? (await this.kinder.listForUserAndYear(userId, year)).length : 0
    const childrenBracket = burdenChildrenBracket(answers.kinder, recordedChildren)
    const householdReductionEur = boostersEnabled ? householdServicesFromAnswers(answers, year).totalReductionEur : 0
    const healthExpensesEur = boostersEnabled ? extraordinaryBurdenFromAnswers(answers) : 0
    const churchTax = churchTaxInput(masterData, lstbRecord, 'own', await this.childrenForChurchTax(userId, year, answers))

    if (answers.ausland === CH_FOREIGN) {
      const values = salaryCertificateValuesFromRecord(chRecord)
      const exchangeRate = exchangeRateFromRecord(chRecord)
      const status = crossBorderStatusFromAnswers(answers)
      // Not a Grenzgänger (> 60 days without return, or living in Switzerland): the Swiss wage is exempt in
      // Germany with Progressionsvorbehalt (Art. 15, 24 DBA-CH); the estimate does not tax it (ADR-0088).
      if (status === 'kein-grenzgaenger') return { kind: 'nicht-moeglich', reason: 'kein-grenzgaenger' }
      const nGre = chRecord?.nGre
      const missing = [
        ...(status === null ? ['grenzgaenger-status'] : openSalaryCertificateFields(values, status)),
        ...(exchangeRate === null ? ['wechselkurs'] : []),
        ...(nGre?.pkArbeitnehmerChf === null || nGre?.pkArbeitnehmerChf === undefined ? ['pk-obligatorium'] : []),
      ]
      if (missing.length > 0 || exchangeRate === null || !chRecord) return { kind: 'offen', missing }
      const rows = annexNGreAmounts(nGreInputFromRecord(chRecord, exchangeRate)).eur
      const krankenkasseChf = chRecord?.krankenkasseChf === null || chRecord?.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      // A change of job during the year: the German employer's certificate counts as well (ADR-0079).
      const germanWage = completeGermanWage(lstbRecord)
      return withEstimateExtras(
        taxEstimateCrossBorder({
          year,
          ...(germanWage ? { germanWage: { gross: germanWage.bruttoarbeitslohn, wageTax: germanWage.lohnsteuer, socialSecurity: germanWage.sozialversicherung } } : {}),
          wageEur: rows.z23,
          withholdingTaxEur: rows.z25,
          retirementProvisionEur: rows.z85,
          otherProvisionEur: rows.z82,
          healthInsuranceEur: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + numbers.healthCareContributions,
          // Training and relocation are Werbungskosten for a cross-border commuter as for anyone else.
          commuterAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts,
          donations: numbers.donations + childcare,
          householdReductionEur,
          healthExpensesEur,
          singleParent,
          singleParentChildren,
          childrenBracket,
          churchTax,
          wageReplacementEur: wageReplacement,
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
          donations: numbers.donations + childcare,
          selfPaidKvPv: numbers.healthCareContributions,
          householdReductionEur,
          healthExpensesEur,
          singleParent,
          singleParentChildren,
          childrenBracket,
          churchTax,
          wageReplacementEur: wageReplacement,
        }),
        laterCount,
      )
    }, { 'tax.year': year, 'user.id': userId })
  }

  /**
   * A single pensioner (Anlage R): the taxable share of the recorded pension, KVdR as Vorsorge unless the
   * Sonderausgaben catalogue says privately insured, and nothing withheld (UX review K3).
   */
  private async pensioner(
    userId: string,
    year: number,
    answers: Answers,
    masterData: Awaited<ReturnType<MasterDataRepository['findByUserId']>>,
    boostersEnabled: boolean,
  ): Promise<TaxEstimateStatus> {
    const record = this.pension ? await this.pension.findForUserAndYear(userId, year) : null
    const data = record ? pensionDataFromRecord(record) : null
    const item = data ? pensionAsCoreLineItem(data) : null
    if (data === null || item === null || data.jahresbetrag.kind !== 'erfasst') return { kind: 'offen', missing: ['rente'] }
    const numbers = employeeFromAnswers(answers)
    const childcare = await this.childcareDeduction(userId, year)
    const recordedChildren = this.kinder ? (await this.kinder.listForUserAndYear(userId, year)).length : 0
    const church = churchTaxInput(masterData, null, 'own', await this.childrenForChurchTax(userId, year, answers))
    return withEstimateExtras(
      taxEstimatePensioner({
        year,
        grossPensionEur: data.jahresbetrag.value,
        taxablePensionEur: item.amount,
        donations: numbers.donations + childcare,
        selfPaidKvPv: numbers.healthCareContributions,
        privatelyInsured: answers['kv-pv'] === 'Ja' && answers['kv-pv-art'] === 'Privat',
        householdReductionEur: boostersEnabled ? householdServicesFromAnswers(answers, year).totalReductionEur : 0,
        healthExpensesEur: boostersEnabled ? extraordinaryBurdenFromAnswers(answers) : 0,
        childrenBracket: burdenChildrenBracket(answers.kinder, recordedChildren),
        churchTax: { membership: church.membership, state: church.state, postalCode: church.postalCode, children: church.children },
      }),
      countLaterAmounts(answers, boostersEnabled),
    )
  }

  /** § 24b Abs. 2 Satz 2: the recorded children, else what the interview says (1 or "2 oder mehr" → 2). */
  /** The deductible childcare of all recorded children (80 %, at most 4.800 € each from 2025). */
  private async childcareDeduction(userId: string, year: number): Promise<number> {
    if (!this.kinder) return 0
    const children = await this.kinder.listForUserAndYear(userId, year)
    return children.reduce((sum, k) => sum + childcareDeductionEur(year, k.childcareEur ? Number(k.childcareEur) : null, k.geburtsdatum), 0)
  }

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
    if (a.kind === 'exempt' || b?.kind === 'exempt') return { kind: 'nicht-moeglich', reason: 'kein-grenzgaenger' }
    const missing = [...(a?.kind === 'offen' ? a.missing : []), ...(b?.kind === 'offen' ? b.missing.map((f) => `personB.${f}`) : [])]
    if (a.kind === 'none') missing.unshift('einkommen')
    if (a.kind === 'ok' && wageReplacementFrom(a.answers) === null) missing.push('lohnersatz-betrag')
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
      // Childcare is the household's, recorded with the children of the user (A).
      donations: a.donations + (b?.kind === 'ok' ? b.donations : 0) + (await this.childcareDeduction(userId, year)),
      churchTax: {
        state: churchA.state,
        postalCode: churchA.postalCode,
        a: { membership: churchA.membership, withheld: churchA.withheld },
        // Person B's confession is their own; without master data for B it is unknown, never "none".
        b: { membership: sdB ? churchB.membership : { kind: 'unknown' }, withheld: churchB.withheld },
      },
      householdReductionEur,
      healthExpensesEur,
      childrenBracket: burdenChildrenBracket(a.answers.kinder ?? bAnswers.kinder, kinder.length),
      wageReplacementEur: (wageReplacementFrom(a.answers) ?? 0) + (wageReplacementFrom(bAnswers) ?? 0),
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
    | { kind: 'exempt' }
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
    const allowance = commuterAllowanceFrom(year, path) + homeOfficeAllowanceFrom(year, path) + furtherWorkExpensesEur(path)
    // Person B recorded by the user answers only the Grenzgänger questions, never the minimal gate.
    const answersCrossBorder = answers.ausland === CH_FOREIGN || answers['ch-wohnsitz'] !== undefined
    if (chRecord && answersCrossBorder && crossBorderStatusFromAnswers(answers) === 'kein-grenzgaenger') return { kind: 'exempt' }
    if (chRecord && (answersCrossBorder || lstbRecord === null)) {
      const values = salaryCertificateValuesFromRecord(chRecord)
      const exchangeRate = exchangeRateFromRecord(chRecord)
      const nGre = chRecord.nGre
      const missing = [...(exchangeRate === null ? ['wechselkurs'] : []), ...(nGre.pkArbeitnehmerChf === null ? ['pk-obligatorium'] : [])]
      if (values['bruttolohn-total'] === undefined) missing.unshift('bruttolohn-total')
      if (missing.length > 0 || exchangeRate === null) return { kind: 'offen', missing }
      const rows = annexNGreAmounts(nGreInputFromRecord(chRecord, exchangeRate)).eur
      const krankenkasseChf = chRecord.krankenkasseChf === null || chRecord.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      const germanWage = completeGermanWage(lstbRecord)
      const crossBorder = {
        wageEur: rows.z23,
        swissWithholdingEur: rows.z25,
        pensionContributionsEur: rows.z85,
        otherProvisionEur: rows.z82,
        commuteAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts,
        selfPaidHealthCare: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + numbers.healthCareContributions,
      }
      if (germanWage) {
        // A change of job during the year: both employers' wages and both credits (ADR-0079).
        return {
          kind: 'ok',
          donations: numbers.donations,
          laterCount,
          answers,
          spouse: { kind: 'mixed', grossWage: germanWage.bruttoarbeitslohn, wageTax: germanWage.lohnsteuer, socialSecurity: germanWage.sozialversicherung, ...crossBorder },
        }
      }
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
          commuteAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts,
          selfPaidHealthCare: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + numbers.healthCareContributions,
        },
      }
    }
    if (lstbRecord === null) {
      // A spouse living on a pension (Anlage R): its taxable share counts in the couple's estimate (ADR-0088).
      const pensionRecord = this.pension ? await this.pension.findForUserAndYear(userId, year) : null
      if (pensionRecord?.rentenart) {
        const item = pensionAsCoreLineItem(pensionDataFromRecord(pensionRecord))
        if (item === null) return { kind: 'offen', missing: ['rente'] }
        return { kind: 'ok', donations: numbers.donations, laterCount, answers, spouse: { kind: 'pension', taxablePensionEur: item.amount } }
      }
      return { kind: 'none', laterCount, answers }
    }
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

/** The German certificate of the year when it is complete and consistent; otherwise it stays out. */
function completeGermanWage(record: Parameters<typeof wageTaxCertificateDataFrom>[0] | null) {
  if (record === null) return null
  const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(record))
  return state.kind === 'vollstaendig' ? state : null
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

/** Life situations the estimate cannot price yet; wage replacement benefits are priced (§ 32b, UX review K3). */
function specialCircumstance(answers: Answers): boolean {
  return answers.dhf === 'Ja' || answers.abfindung === 'Ja' || answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob'
}

/** Wage replacement benefits of the year: 0 without, the amount with, null when „Ja“ is answered but the amount is missing. */
function wageReplacementFrom(answers: Answers): number | null {
  if (answers.lohnersatz !== 'Ja') return 0
  return amountFromAnswer(answers['lohnersatz-betrag'])
}

function commuterAllowanceFrom(year: number, path: CommuteInputs | null): number {
  if (path === null) return 0
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
    return allowanceOverWays(year, path, days.commuteDays) ?? 0
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

/** A whole-euro amount behind a „Ja“ gate; „später“, „Nein“ or nothing count as 0. */
function amountAnswer(answers: Answers, gate: 'vorauszahlungen'): number {
  if (answers[`${gate}-gate`] !== 'Ja') return 0
  const value = answers[`${gate}-betrag`]
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : 0
}
