import { Inject, Injectable } from '@nestjs/common'
import {
  employeeFromData,
  chfToEur,
  cockpitRangeFromInputs,
  gatedIncomeTypes,
  openSalaryCertificateFields,
  type Answers,
  type CockpitRange,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../kapital/kapital.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../rente/rente.repository.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from './tax-year.repository.js'
import type { CockpitStatusDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'
import { answersFrom } from '../interview/answers.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-daten.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRecord, type CrossBorderSalaryStatementRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-lohnausweis/lohnausweis-daten.js'

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
    gated: gatedIncomeTypes(answers),
  }
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
  ) {}

  async getSummary(userId: string, steuerjahr: number): Promise<CockpitSummaryDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    if (!record) return null

    const [lstbRecord, interviewRows, markings, pensionRecord, capitalRecord, rentalRecords, chRecord] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
      this.markingRepository.listForUserAndYears(userId, [steuerjahr]),
      this.pensionRepository.findForUserAndYear(userId, steuerjahr),
      this.capitalRepository.findForUserAndYear(userId, steuerjahr),
      this.rentalRepository.listForUserAndYear(userId, steuerjahr),
      this.chSalaryCertificateRepository.findForUserAndYear(userId, steuerjahr),
    ])

    const data = wageTaxCertificateDataFrom(lstbRecord)
    const answers = answersFrom(interviewRows)

    const unconfirmedFacts = new Set(
      markings.filter((k) => !k.bestaetigt).map((k) => k.key.slice(0, k.key.indexOf('.'))),
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

    const facts = answers.ausland === CH_FOREIGN ? crossBorderFacts(chRecord, answers) : employeeFromData(data, answers)
    const status = cockpitRangeFromInputs({
      sum: facts.einnahmen,
      openItems: facts.openItems,
      conflicts: facts.conflicts,
      gated: facts.gated,
      unconfirmedItems,
      unconfirmedSum,
    })

    return { taxYear: record.steuerjahr, status: toStatusDto(status), openItems: record.openItems }
  }
}
