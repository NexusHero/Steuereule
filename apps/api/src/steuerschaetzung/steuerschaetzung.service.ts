import { Inject, Injectable } from '@nestjs/common'
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
  taxEstimateCrossBorder,
  depreciationRatePercent,
  claimMonths,
  estimateMarriedCouple,
  monthlyChildBenefitClaim,
  type Answers,
  type SpouseIncome,
  type TaxEstimate,
} from '@steuereule/core'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from '../arbeitsweg/arbeitsweg.repository.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-lohnausweis/lohnausweis-daten.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersFrom } from '../interview/answers.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-daten.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../stammdaten/stammdaten.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../kinder/kind.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../kopplung/kopplung.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'

export type TaxEstimateStatus =
  | (Extract<TaxEstimate, { kind: 'spanne' }> & { readonly churchTaxOpen: boolean; readonly jointAssessment?: boolean })
  | { readonly kind: 'offen'; readonly fehlt: readonly string[] }
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

  async getState(userId: string, year: number): Promise<TaxEstimateStatus> {
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
      return this.marriedCouple(userId, year)
    }
    if (gatedIncomeTypes(answers).length > 0 || specialCircumstance(answers)) {
      return { kind: 'nicht-moeglich', reason: 'besondere-lebenslage' }
    }

    const numbers = employeeFromAnswers(answers)
    const allowance = commuterAllowanceFrom(year, path)
    const churchTaxOpen = masterData?.religion !== undefined && masterData?.religion !== null && masterData.religion !== 'VD'

    if (answers.ausland === CH_FOREIGN) {
      const values = salaryCertificateValuesFromRecord(chRecord)
      const exchangeRate = exchangeRateFromRecord(chRecord)
      const status = crossBorderStatusFromAnswers(answers)
      const nGre = chRecord?.nGre
      const fehlt = [
        ...(status === null ? ['grenzgaenger-status'] : openSalaryCertificateFields(values, status)),
        ...(exchangeRate === null ? ['wechselkurs'] : []),
        ...(nGre?.pkArbeitnehmerChf === null || nGre?.pkArbeitnehmerChf === undefined ? ['pk-obligatorium'] : []),
      ]
      if (fehlt.length > 0 || exchangeRate === null || nGre === undefined) return { kind: 'offen', fehlt }
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
      return withChurchTax(
        taxEstimateCrossBorder({
          year,
          wageEur: rows.z23,
          withholdingTaxEur: rows.z25,
          retirementProvisionEur: rows.z85,
          otherProvisionEur: rows.z82,
          healthInsuranceEur: Math.round(chfToEur(krankenkasseChf, exchangeRate.rate)) + numbers.healthCareContributions,
          commuterAllowance: allowance,
          donations: numbers.donations,
        }),
        churchTaxOpen,
      )
    }

    const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (state.kind === 'unvollstaendig') return { kind: 'offen', fehlt: [...state.open, ...state.unclear] }
    if (state.kind === 'widerspruch') return { kind: 'offen', fehlt: state.conflicts.map((w) => w.art) }
    return withChurchTax(
      taxEstimateEmployee({
        year,
        bruttoarbeitslohn: state.bruttoarbeitslohn,
        lohnsteuer: state.lohnsteuer,
        sozialversicherung: state.sozialversicherung,
        commuterAllowance: allowance,
        otherIncomeRelatedExpenses: numbers.relocationCosts,
        donations: numbers.donations,
        selfPaidKvPv: numbers.healthCareContributions,
      }),
      churchTaxOpen,
    )
  }

  /** ADR-0054: a couple's estimate from both spouses' figures — only once the joint return for the year is set up. */
  private async marriedCouple(userId: string, year: number): Promise<TaxEstimateStatus> {
    const link = this.link ? await this.link.findByUserAndYear(userId, year) : null
    if (!link || link.veranlagungsart !== 'zusammen') return { kind: 'offen', fehlt: ['veranlagungsart'] }
    const [a, b] = await Promise.all([
      this.income(link.personAUserId, year),
      link.personBUserId ? this.income(link.personBUserId, year) : Promise.resolve(null),
    ])
    const fehlt = [...(a?.kind === 'offen' ? a.fehlt : []), ...(b?.kind === 'offen' ? b.fehlt.map((f) => `personB.${f}`) : [])]
    if (a === null) fehlt.unshift('einkommen')
    if (fehlt.length > 0 || a?.kind !== 'ok') return { kind: 'offen', fehlt }
    const [kinder, properties, sdA, sdB] = await Promise.all([
      this.kinder ? this.kinder.listForUserAndYear(link.personAUserId, year) : Promise.resolve([]),
      this.rental ? this.rental.listForUserAndYear(link.personAUserId, year) : Promise.resolve([]),
      this.masterData.findByUserId(link.personAUserId),
      link.personBUserId ? this.masterData.findByUserId(link.personBUserId) : Promise.resolve(null),
    ])
    const church = (religion: string | null | undefined) => religion !== undefined && religion !== null && religion !== 'VD'
    const estimate = estimateMarriedCouple({
      year,
      a: a.spouse,
      b: b?.kind === 'ok' ? b.spouse : null,
      children: kinder.length,
      childBenefit: kinder.reduce((sum, k) => sum + monthlyChildBenefitClaim(year) * claimMonths(k.geburtsdatum, year), 0),
      rentalSurplus: properties.reduce((sum, o) => sum + rentalSurplus(o), 0),
      donations: a.donations + (b?.kind === 'ok' ? b.donations : 0),
      churchMember: church(sdA?.religion) || church(sdB?.religion),
    })
    if (estimate.kind !== 'spanne') return { kind: 'nicht-moeglich', reason: estimate.reason }
    const { childAllowanceUsed: _k, churchTax: _c, churchTaxOpen, ...range } = estimate
    return { ...range, churchTaxOpen, jointAssessment: true }
  }

  /** One spouse's wage income for the couple estimate; null when they have none. */
  private async income(
    userId: string,
    year: number,
  ): Promise<{ kind: 'ok'; spouse: SpouseIncome; donations: number } | { kind: 'offen'; fehlt: string[] } | null> {
    const [lstbRecord, interviewRows, chRecord, path] = await Promise.all([
      this.lstb.findForUserAndYear(userId, year),
      this.interview.findAllForUserAndYear(userId, year),
      this.chSalaryCertificate.findForUserAndYear(userId, year),
      this.commute.findForUserAndYear(userId, year),
    ])
    const answers = answersFrom(interviewRows)
    const numbers = employeeFromAnswers(answers)
    const allowance = commuterAllowanceFrom(year, path)
    if (chRecord && (answers.ausland === CH_FOREIGN || lstbRecord === null)) {
      const values = salaryCertificateValuesFromRecord(chRecord)
      const exchangeRate = exchangeRateFromRecord(chRecord)
      const nGre = chRecord.nGre
      const fehlt = [...(exchangeRate === null ? ['wechselkurs'] : []), ...(nGre.pkArbeitnehmerChf === null ? ['pk-obligatorium'] : [])]
      if (values['bruttolohn-total'] === undefined) fehlt.unshift('bruttolohn-total')
      if (fehlt.length > 0 || exchangeRate === null) return { kind: 'offen', fehlt }
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
    if (lstbRecord === null) return null
    const state = wageTaxCertificateStatus(wageTaxCertificateDataFrom(lstbRecord))
    if (state.kind === 'unvollstaendig') return { kind: 'offen', fehlt: [...state.open, ...state.unclear] }
    if (state.kind === 'widerspruch') return { kind: 'offen', fehlt: state.conflicts.map((w) => w.art) }
    return {
      kind: 'ok',
      donations: numbers.donations,
      spouse: {
        kind: 'employee',
        grossWage: state.bruttoarbeitslohn,
        wageTax: state.lohnsteuer,
        socialSecurity: state.sozialversicherung,
        commuteAllowance: allowance + numbers.relocationCosts,
        selfPaidHealthCare: numbers.healthCareContributions,
      },
    }
  }
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
  if (path === null || path.einfacheKm === null || path.verkehrsmittel === null) return 0
  const days = calculateWorkdays({
    year,
    workdays: path.arbeitstage,
    vacationDays: path.urlaubstage,
    sickDays: path.krankheitstage,
    homeOfficeDays: path.homeofficeTage,
    publicHolidays: path.feiertage ?? 0,
  })
  if (days.kind !== 'bestimmt') return 0
  try {
    return commuterAllowance({ oneWayKm: path.einfacheKm, days: days.commuteDays, year, withCar: path.verkehrsmittel === 'pkw' })
  } catch {
    return 0
  }
}

function withChurchTax(estimate: TaxEstimate, churchTaxOpen: boolean): TaxEstimateStatus {
  if (estimate.kind !== 'spanne') return { kind: 'nicht-moeglich', reason: estimate.reason }
  return { ...estimate, churchTaxOpen }
}
