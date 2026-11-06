import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  employeeFromData,
  progressionClauseFrom,
  filingTypeComparison,
  type ChurchTaxFactor,
  type FilingTypeComparison as Vergleich,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../cockpit/tax-year.repository.js'
import type { UncertaintyDto, FilingTypeComparisonDto, ComparisonSourceDto } from './dto/veranlagungsartenvergleich-response.dto.js'
import { answersFrom } from '../interview/answers.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-daten.js'

function toDto(comparison: Vergleich): FilingTypeComparisonDto {
  const uncertainty: UncertaintyDto =
    comparison.uncertainty.kind === 'bestimmt'
      ? { kind: 'bestimmt', upperLimit: comparison.uncertainty.upperLimit }
      : { kind: 'unbestimmt', reason: comparison.uncertainty.reason }
  const provenance: ComparisonSourceDto = {
    zveA: comparison.provenance.zveA,
    zveB: comparison.provenance.zveB,
    components: [...comparison.provenance.components],
  }
  switch (comparison.statement) {
    case 'eindeutig':
      return {
        kind: 'eindeutig',
        recommendation: comparison.recommendation,
        single: comparison.single,
        joint: comparison.joint,
        delta: comparison.delta,
        uncertainty,
        provenance,
      }
    case 'zu-knapp':
      return { kind: 'zu-knapp', single: comparison.single, joint: comparison.joint, delta: comparison.delta, uncertainty, provenance }
    case 'unbestimmt':
      return { kind: 'unbestimmt', single: comparison.single, joint: comparison.joint, delta: comparison.delta, uncertainty, provenance }
  }
}

/** Application logic: userId+steuerjahr-scoped read, then the deterministic Veranlagungsartenvergleich → wire mapping. */
@Injectable()
export class AssessmentComparisonService {
  constructor(
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepository: WageTaxCertificateRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
  ) {}

  async getComparison(
    userId: string,
    taxYear: number,
    married: boolean,
    zveB: number | undefined,
    churchTaxFactor: ChurchTaxFactor,
  ): Promise<FilingTypeComparisonDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, taxYear)
    if (!record) return null

    const [lstbRecord, interviewRows] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, taxYear),
      this.interviewRepository.findAllForUserAndYear(userId, taxYear),
    ])

    const data = wageTaxCertificateDataFrom(lstbRecord)
    const answers = answersFrom(interviewRows)

    if (!married) {
      return { kind: 'nicht-anwendbar', reason: 'nicht-verheiratet' }
    }
    const facts = employeeFromData(data, answers)
    if (facts.einnahmen === 0) {
      return { kind: 'nicht-anwendbar', reason: 'keine-einnahmen' }
    }
    if (zveB === undefined) {
      throw new InvalidInputError('ZVE_B_REQUIRED', 'zveB is required to run the Veranlagungsartenvergleich.')
    }

    const comparison = filingTypeComparison({
      zveA: facts.einnahmen,
      zveB,
      year: taxYear,
      progressionClause: progressionClauseFrom(answers),
      churchTaxFactor,
    })
    return toDto(comparison)
  }
}
