import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  employeeFromData,
  chfToEur,
  GERMAN_JOB_TOO,
  type WageTaxCertificateData,
  cockpitRangeFromInputs,
  gatedIncomeTypes,
  openSalaryCertificateFields,
  type Answers,
  type CockpitRange,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from './tax-year.repository.js'
import type { CockpitStatusDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'
import { answersFrom } from '../interview/answers.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRecord, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { LinkService } from '../link/link.service.js'
import { SubmissionService } from '../submission/submission.service.js'
import { filingPathOf, interviewOptions, selfEmploymentEnabled } from '../config/self-employment.js'
import { BusinessService } from '../business/business.service.js'

function recordedValue(raw: string | null): number | null {
  if (raw === null || raw === 'unklar') return null
  if (!/^\d+$/.test(raw)) return null
  return Number(raw)
}

function toStatusDto(status: CockpitRange): CockpitStatusDto {
  switch (status.kind) {
    case 'bestimmt':
      return { kind: 'bestimmt', value: status.value }
    case 'spanne':
      return {
        kind: 'spanne',
        from: status.from,
        to: status.to,
        openItems: status.openItems,
        conflicts: status.conflicts,
        unconfirmedItems: status.unconfirmedItems,
        unconfirmedSum: status.unconfirmedSum,
      }
    case 'gated':
      return { kind: 'gated', sum: status.sum, gated: [...status.gated] }
  }
}

const CH_FOREIGN = 'Ja, in die Schweiz'

/** A Grenzgänger's income is the converted Lohnausweis; a missing rate or figure is open, never a guessed zero. */
function crossBorderFacts(record: CrossBorderSalaryStatementRecord | null, answers: Answers) {
  const values = salaryCertificateValuesFromRecord(record)
  const exchangeRate = exchangeRateFromRecord(record)
  const status = crossBorderStatusFromAnswers(answers)
  const gross = values['bruttolohn-total']
  const openFields = status === null ? 1 : openSalaryCertificateFields(values, status).length
  return {
    einnahmen: gross !== undefined && exchangeRate !== null ? Math.round(chfToEur(gross, exchangeRate.rate)) : 0,
    openItems: openFields + (exchangeRate === null ? 1 : 0),
    conflicts: 0,
    gated: gatedIncomeTypes(answers, interviewOptions()),
  }
}

interface IncomeFacts {
  readonly einnahmen: number
  readonly openItems: number
  readonly conflicts: number
  readonly gated: ReturnType<typeof gatedIncomeTypes>
}

/**
 * The German certificate of a commuter who also worked in Germany (ADR-0079): its gross wage adds to
 * the Swiss one. Asked for in the basis but not entered yet, it is one open item.
 */
function withGermanJob(facts: IncomeFacts, data: WageTaxCertificateData, answers: Answers): IncomeFacts {
  const gross = data.bruttoarbeitslohn
  if (gross.kind === 'erfasst') return { ...facts, einnahmen: facts.einnahmen + gross.value }
  return answers['de-job'] === GERMAN_JOB_TOO ? { ...facts, openItems: facts.openItems + 1 } : facts
}

/** What the basis says about Person B, as B's own answers (job, Switzerland, German job too). */
function partnerAnswers(answers: Answers, own: Answers): Answers {
  const job = answers['partner-job']
  return {
    ...own,
    job: job === 'Rente' ? 'Rente' : 'Angestellt',
    ausland: answers['partner-ausland'] === CH_FOREIGN ? CH_FOREIGN : 'Nein',
    ...(answers['partner-de-job'] !== undefined ? { 'de-job': answers['partner-de-job'] } : {}),
  } as Answers
}

/** Application logic: userId+steuerjahr-scoped read, then the honest fold -> wire mapping. */
@Injectable()
export class CockpitService {
  constructor(
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepository: WageTaxCertificateRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(PROVENANCE_REPOSITORY) private readonly markingRepository: ProvenanceRepository,
    @Inject(PENSION_REPOSITORY) private readonly pensionRepository: PensionRepository,
    @Inject(CAPITAL_REPOSITORY) private readonly capitalRepository: CapitalRepository,
    @Inject(RENTAL_REPOSITORY) private readonly rentalRepository: RentalRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chSalaryCertificateRepository: CrossBorderSalaryStatementRepository,
    @Optional() private readonly link?: LinkService,
    /** The Abgabe of the year (ADR-0098 §8); absent in tests that build the cockpit without it. */
    @Optional() @Inject(SubmissionService) private readonly submissions?: SubmissionService,
    /** The book of the self-employed (ADR-0101); absent in tests that build the cockpit without it. */
    @Optional() @Inject(BusinessService) private readonly business?: BusinessService,
  ) {}

  /** The year's Gewinneinkünfte of one person from the book (Anlage S plus G), 0 without one or with the switch off. */
  private async businessProfit(userId: string, taxYear: number, person: 'A' | 'B'): Promise<number> {
    const input = this.business ? await this.business.estimateInput(userId, taxYear, person) : null
    return input === null ? 0 : Math.round((input.business.selfEmployedEur ?? 0) + (input.business.tradeEur ?? 0))
  }

  /** Wages and pension of one person, from their own records (a Grenzgänger's Lohnausweis, the LStB, the pension). */
  private async personIncome(userId: string, taxYear: number, answers: Answers): Promise<{ readonly facts: IncomeFacts; readonly data: WageTaxCertificateData; readonly pension: number | null }> {
    const [lstbRecord, pensionRecord, chRecord] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, taxYear),
      this.pensionRepository.findForUserAndYear(userId, taxYear),
      this.chSalaryCertificateRepository.findForUserAndYear(userId, taxYear),
    ])
    const data = wageTaxCertificateDataFrom(lstbRecord)
    const baseFacts: IncomeFacts = answers.ausland === CH_FOREIGN ? withGermanJob(crossBorderFacts(chRecord, answers), data, answers) : { ...employeeFromData(data, answers), gated: gatedIncomeTypes(answers, interviewOptions()) }
    // A pensioner's income is the pension, not the LStB — without it the hero read "0 €" (UX review K3).
    const pension = answers.job === 'Rente' ? recordedValue(pensionRecord?.jahresbetrag ?? null) : null
    const facts =
      answers.job === 'Rente'
        ? { ...baseFacts, einnahmen: baseFacts.einnahmen + (pension ?? 0), openItems: baseFacts.openItems + (pension === null ? 1 : 0) }
        : baseFacts
    return { facts, data, pension }
  }

  /** Person B of a joint return recorded in this account, or null (single, separate, or B's own account). */
  private async partnerUser(userId: string, taxYear: number, answers: Answers): Promise<string | null> {
    if (this.link === undefined || answers.familienstand !== 'Verheiratet') return null
    const job = answers['partner-job']
    if (job !== 'Angestellt' && job !== 'Rente') return null
    try {
      return await this.link.dataUser(userId, taxYear, 'B')
    } catch {
      return null
    }
  }

  async getSummary(userId: string, taxYear: number): Promise<CockpitSummaryDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, taxYear)
    if (!record) return null

    const [interviewRows, markings, pensionRecord, capitalRecord, rentalRecords] = await Promise.all([
      this.interviewRepository.findAllForUserAndYear(userId, taxYear),
      this.markingRepository.listForUserAndYears(userId, [taxYear]),
      this.pensionRepository.findForUserAndYear(userId, taxYear),
      this.capitalRepository.findForUserAndYear(userId, taxYear),
      this.rentalRepository.listForUserAndYear(userId, taxYear),
    ])

    const answers = answersFrom(interviewRows)
    const own = await this.personIncome(userId, taxYear, answers)
    const data = own.data

    const unconfirmedFacts = new Set(
      markings.filter((k) => !k.confirmed).map((k) => k.key.slice(0, k.key.indexOf('.'))),
    )
    let unconfirmedItems = 0
    let unconfirmedSum = 0
    for (const fact of unconfirmedFacts) {
      let value: number | null = null
      if (fact === 'lstb' && data.bruttoarbeitslohn.kind === 'erfasst') {
        value = data.bruttoarbeitslohn.value
      } else if (fact === 'rente') {
        value = recordedValue(pensionRecord?.jahresbetrag ?? null)
      } else if (fact === 'kapital') {
        value = recordedValue(capitalRecord?.kapitalertraege ?? null)
      } else if (fact.startsWith('vermietung:')) {
        const propertyId = fact.slice('vermietung:'.length)
        const property = rentalRecords.find((o) => o.id === propertyId)
        value = recordedValue(property?.mieteinnahmen ?? null)
      }
      if (value !== null) {
        unconfirmedItems += 1
        unconfirmedSum += value
      }
    }

    // A joint return: Person B's wages count too, from B's own records (Echtdatentest 18.11.2026).
    const partnerId = await this.partnerUser(userId, taxYear, answers)
    const partner = partnerId === null ? null : await this.personIncome(partnerId, taxYear, partnerAnswers(answers, answersFrom(await this.interviewRepository.findAllForUserAndYear(partnerId, taxYear))))
    // ADR-0101: the profit of each person's book; B's book is B's own account or, for B kept here, person B.
    const married = answers.familienstand === 'Verheiratet'
    const [profitA, profitB] = await Promise.all([
      this.businessProfit(userId, taxYear, 'A'),
      partnerId !== null ? this.businessProfit(partnerId, taxYear, 'A') : married ? this.businessProfit(userId, taxYear, 'B') : Promise.resolve(0),
    ])
    // A loss lowers the other income, but the sum of a person never goes below zero.
    const ownIncome = Math.max(0, own.facts.einnahmen + profitA)
    const partnerIncome = partner === null ? Math.max(0, profitB) : Math.max(0, partner.facts.einnahmen + profitB)
    const facts: IncomeFacts =
      partner === null
        ? { ...own.facts, einnahmen: ownIncome + (married ? Math.max(0, profitB) : 0) }
        : { ...own.facts, einnahmen: ownIncome + partnerIncome, openItems: own.facts.openItems + partner.facts.openItems }
    const status = cockpitRangeFromInputs({
      sum: facts.einnahmen,
      openItems: facts.openItems,
      conflicts: facts.conflicts,
      gated: facts.gated,
      unconfirmedItems,
      unconfirmedSum,
    })

    const submission = this.submissions ? await this.submissions.state(userId, taxYear) : null

    return {
      taxYear: record.taxYear,
      status: toStatusDto(status),
      openItems: record.openItems,
      ...(partner === null ? {} : { byPerson: { a: ownIncome, b: partnerIncome } }),
      submission,
      capabilities: { selbststaendig: selfEmploymentEnabled() },
      filingPath: filingPathOf(answers),
    }
  }
}
