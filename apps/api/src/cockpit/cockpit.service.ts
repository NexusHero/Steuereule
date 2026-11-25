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
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import { TAX_CASE_READER, type TaxCaseReader } from '../tax-case/tax-case.reader.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../tax-year/tax-year.repository.js'
import type { CockpitStatusDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'
import { answersFrom } from '../interview/answers.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-data.js'
import type { CrossBorderSalaryStatementRecord } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { LinkService } from '../link/link.service.js'
import { SubmissionService } from '../submission/submission.service.js'
import { filingPathOf, interviewOptions, selfEmploymentEnabled } from '../config/self-employment.js'
import { BusinessService } from '../business/business.service.js'
import { AuditService } from '../audit/audit.service.js'
import { appendReadAudit } from '../common/read-audit.js'

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
    @Inject(TAX_CASE_READER) private readonly cases: TaxCaseReader,
    @Inject(PROVENANCE_REPOSITORY) private readonly markingRepository: ProvenanceRepository,
    @Optional() private readonly link?: LinkService,
    /** The Abgabe of the year (ADR-0098 §8); absent in tests that build the cockpit without it. */
    @Optional() @Inject(SubmissionService) private readonly submissions?: SubmissionService,
    /** The book of the self-employed (ADR-0101); absent in tests that build the cockpit without it. */
    @Optional() @Inject(BusinessService) private readonly business?: BusinessService,
    @Optional() @Inject(AuditService) private readonly audit?: AuditService,
  ) {}

  /** The year's Gewinneinkünfte of one person from the book (Anlage S plus G), 0 without one or with the switch off. */
  private async businessProfit(userId: string, taxYear: number, person: 'A' | 'B'): Promise<number> {
    const input = this.business ? await this.business.estimateInput(userId, taxYear, person) : null
    return input === null ? 0 : Math.round((input.business.selfEmployedEur ?? 0) + (input.business.tradeEur ?? 0))
  }

  /** Wages and pension of one person, from their own records (a Grenzgänger's Lohnausweis, the LStB, the pension). */
  private async personIncome(userId: string, taxYear: number, answers: Answers): Promise<{ readonly facts: IncomeFacts; readonly data: WageTaxCertificateData; readonly pension: number | null }> {
    const {
      wageTaxCertificate: lstbRecord,
      pension: pensionRecord,
      salaryStatement: chRecord,
    } = await this.cases.read(userId, taxYear, ['wageTaxCertificate', 'pension', 'salaryStatement'])
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

  /**
   * Person B of a joint return recorded in this account with the answers their income is read by, or
   * null (single, separate, B's own account, or nothing known about B's income). The basis names B's
   * job; where it was never asked (the owl sets up the joint return and B's records directly), B's
   * recorded wages speak for themselves: a Lohnausweis makes B a Grenzgänger, an LStB an employee.
   */
  private async partner(userId: string, taxYear: number, answers: Answers): Promise<{ readonly userId: string; readonly answers: Answers } | null> {
    if (this.link === undefined) return null
    let partnerId: string
    try {
      partnerId = await this.link.dataUser(userId, taxYear, 'B')
    } catch {
      return null
    }
    const own = answersFrom((await this.cases.read(partnerId, taxYear, ['interviewRows'])).interviewRows)
    const job = answers['partner-job']
    if (answers.familienstand === 'Verheiratet' && (job === 'Angestellt' || job === 'Rente')) return { userId: partnerId, answers: partnerAnswers(answers, own) }
    const { wageTaxCertificate: lstbRecord, salaryStatement: chRecord } = await this.cases.read(partnerId, taxYear, ['wageTaxCertificate', 'salaryStatement'])
    const swissWage = recordedValue(chRecord?.fields['bruttolohn-total'] ?? null) !== null
    const germanWage = recordedValue(lstbRecord?.bruttoarbeitslohn ?? null) !== null
    if (!swissWage && !germanWage) return null
    return { userId: partnerId, answers: { ...own, job: 'Angestellt', ausland: swissWage ? CH_FOREIGN : 'Nein' } as Answers }
  }

  async getSummary(userId: string, taxYear: number): Promise<CockpitSummaryDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, taxYear)
    if (!record) return null

    const [{ interviewRows, pension: pensionRecord, capital: capitalRecord, rentals: rentalRecords }, markings] = await Promise.all([
      this.cases.read(userId, taxYear, ['interviewRows', 'pension', 'capital', 'rentals']),
      this.markingRepository.listForUserAndYears(userId, [taxYear]),
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
    const partnerPerson = await this.partner(userId, taxYear, answers)
    const partnerId = partnerPerson?.userId ?? null
    const partner = partnerPerson === null ? null : await this.personIncome(partnerPerson.userId, taxYear, partnerPerson.answers)
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
    await appendReadAudit(this.audit, userId, 'cockpit', [partnerId])

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
