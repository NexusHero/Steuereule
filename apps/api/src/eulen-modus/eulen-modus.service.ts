import { Inject, Injectable } from '@nestjs/common'
import {
  formatGermanDate,
  appealDeadlineEnd,
  generateOwlCards,
  homeofficeTageAusInterview,
  RECHTSSTAND_DATUM,
  type OwlArchiveYear,
  type OwlInputFacts,
  type KiPort,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from '../bescheid/bescheid.repository.js'
import { heuteInBerlin } from '../fristen/fristen.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { KI_PORT, pruefePiiFreiheit } from '../ki/ki.adapter.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../kinder/kind.repository.js'
import {
  OWL_SETTING_REPOSITORY,
  OWL_CARD_DISMISSAL_REPOSITORY,
  type OwlSettingRepository,
  type OwlCardDismissalRepository,
} from './eulen-modus.repository.js'
import type { EulenEinstellungResponseDto, EulenKartenResponseDto } from './dto/eulen-modus.dto.js'

function toAnswerMap(rows: InterviewAnswerRecord[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) map[row.questionId] = row.value
  return map
}

function ganzzahl(wert: string | undefined): number | null {
  return wert && /^\d+$/.test(wert) ? Number(wert) : null
}

function archivJahr(
  bescheid: AssessmentRecord | null,
  antworten: Record<string, string>,
  heute: string,
): OwlArchiveYear | null {
  if (!bescheid?.bescheiddatum || bescheid.status === 'einspruch-eingelegt') return null
  const fristEnde = appealDeadlineEnd(bescheid.bescheiddatum)
  const homeofficeTage = homeofficeTageAusInterview(antworten)
  if (fristEnde < heute || !homeofficeTage) return null
  return {
    steuerjahr: bescheid.steuerjahr,
    bescheidDatum: formatGermanDate(bescheid.bescheiddatum),
    einspruchMoeglichBis: formatGermanDate(fristEnde),
    homeofficeTage,
  }
}

@Injectable()
export class OwlModeService {
  constructor(
    @Inject(OWL_SETTING_REPOSITORY) private readonly einstellungRepo: OwlSettingRepository,
    @Inject(OWL_CARD_DISMISSAL_REPOSITORY) private readonly verwurfRepo: OwlCardDismissalRepository,
    @Inject(CHILD_REPOSITORY) private readonly kinderRepo: ChildRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepo: InterviewAnswerRepository,
    @Inject(ASSESSMENT_REPOSITORY) private readonly bescheidRepo: AssessmentRepository,
    @Inject(KI_PORT) private readonly kiPort: KiPort,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getEinstellung(userId: string): Promise<EulenEinstellungResponseDto> {
    const row = await this.einstellungRepo.findByUserId(userId)
    await this.auditService.append({ userId, action: 'READ', resource: 'eulen_einstellung' })
    return {
      aktiviert: row?.aktiviert ?? false,
      aktiviertAm: row?.aktiviertAm ? row.aktiviertAm.toISOString() : null,
    }
  }

  async setEinstellung(userId: string, aktiviert: boolean): Promise<EulenEinstellungResponseDto> {
    const row = await this.einstellungRepo.setAktiviert(userId, aktiviert)
    return {
      aktiviert: row.aktiviert,
      aktiviertAm: row.aktiviertAm ? row.aktiviertAm.toISOString() : null,
    }
  }

  async getKarten(userId: string, steuerjahr: number, heute = heuteInBerlin()): Promise<EulenKartenResponseDto> {
    const einstellung = await this.einstellungRepo.findByUserId(userId)
    const aktiviert = einstellung?.aktiviert ?? false
    if (!aktiviert) {
      return {
        aktiviert: false,
        karten: [],
        rechtsstand: RECHTSSTAND_DATUM,
      }
    }

    const [kinder, verworfene, interviewRows, vorjahrInterviewRows, vorjahrBescheid] = await Promise.all([
      this.kinderRepo.listForUserAndYear(userId, steuerjahr),
      this.verwurfRepo.listForUserAndYear(userId, steuerjahr),
      this.interviewRepo.findAllForUserAndYear(userId, steuerjahr),
      this.interviewRepo.findAllForUserAndYear(userId, steuerjahr - 1),
      this.bescheidRepo.findForUserAndYear(userId, steuerjahr - 1),
    ])

    const answers = toAnswerMap(interviewRows)
    const vorjahrAnswers = toAnswerMap(vorjahrInterviewRows)
    const vorjahrSpendenEur = answers['spenden-betrag'] ? null : ganzzahl(vorjahrAnswers['spenden-betrag'])
    const archiv = archivJahr(vorjahrBescheid, vorjahrAnswers, heute)

    const eingabe: OwlInputFacts = {
      steuerjahr,
      hatFortbildung: answers['fortbildung'] === 'Ja',
      homeofficeTage: homeofficeTageAusInterview(answers),
      vorjahrFakten: vorjahrSpendenEur !== null ? { spendenEur: vorjahrSpendenEur } : null,
      kinderLautInterview: answers['kinder'] !== undefined && answers['kinder'] !== 'Nein',
      hatKinderErfasst: kinder.length > 0,
      archivJahre: archiv ? [archiv] : [],
      verworfeneFingerprints: verworfene,
    }

    pruefePiiFreiheit(eingabe)
    const roheKarten = generateOwlCards(eingabe)
    const karten = await Promise.all(
      roheKarten.map(async ({ quelleId, ...karte }) => ({
        ...karte,
        quelleUebersetzt: await this.kiPort.erklaereQuelle(quelleId),
      })),
    )
    await this.auditService.append({ userId, action: 'READ', resource: 'eulen_karten' })

    return {
      aktiviert: true,
      karten,
      rechtsstand: RECHTSSTAND_DATUM,
    }
  }

  async verwerfeKarte(userId: string, steuerjahr: number, fingerprint: string): Promise<void> {
    await this.verwurfRepo.verwerfe(userId, steuerjahr, fingerprint)
  }
}
