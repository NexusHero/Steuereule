import { Inject, Injectable, Optional } from '@nestjs/common'
import { withSpan } from '../telemetry/tracer.js'
import {
  annexNGreAmounts,
  pensionAsCoreLineItem,
  employeeFromAnswers,
  furtherWorkExpensesEur,
  countsInterviewHealthInsurance,
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
  taxEstimateSelfEmployed,
  type BusinessIncome,
  type LossCarry,
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
  type PersonProvision,
  type NGreAmounts,
  childTaxAllowance,
  getTaxYearParameters,
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
import { lstbLineValuesFrom, wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { pensionDataFromRecord } from '../pension/pension.service.js'
import { churchTaxDtoFrom, subsidiesDtoFrom } from '../lstb/lstb.service.js'
import type { WageTaxCertificateRecord } from '../lstb/lstb.repository.js'
import { declaresSelfEmployment, interviewOptions, selfEmploymentEnabled } from '../config/self-employment.js'
import { BusinessService } from '../business/business.service.js'

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
    @Optional() @Inject(CAPITAL_REPOSITORY) private readonly capital?: CapitalRepository,
    /** The book of the self-employed (ADR-0101); absent in tests that build the estimate without it. */
    @Optional() @Inject(BusinessService) private readonly business?: BusinessService,
  ) {}

  /**
   * Gewinneinkünfte, § 10d and § 35 of one person (ADR-0101), only with the switch on and a business
   * declared; null keeps every estimate exactly as before.
   */
  private async businessOf(userId: string, year: number, person: 'A' | 'B' = 'A'): Promise<{ business: BusinessIncome; losses: LossCarry } | null> {
    if (!this.business || !selfEmploymentEnabled()) return null
    return this.business.estimateInput(userId, year, person)
  }

  async getState(
    userId: string,
    year: number,
    boostersEnabled: boolean = HOUSEHOLD_AND_HEALTH_BOOSTERS,
  ): Promise<TaxEstimateStatus> {
    const status = await this.calculate(userId, year, boostersEnabled)
    if (status.kind !== 'spanne') return status
    // The business path passed the prepayments into the core already (ADR-0101): never twice.
    if (status.prepayments !== undefined) return status
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

    // Employees and pensioners get an estimate; the self-employed only with the switch on (ADR-0101, REQ-015).
    const selfEmployed = selfEmploymentEnabled() && declaresSelfEmployment(answers.job)
    if (!selfEmployed && answers.job !== 'Angestellt' && answers.job !== 'Rente') return { kind: 'nicht-moeglich', reason: 'nur-angestellte' }
    if (masterData?.familienstand === 'verheiratet' || answers.familienstand === 'Verheiratet') {
      return this.marriedCouple(userId, year, boostersEnabled)
    }
    if (gatedIncomeTypes(answers, interviewOptions()).length > 0 || specialCircumstance(answers)) {
      return { kind: 'nicht-moeglich', reason: 'besondere-lebenslage' }
    }
    // § 32b EStG: the benefits are counted, not a reason to give up (UX review K3); the amount is needed though.
    const wageReplacement = wageReplacementFrom(answers)
    if (wageReplacement === null) return { kind: 'offen', missing: ['lohnersatz-betrag'] }
    if (answers.job === 'Rente') return this.pensioner(userId, year, answers, masterData, boostersEnabled)
    const ownBusiness = selfEmployed ? await this.businessOf(userId, year) : null
    if (selfEmployed && ownBusiness === null) return { kind: 'offen', missing: ['selbststaendig'] }
    // § 37 EStG prepayments go into the core with the business (credited like wage tax, Soli exact).
    const prepaymentsEur = amountAnswer(answers, 'vorauszahlungen')
    const businessInputs = ownBusiness === null ? {} : { business: ownBusiness.business, losses: ownBusiness.losses, ...(prepaymentsEur > 0 ? { prepayments: { incomeTaxEur: prepaymentsEur } } : {}) }
    const withPrepayments = (status: TaxEstimateStatus): TaxEstimateStatus =>
      ownBusiness !== null && status.kind === 'spanne' ? { ...status, prepayments: prepaymentsEur } : status

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

    // Self-employed without a job (ADR-0101): the profit is the income, the provision paid outside a wage.
    if (ownBusiness !== null && answers.job === 'Selbstständig') {
      return withPrepayments(
        withEstimateExtras(
          taxEstimateSelfEmployed({
            year,
            ...businessInputs,
            business: ownBusiness.business,
            provision: { ...NO_PROVISION, healthBasicEur: numbers.healthCareContributions, healthWithSickPayEur: numbers.healthCareContributions },
            donations: numbers.donations + childcare,
            householdReductionEur,
            healthExpensesEur,
            singleParent,
            singleParentChildren,
            childrenBracket,
            churchTax,
          }),
          laterCount,
        ),
      )
    }

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
      const nGreAmounts = annexNGreAmounts(nGreInputFromRecord(chRecord, exchangeRate))
      const rows = nGreAmounts.eur
      const krankenkasseChf = chRecord?.krankenkasseChf === null || chRecord?.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      // A change of job during the year: the German employer's certificate counts as well (ADR-0079).
      const germanWage = completeGermanWage(lstbRecord)
      return withPrepayments(withEstimateExtras(
        taxEstimateCrossBorder({
          year,
          ...businessInputs,
          ...(germanWage ? { germanWage: { gross: germanWage.bruttoarbeitslohn, wageTax: germanWage.lohnsteuer, socialSecurity: deductibleSocialSecurity(germanWage.sozialversicherung, lstbRecord) } } : {}),
          wageEur: rows.z23,
          withholdingTaxEur: rows.z25,
          retirementProvisionEur: rows.z85,
          otherProvisionEur: rows.z82,
          healthInsuranceEur: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + (countsInterviewHealthInsurance(answers, krankenkasseChf > 0) ? numbers.healthCareContributions : 0),
          // Training, relocation and half the NBUV (ADR-0090) are Werbungskosten for a cross-border commuter.
          commuterAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts + nGreAmounts.nbuvWorkExpenses.eur,
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
      ))
    }

    const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (state.kind === 'unvollstaendig') return { kind: 'offen', missing: [...state.open, ...state.unclear] }
    if (state.kind === 'widerspruch') return { kind: 'offen', missing: state.conflicts.map((w) => w.kind) }
      return withPrepayments(withEstimateExtras(
        taxEstimateEmployee({
          year,
          ...businessInputs,
          bruttoarbeitslohn: state.bruttoarbeitslohn,
          lohnsteuer: state.lohnsteuer,
          sozialversicherung: deductibleSocialSecurity(state.sozialversicherung, lstbRecord),
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
      ))
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
    // ADR-0101: each spouse's business; Person B recorded in A's account keeps B's book in A's account.
    const [businessA, businessB] = await Promise.all([
      this.businessOf(link.personAUserId, year),
      link.personBUserId ? this.businessOf(link.personBUserId, year) : this.businessOf(link.personAUserId, year, 'B'),
    ])
    const businessInputs =
      businessA === null && businessB === null
        ? {}
        : {
            business: { a: businessA?.business, b: businessB?.business },
            // One Feststellung for the couple's joint assessment: what both bring forward.
            losses: { carriedForwardEur: (businessA?.losses.carriedForwardEur ?? 0) + (businessB?.losses.carriedForwardEur ?? 0) },
          }
    const capitalRecord = this.capital ? await this.capital.findForUserAndYear(link.personAUserId, year) : null
    const capital = flatRateCapital(capitalRecord, getTaxYearParameters(year).lumpSums.saverJoint)
    const amountOf = (value: string | null | undefined) => (value && /^\d+$/.test(value) ? Number(value) : 0)
    const estimate = estimateMarriedCouple({
      year,
      ...businessInputs,
      // § 32 Abs. 6 Satz 5 EStG: a twelfth of the allowances for every month the child counts.
      childAllowanceEur: kinder.reduce((sum, k) => sum + Math.round((childTaxAllowance(year) * claimMonths(k.geburtsdatum, year)) / 12), 0),
      // Anlage Kind Zeilen 27–29: what the parents pay for the children's basic insurance.
      childrenProvision: { healthBasicEur: kinder.reduce((sum, k) => sum + amountOf(k.healthBasicEur), 0), careEur: kinder.reduce((sum, k) => sum + amountOf(k.careEur), 0), otherEur: 0 },
      capitalIncomeEur: capital.incomeEur,
      capitalTaxWithheldEur: capital.withheldEur,
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
      const nGreAmounts = annexNGreAmounts(nGreInputFromRecord(chRecord, exchangeRate))
      const rows = nGreAmounts.eur
      const krankenkasseChf = chRecord.krankenkasseChf === null || chRecord.krankenkasseChf === undefined ? 0 : Number(chRecord.krankenkasseChf)
      // A German certificate that is there but not complete must not silently drop out of a job-change year.
      if (lstbRecord !== null && hasAnyLstbValue(lstbRecord) && completeGermanWage(lstbRecord) === null) {
        const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
        return { kind: 'offen', missing: state.kind === 'unvollstaendig' ? [...state.open, ...state.unclear] : state.kind === 'widerspruch' ? state.conflicts.map((w) => w.kind) : [] }
      }
      const germanWage = completeGermanWage(lstbRecord)
      const swissHealthEur = Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + (countsInterviewHealthInsurance(answers, krankenkasseChf > 0) ? numbers.healthCareContributions : 0)
      const supplementaryEur = Math.round(chfToEur(nGre.krankenkasseZusatzChf ? Number(nGre.krankenkasseZusatzChf) : 0, exchangeRate.rate))
      const swissProvision = swissProvisionLines(nGreAmounts, swissHealthEur, supplementaryEur, nGre.kvZuschussAnspruch === true)
      const germanProvision = germanWage ? germanProvisionLines(lstbRecord) : null
      const crossBorder = {
        // As the tax office converts: the CHF total at the rate, the wage rounded down, the credit up (ADR-0094).
        wageEur: nGreAmounts.assessed.wageEur,
        swissWithholdingEur: nGreAmounts.assessed.withholdingTaxEur,
        pensionContributionsEur: rows.z85,
        otherProvisionEur: rows.z82,
        commuteAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts + nGreAmounts.nbuvWorkExpenses.eur,
        selfPaidHealthCare: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + (countsInterviewHealthInsurance(answers, krankenkasseChf > 0) ? numbers.healthCareContributions : 0),
      }
      if (germanWage) {
        // A change of job during the year: both employers' wages and both credits (ADR-0079).
        return {
          kind: 'ok',
          donations: numbers.donations,
          laterCount,
          answers,
          spouse: {
            kind: 'mixed',
            grossWage: germanWage.bruttoarbeitslohn,
            wageTax: germanWage.lohnsteuer,
            socialSecurity: deductibleSocialSecurity(germanWage.sozialversicherung, lstbRecord),
            ...crossBorder,
            ...soliWithheld(lstbRecord),
            // Exact only with the lines of the German certificate; otherwise the range stays.
            ...(germanProvision ? { provision: addProvision(germanProvision, swissProvision) } : {}),
          },
        }
      }
      return {
        kind: 'ok',
        donations: numbers.donations,
        laterCount,
        answers,
        // The same figures as a change-of-job year, so both get the NBUV half and count the Swiss KV once (ADR-0090).
        spouse: { kind: 'crossBorder', ...crossBorder, provision: swissProvision },
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
      // A spouse who lives on the business (ADR-0101): the provision paid outside a wage.
      if ((await this.businessOf(userId, year)) !== null) {
        return {
          kind: 'ok',
          donations: numbers.donations,
          laterCount,
          answers,
          spouse: { kind: 'selfEmployed', provision: { ...NO_PROVISION, healthBasicEur: numbers.healthCareContributions, healthWithSickPayEur: numbers.healthCareContributions } },
        }
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
        socialSecurity: deductibleSocialSecurity(state.sozialversicherung, lstbRecord),
        commuteAllowance: allowance + numbers.relocationCosts + numbers.trainingCosts,
        selfPaidHealthCare: numbers.healthCareContributions,
        ...soliWithheld(lstbRecord),
        ...employeeProvision(lstbRecord, numbers.healthCareContributions),
      },
    }
  }
}

const NO_PROVISION: PersonProvision = {
  pensionOwnEur: 0,
  pensionEmployerEur: 0,
  healthBasicEur: 0,
  healthWithSickPayEur: 0,
  careEur: 0,
  employerSubsidyEur: 0,
  otherEur: 0,
  reducedOtherCap: false,
}

/** The provision lines of a Swiss employment (Anlage N-Gre Zeilen 82, 85, 88 and the Krankenkasse). */
function swissProvisionLines(nGre: NGreAmounts, healthBasicEur: number, supplementaryEur: number, subsidised: boolean): PersonProvision {
  return {
    ...NO_PROVISION,
    pensionOwnEur: nGre.assessed.pensionEmployeeEur,
    pensionEmployerEur: nGre.assessed.pensionEmployerEur,
    // A Swiss Krankenkasse pays no Krankengeld: nothing is cut (Anlage Vorsorgeaufwand Zeile 29).
    healthBasicEur,
    otherEur: nGre.assessed.otherProvisionEur + supplementaryEur,
    // Anlage Vorsorgeaufwand Zeile 49: without a subsidy to the health insurance the cap is 2.800 €.
    reducedOtherCap: subsidised,
  }
}

/** The provision lines of a German certificate (Zeilen 22–27); null until the lines are recorded. */
function germanProvisionLines(record: WageTaxCertificateRecord | null): PersonProvision | null {
  const lines = lstbLineValuesFrom(record)
  const { rvArbeitnehmer, kvArbeitnehmer, pvArbeitnehmer, avArbeitnehmer } = lines
  if (rvArbeitnehmer == null || kvArbeitnehmer == null || pvArbeitnehmer == null || avArbeitnehmer == null) return null
  return {
    pensionOwnEur: rvArbeitnehmer,
    // Employer and employee pay the same share of the statutory pension where Zeile 22 is not recorded.
    pensionEmployerEur: lines.rvArbeitgeber ?? rvArbeitnehmer,
    healthBasicEur: kvArbeitnehmer,
    healthWithSickPayEur: kvArbeitnehmer,
    careEur: pvArbeitnehmer,
    employerSubsidyEur: lines.zuschuesseKvPv ?? 0,
    employerCareSubsidyEur: lines.zuschussPv ?? undefined,
    otherEur: avArbeitnehmer,
    reducedOtherCap: true,
  }
}

function addProvision(a: PersonProvision, b: PersonProvision): PersonProvision {
  return {
    pensionOwnEur: a.pensionOwnEur + b.pensionOwnEur,
    pensionEmployerEur: a.pensionEmployerEur + b.pensionEmployerEur,
    healthBasicEur: a.healthBasicEur + b.healthBasicEur,
    healthWithSickPayEur: a.healthWithSickPayEur + b.healthWithSickPayEur,
    careEur: a.careEur + b.careEur,
    employerSubsidyEur: a.employerSubsidyEur + b.employerSubsidyEur,
    employerCareSubsidyEur: a.employerCareSubsidyEur === undefined && b.employerCareSubsidyEur === undefined ? undefined : (a.employerCareSubsidyEur ?? 0) + (b.employerCareSubsidyEur ?? 0),
    otherEur: a.otherEur + b.otherEur,
    reducedOtherCap: a.reducedOtherCap || b.reducedOtherCap,
  }
}

/** An employee's provision lines plus what they pay themselves (already in its deductible amount). */
function employeeProvision(record: WageTaxCertificateRecord | null, selfPaidHealthCare: number): { provision?: PersonProvision } {
  const lines = germanProvisionLines(record)
  return lines ? { provision: { ...lines, healthBasicEur: lines.healthBasicEur + selfPaidHealthCare } } : {}
}

/** LStB Zeile 5 as recorded; without it the estimate derives the Soli from the wage tax as before. */
function soliWithheld(record: WageTaxCertificateRecord | null): { soliWithheldEur?: number } {
  const value = record?.solidaritaetszuschlag
  return value !== null && value !== undefined && /^\d+(\.\d{1,2})?$/.test(value) ? { soliWithheldEur: Number(value) } : {}
}

function hasAnyLstbValue(record: WageTaxCertificateRecord): boolean {
  return record.bruttoarbeitslohn !== null || record.lohnsteuer !== null || record.sozialversicherung !== null
}

/**
 * Capital income the return taxes at the flat rate (§ 32d Abs. 1 EStG), as the Anlage KAP carries it:
 * all capital income of the year less the Sparer-Pauschbetrag (§ 20 Abs. 9 EStG) — the allowance counts
 * once, wherever a bank already used it. What the banks withheld is credited (§ 36 Abs. 2 Nr. 2 EStG).
 */
function flatRateCapital(
  record: { kapitalertraege: string | null; kapitalertragsteuer: string | null; solidaritaetszuschlag: string | null } | null,
  saverAllowance: number,
): { incomeEur: number; withheldEur: number } {
  const amount = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : 0)
  if (record === null) return { incomeEur: 0, withheldEur: 0 }
  return {
    incomeEur: Math.max(0, amount(record.kapitalertraege) - saverAllowance),
    withheldEur: amount(record.kapitalertragsteuer) + amount(record.solidaritaetszuschlag),
  }
}

/** The German certificate of the year when it is complete and consistent; otherwise it stays out. */
/**
 * The employee's insurance contributions per LStB less the employer's tax-free subsidies to health and
 * care insurance (Zeile 24): § 10 Abs. 2 Satz 1 Nr. 1 EStG deducts only what the employee bore (ADR-0090).
 */
function deductibleSocialSecurity(sozialversicherung: number, record: { zuschuesseKvPv?: string | null } | null): number {
  const subsidies = subsidiesDtoFrom(record).zuschuesseKvPv ?? 0
  return Math.max(0, sozialversicherung - subsidies)
}

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

/**
 * The Werbungskosten parts as the estimate counts them (ADR-0098 §2): the Entfernungspauschale, the
 * Homeoffice-Pauschale, the Arbeitsmittel, and the rest (professional bodies, account fees, other
 * costs, a move and training). Their sum is what `taxEstimateEmployee` gets as Werbungskosten.
 */
export function workExpenseParts(
  year: number,
  path: CommuteInputs | null,
  answers: Answers,
): { fahrtweg: number; homeoffice: number; arbeitsmittel: number; sonstiges: number } {
  const numbers = employeeFromAnswers(answers)
  const arbeitsmittel = path?.workEquipmentEur ?? 0
  return {
    fahrtweg: commuterAllowanceFrom(year, path),
    homeoffice: homeOfficeAllowanceFrom(year, path),
    arbeitsmittel,
    sonstiges: furtherWorkExpensesEur(path) - arbeitsmittel + numbers.relocationCosts + numbers.trainingCosts,
  }
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
