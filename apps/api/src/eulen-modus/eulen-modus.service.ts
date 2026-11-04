import { Inject, Injectable } from '@nestjs/common'
import {
  deutschesDatum,
  einspruchsfristEnde,
  generiereEulenKarten,
  homeofficeTageAusInterview,
  RECHTSSTAND_DATUM,
  type EulenArchivJahr,
  type EulenEingabeFakten,
  type KiPort,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { BESCHEID_REPOSITORY, type BescheidRecord, type BescheidRepository } from '../bescheid/bescheid.repository.js'
import { heuteInBerlin } from '../fristen/fristen.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { KI_PORT, pruefePiiFreiheit } from '../ki/ki.adapter.js'
import { KIND_REPOSITORY, type KindRepository } from '../kinder/kind.repository.js'
import {
  EULEN_EINSTELLUNG_REPOSITORY,
  EULEN_KARTEN_VERWURF_REPOSITORY,
  type EulenEinstellungRepository,
  type EulenKartenVerwurfRepository,
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
  bescheid: BescheidRecord | null,
  antworten: Record<string, string>,
  heute: string,
): EulenArchivJahr | null {
  if (!bescheid?.bescheiddatum || bescheid.status === 'einspruch-eingelegt') return null
  const fristEnde = einspruchsfristEnde(bescheid.bescheiddatum)
  const homeofficeTage = homeofficeTageAusInterview(antworten)
  if (fristEnde < heute || !homeofficeTage) return null
  return {
    steuerjahr: bescheid.steuerjahr,
    bescheidDatum: deutschesDatum(bescheid.bescheiddatum),
    einspruchMoeglichBis: deutschesDatum(fristEnde),
    homeofficeTage,
  }
}

@Injectable()
export class EulenModusService {
  constructor(
    @Inject(EULEN_EINSTELLUNG_REPOSITORY) private readonly einstellungRepo: EulenEinstellungRepository,
    @Inject(EULEN_KARTEN_VERWURF_REPOSITORY) private readonly verwurfRepo: EulenKartenVerwurfRepository,
    @Inject(KIND_REPOSITORY) private readonly kinderRepo: KindRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepo: InterviewAnswerRepository,
    @Inject(BESCHEID_REPOSITORY) private readonly bescheidRepo: BescheidRepository,
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

    const eingabe: EulenEingabeFakten = {
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
    const roheKarten = generiereEulenKarten(eingabe)
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
