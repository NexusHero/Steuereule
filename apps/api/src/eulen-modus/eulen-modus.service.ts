import { Inject, Injectable } from '@nestjs/common'
import {
  formatGermanDate,
  appealDeadlineEnd,
  generateOwlCards,
  homeOfficeDaysFromInterview,
  LEGAL_STATUS_DATE,
  type OwlArchiveYear,
  type OwlInputFacts,
  type KiPort,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from '../bescheid/bescheid.repository.js'
import { todayInBerlin } from '../fristen/fristen.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { KI_PORT, checkPiiFree } from '../ki/ki.adapter.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../kinder/kind.repository.js'
import {
  OWL_SETTING_REPOSITORY,
  OWL_CARD_DISMISSAL_REPOSITORY,
  type OwlSettingRepository,
  type OwlCardDismissalRepository,
} from './eulen-modus.repository.js'
import type { OwlSettingResponseDto, OwlCardsResponseDto } from './dto/eulen-modus.dto.js'

function toAnswerMap(rows: InterviewAnswerRecord[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) map[row.questionId] = row.value
  return map
}

function integer(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null
}

function archiveYear(
  assessment: AssessmentRecord | null,
  answers: Record<string, string>,
  today: string,
): OwlArchiveYear | null {
  if (!assessment?.bescheiddatum || assessment.status === 'einspruch-eingelegt') return null
  const deadlineEnd = appealDeadlineEnd(assessment.bescheiddatum)
  const homeofficeTage = homeOfficeDaysFromInterview(answers)
  if (deadlineEnd < today || !homeofficeTage) return null
  return {
    steuerjahr: assessment.steuerjahr,
    assessmentDate: formatGermanDate(assessment.bescheiddatum),
    appealPossibleUntil: formatGermanDate(deadlineEnd),
    homeofficeTage,
  }
}

@Injectable()
export class OwlModeService {
  constructor(
    @Inject(OWL_SETTING_REPOSITORY) private readonly settingRepo: OwlSettingRepository,
    @Inject(OWL_CARD_DISMISSAL_REPOSITORY) private readonly dismissalRepo: OwlCardDismissalRepository,
    @Inject(CHILD_REPOSITORY) private readonly childrenRepo: ChildRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepo: InterviewAnswerRepository,
    @Inject(ASSESSMENT_REPOSITORY) private readonly assessmentRepo: AssessmentRepository,
    @Inject(KI_PORT) private readonly kiPort: KiPort,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getSetting(userId: string): Promise<OwlSettingResponseDto> {
    const row = await this.settingRepo.findByUserId(userId)
    await this.auditService.append({ userId, action: 'READ', resource: 'eulen_einstellung' })
    return {
      aktiviert: row?.aktiviert ?? false,
      aktiviertAm: row?.aktiviertAm ? row.aktiviertAm.toISOString() : null,
    }
  }

  async setSetting(userId: string, aktiviert: boolean): Promise<OwlSettingResponseDto> {
    const row = await this.settingRepo.setEnabled(userId, aktiviert)
    return {
      aktiviert: row.aktiviert,
      aktiviertAm: row.aktiviertAm ? row.aktiviertAm.toISOString() : null,
    }
  }

  async getCards(userId: string, steuerjahr: number, today = todayInBerlin()): Promise<OwlCardsResponseDto> {
    const setting = await this.settingRepo.findByUserId(userId)
    const aktiviert = setting?.aktiviert ?? false
    if (!aktiviert) {
      return {
        aktiviert: false,
        cards: [],
        legalStatus: LEGAL_STATUS_DATE,
      }
    }

    const [kinder, dismissedItems, interviewRows, lastYearInterviewRows, lastYearAssessment] = await Promise.all([
      this.childrenRepo.listForUserAndYear(userId, steuerjahr),
      this.dismissalRepo.listForUserAndYear(userId, steuerjahr),
      this.interviewRepo.findAllForUserAndYear(userId, steuerjahr),
      this.interviewRepo.findAllForUserAndYear(userId, steuerjahr - 1),
      this.assessmentRepo.findForUserAndYear(userId, steuerjahr - 1),
    ])

    const answers = toAnswerMap(interviewRows)
    const lastYearAnswers = toAnswerMap(lastYearInterviewRows)
    const lastYearDonationsEur = answers['spenden-betrag'] ? null : integer(lastYearAnswers['spenden-betrag'])
    const archive = archiveYear(lastYearAssessment, lastYearAnswers, today)

    const input: OwlInputFacts = {
      steuerjahr,
      hasTraining: answers['fortbildung'] === 'Ja',
      homeofficeTage: homeOfficeDaysFromInterview(answers),
      lastYearFacts: lastYearDonationsEur !== null ? { donationsEur: lastYearDonationsEur } : null,
      childrenPerInterview: answers['kinder'] !== undefined && answers['kinder'] !== 'Nein',
      hasChildrenRecorded: kinder.length > 0,
      archiveYears: archive ? [archive] : [],
      dismissedFingerprints: dismissedItems,
    }

    checkPiiFree(input)
    const rawCards = generateOwlCards(input)
    const cards = await Promise.all(
      rawCards.map(async ({ sourceId, ...card }) => ({
        ...card,
        sourceTranslated: await this.kiPort.explainSource(sourceId),
      })),
    )
    await this.auditService.append({ userId, action: 'READ', resource: 'eulen_karten' })

    return {
      aktiviert: true,
      cards,
      legalStatus: LEGAL_STATUS_DATE,
    }
  }

  async dismissCard(userId: string, steuerjahr: number, fingerprint: string): Promise<void> {
    await this.dismissalRepo.dismiss(userId, steuerjahr, fingerprint)
  }
}
