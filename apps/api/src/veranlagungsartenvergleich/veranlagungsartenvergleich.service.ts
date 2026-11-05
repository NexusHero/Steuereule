import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  employeeFromData,
  progressionsvorbehaltAus,
  veranlagungsartenvergleich,
  type KirchensteuerFaktor,
  type Veranlagungsartenvergleich as Vergleich,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from '../cockpit/tax-year.repository.js'
import type { UnschaerfeDto, VeranlagungsartenvergleichDto, VergleichsHerkunftDto } from './dto/veranlagungsartenvergleich-response.dto.js'
import { answersFrom } from '../interview/answers.js'
import { wageTaxCertificateDataFrom } from '../lstb/lstb-daten.js'

function toDto(vergleich: Vergleich): VeranlagungsartenvergleichDto {
  const unschaerfe: UnschaerfeDto =
    vergleich.unschaerfe.kind === 'bestimmt'
      ? { kind: 'bestimmt', obergrenze: vergleich.unschaerfe.obergrenze }
      : { kind: 'unbestimmt', grund: vergleich.unschaerfe.grund }
  const herkunft: VergleichsHerkunftDto = {
    zveA: vergleich.herkunft.zveA,
    zveB: vergleich.herkunft.zveB,
    bestandteile: [...vergleich.herkunft.bestandteile],
  }
  switch (vergleich.aussage) {
    case 'eindeutig':
      return {
        kind: 'eindeutig',
        empfehlung: vergleich.empfehlung,
        einzel: vergleich.einzel,
        zusammen: vergleich.zusammen,
        delta: vergleich.delta,
        unschaerfe,
        herkunft,
      }
    case 'zu-knapp':
      return { kind: 'zu-knapp', einzel: vergleich.einzel, zusammen: vergleich.zusammen, delta: vergleich.delta, unschaerfe, herkunft }
    case 'unbestimmt':
      return { kind: 'unbestimmt', einzel: vergleich.einzel, zusammen: vergleich.zusammen, delta: vergleich.delta, unschaerfe, herkunft }
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

  async getVergleich(
    userId: string,
    steuerjahr: number,
    verheiratet: boolean,
    zveB: number | undefined,
    kirchensteuerFaktor: KirchensteuerFaktor,
  ): Promise<VeranlagungsartenvergleichDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    if (!record) return null

    const [lstbRecord, interviewRows] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
    ])

    const daten = wageTaxCertificateDataFrom(lstbRecord)
    const answers = answersFrom(interviewRows)

    if (!verheiratet) {
      return { kind: 'nicht-anwendbar', grund: 'nicht-verheiratet' }
    }
    const fakten = employeeFromData(daten, answers)
    if (fakten.einnahmen === 0) {
      return { kind: 'nicht-anwendbar', grund: 'keine-einnahmen' }
    }
    if (zveB === undefined) {
      throw new InvalidInputError('ZVE_B_REQUIRED', 'zveB is required to run the Veranlagungsartenvergleich.')
    }

    const vergleich = veranlagungsartenvergleich({
      zveA: fakten.einnahmen,
      zveB,
      year: steuerjahr,
      progressionsvorbehalt: progressionsvorbehaltAus(answers),
      kirchensteuerFaktor,
    })
    return toDto(vergleich)
  }
}
