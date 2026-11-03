import { Inject, Injectable } from '@nestjs/common'
import {
  einspruchsfristEnde,
  generiereEulenKarten,
  RECHTSSTAND_DATUM,
  type EulenArchivJahr,
  type EulenEingabeFakten,
  type KiPort,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { BELEG_REPOSITORY, type BelegRepository } from '../beleg/beleg.repository.js'
import { BESCHEID_REPOSITORY, type BescheidRepository } from '../bescheid/bescheid.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { KI_PORT, pruefePiiFreiheit } from '../ki/ki.adapter.js'
import { KIND_REPOSITORY, type KindRepository } from '../kinder/kind.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { datumFuerVordruck } from '../ausdruck/ausdruck-werte.js'
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

function berechneHomeofficeTage(answers: Record<string, string>): number | null {
  const ho = answers['homeoffice']
  if (!ho || ho === 'Nie') return null
  const arbeitstage = answers['tage'] && /^\d+$/.test(answers['tage']) ? Number(answers['tage']) : 220
  if (ho === 'Fast immer') return Math.min(arbeitstage, 210)
  if (ho === '1–2 Tage pro Woche') return Math.min(Math.round(arbeitstage * 0.3), 210)
  if (/^\d+$/.test(ho)) return Math.min(Number(ho), 210)
  return null
}

@Injectable()
export class EulenModusService {
  constructor(
    @Inject(EULEN_EINSTELLUNG_REPOSITORY) private readonly einstellungRepo: EulenEinstellungRepository,
    @Inject(EULEN_KARTEN_VERWURF_REPOSITORY) private readonly verwurfRepo: EulenKartenVerwurfRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepo: LstbRepository,
    @Inject(BELEG_REPOSITORY) private readonly belegRepo: BelegRepository,
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

  async getKarten(userId: string, steuerjahr: number): Promise<EulenKartenResponseDto> {
    const einstellung = await this.einstellungRepo.findByUserId(userId)
    const aktiviert = einstellung?.aktiviert ?? false
    if (!aktiviert) {
      return {
        aktiviert: false,
        karten: [],
        rechtsstand: RECHTSSTAND_DATUM,
      }
    }

    const [lstb, belege, kinder, verworfene, interviewRows, vorjahrInterviewRows, vorjahrBescheid] = await Promise.all([
      this.lstbRepo.findForUserAndYear(userId, steuerjahr),
      this.belegRepo.findAllForUser(userId),
      this.kinderRepo.listForUserAndYear(userId, steuerjahr),
      this.verwurfRepo.listForUserAndYear(userId, steuerjahr),
      this.interviewRepo.findAllForUserAndYear(userId, steuerjahr),
      this.interviewRepo.findAllForUserAndYear(userId, steuerjahr - 1),
      this.bescheidRepo.findForUserAndYear(userId, steuerjahr - 1),
    ])

    const answers = toAnswerMap(interviewRows)
    const vorjahrAnswers = toAnswerMap(vorjahrInterviewRows)
    const belegeArten = belege
      .filter((b) => b.steuerjahr === null || b.steuerjahr === steuerjahr)
      .map((b) => b.art)
      .filter(Boolean) as string[]

    const hatFortbildung =
      answers['fortbildung'] === 'Ja' ||
      belegeArten.some((art) => art.toLowerCase().includes('fortbildung'))
    const fahrtkostenEur =
      answers['weg'] && /^\d+$/.test(answers['weg']) && Number(answers['weg']) > 0
        ? Number(answers['weg'])
        : 0

    const vorjahrSpendenRaw = vorjahrAnswers['spenden-betrag']
    const aktuelleSpendenRaw = answers['spenden-betrag']
    const vorjahrSpendenEur =
      vorjahrSpendenRaw && /^\d+$/.test(vorjahrSpendenRaw) && !aktuelleSpendenRaw
        ? Number(vorjahrSpendenRaw)
        : null

    const archivJahre: EulenArchivJahr[] = []
    if (vorjahrBescheid?.bescheiddatum && vorjahrBescheid.status !== 'einspruch-eingelegt') {
      const fristIso = einspruchsfristEnde(vorjahrBescheid.bescheiddatum)
      const vorjahrHo = berechneHomeofficeTage(vorjahrAnswers)
      if (fristIso && vorjahrHo !== null && vorjahrHo > 0) {
        archivJahre.push({
          steuerjahr: steuerjahr - 1,
          bescheidDatum: datumFuerVordruck(vorjahrBescheid.bescheiddatum),
          einspruchMoeglichBis: datumFuerVordruck(fristIso),
          hatHomeofficeOhnePauschale: true,
        })
      }
    }

    // PII-free domain parameters passed to core generator (ADR-0051 § 1)
    const eingabe: EulenEingabeFakten = {
      steuerjahr,
      bruttoarbeitslohnEur:
        lstb?.bruttoarbeitslohn && /^\d+$/.test(lstb.bruttoarbeitslohn) ? Number(lstb.bruttoarbeitslohn) : null,
      fortbildungskostenEur: hatFortbildung ? 100 : null,
      fahrtkostenEur,
      homeofficeTage: berechneHomeofficeTage(answers),
      vorjahrFakten: vorjahrSpendenEur !== null ? { spendenEur: vorjahrSpendenEur } : null,
      bekannteBelegeArten: belegeArten,
      hatKinderErfasst: kinder.length > 0,
      archivJahre,
      verworfeneFingerprints: verworfene,
    }

    pruefePiiFreiheit(eingabe)
    const roheKarten = generiereEulenKarten(eingabe)
    const karten = await Promise.all(
      roheKarten.map(async (karte) => ({
        ...karte,
        quelleUebersetzt: await this.kiPort.erklaereQuelle(karte.quelleUebersetzt),
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
