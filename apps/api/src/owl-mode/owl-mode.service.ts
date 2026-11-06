import { Inject, Injectable } from '@nestjs/common'
import {
  formatGermanDate,
  appealDeadlineEnd,
  generateOwlCards,
  homeOfficeDaysFromInterview,
  PROFESSION_VALUES,
  type Profession,
  LEGAL_STATUS_DATE,
  type OwlArchiveYear,
  type OwlInputFacts,
  type KiPort,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { todayInBerlin } from '../deadlines/deadlines.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { KI_PORT, checkPiiFree } from '../ki/ki.adapter.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import {
  OWL_SETTING_REPOSITORY,
  OWL_CARD_DISMISSAL_REPOSITORY,
  type OwlSettingRepository,
  type OwlCardDismissalRepository,
} from './owl-mode.repository.js'
import type { OwlSettingResponseDto, OwlCardsResponseDto } from './dto/owl-mode.dto.js'

function toAnswerMap(rows: InterviewAnswerRecord[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) map[row.questionId] = row.value
  return map
}

function professionFrom(value: string | undefined): Profession | undefined {
  return (PROFESSION_VALUES as readonly string[]).includes(value ?? '') ? (value as Profession) : undefined
}

function integer(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null
}

function archiveYear(
  assessment: AssessmentRecord | null,
  answers: Record<string, string>,
  today: string,
): OwlArchiveYear | null {
  if (!assessment?.assessmentDate || assessment.status === 'einspruch-eingelegt') return null
  const deadlineEnd = appealDeadlineEnd(assessment.assessmentDate)
  const homeOfficeDays = homeOfficeDaysFromInterview(answers)
  if (deadlineEnd < today || !homeOfficeDays) return null
  return {
    taxYear: assessment.taxYear,
    assessmentDate: formatGermanDate(assessment.assessmentDate),
    appealPossibleUntil: formatGermanDate(deadlineEnd),
    homeOfficeDays,
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
      enabled: row?.enabled ?? false,
      enabledAt: row?.enabledAt ? row.enabledAt.toISOString() : null,
    }
  }

  async setSetting(userId: string, enabled: boolean): Promise<OwlSettingResponseDto> {
    const row = await this.settingRepo.setEnabled(userId, enabled)
    return {
      enabled: row.enabled,
      enabledAt: row.enabledAt ? row.enabledAt.toISOString() : null,
    }
  }

  async getCards(userId: string, taxYear: number, today = todayInBerlin()): Promise<OwlCardsResponseDto> {
    const setting = await this.settingRepo.findByUserId(userId)
    const enabled = setting?.enabled ?? false
    if (!enabled) {
      return {
        enabled: false,
        cards: [],
        legalStatus: LEGAL_STATUS_DATE,
      }
    }

    const [kinder, dismissedItems, interviewRows, lastYearInterviewRows, lastYearAssessment] = await Promise.all([
      this.childrenRepo.listForUserAndYear(userId, taxYear),
      this.dismissalRepo.listForUserAndYear(userId, taxYear),
      this.interviewRepo.findAllForUserAndYear(userId, taxYear),
      this.interviewRepo.findAllForUserAndYear(userId, taxYear - 1),
      this.assessmentRepo.findForUserAndYear(userId, taxYear - 1),
    ])

    const answers = toAnswerMap(interviewRows)
    const lastYearAnswers = toAnswerMap(lastYearInterviewRows)
    const lastYearDonationsEur = answers['spenden-betrag'] ? null : integer(lastYearAnswers['spenden-betrag'])
    const archive = archiveYear(lastYearAssessment, lastYearAnswers, today)

    const input: OwlInputFacts = {
      taxYear,
      hasTraining: answers['fortbildung'] === 'Ja',
      profession: professionFrom(answers['beruf']),
      homeOfficeDays: homeOfficeDaysFromInterview(answers),
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
      enabled: true,
      cards,
      legalStatus: LEGAL_STATUS_DATE,
    }
  }

  async dismissCard(userId: string, taxYear: number, fingerprint: string): Promise<void> {
    await this.dismissalRepo.dismiss(userId, taxYear, fingerprint)
  }
}
