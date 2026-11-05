import { Inject, Injectable } from '@nestjs/common'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
import {
  BESCHEID_FELDER,
  employeeFromData,
  bescheidBerechnungsstand,
  deserializeAssessmentField,
  deserializeWageTaxCertificateField,
  appealDeadlineEnd,
  gatedIncomeTypes,
  reconcileAssessment,
  grenzgaengerStand,
  istBescheidUebergangErlaubt,
  isAppealReason,
  isValidAssessmentAmount,
  naechsteBescheidZustaende,
  serializeAssessmentField,
  remainingAppealDays,
  type Berechnungsstand,
  type BescheidStatus,
  type AssessmentValues,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from './bescheid.repository.js'
import type { AssessmentFieldDto, PutAssessmentFieldDto } from './dto/bescheid-feld.dto.js'
import type {
  BescheidAbweichungDto,
  AssessmentResponseDto,
  SetAssessmentDateDto,
  SetBescheidStatusDto,
  SetAppealDto,
} from './dto/bescheid-response.dto.js'
import { answersFrom } from '../interview/answers.js'
import { grenzgaengerStatusAusAnswers, lohnausweisWerteAusRecord, wechselkursAusRecord } from '../ch-lohnausweis/lohnausweis-daten.js'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function felderAusRecord(record: AssessmentRecord | null): { felder: AssessmentFieldDto[]; werte: AssessmentValues } {
  const felder: AssessmentFieldDto[] = []
  const werte: AssessmentValues = {}
  for (const feld of BESCHEID_FELDER) {
    const stored = record === null ? null : record.felder[feld.id]
    const wert = deserializeAssessmentField(feld.id, stored)
    if (wert === null) {
      felder.push({ id: feld.id, kind: 'offen' })
    } else if (wert === 'unklar') {
      felder.push({ id: feld.id, kind: 'unklar' })
    } else {
      felder.push({ id: feld.id, kind: 'erfasst', wert })
      werte[feld.id] = wert
    }
  }
  return { felder, werte }
}




/** Application logic for the Steuerbescheid. */
@Injectable()
export class AssessmentService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY) private readonly repository: AssessmentRepository,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepository: WageTaxCertificateRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chLohnausweisRepository: CrossBorderSalaryStatementRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async berechnungsstand(userId: string, steuerjahr: number): Promise<Berechnungsstand> {
    const [lstbRecord, interviewRows, chRecord] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
      this.chLohnausweisRepository.findForUserAndYear(userId, steuerjahr),
    ])
    const answers = answersFrom(interviewRows)

    const angestellte = employeeFromData(
      {
        bruttoarbeitslohn: deserializeWageTaxCertificateField(lstbRecord?.bruttoarbeitslohn ?? null),
        lohnsteuer: deserializeWageTaxCertificateField(lstbRecord?.lohnsteuer ?? null),
        sozialversicherung: deserializeWageTaxCertificateField(lstbRecord?.sozialversicherung ?? null),
      },
      answers,
    )

    const wechselkurs = wechselkursAusRecord(chRecord)
    const status = grenzgaengerStatusAusAnswers(answers)
    const saeule3aChf = chRecord === null || chRecord.saeule3aChf === null ? undefined : Number(chRecord.saeule3aChf)
    const krankenkasseChf = chRecord === null || chRecord.krankenkasseChf === null ? undefined : Number(chRecord.krankenkasseChf)

    let ch: Berechnungsstand | null = null
    if (wechselkurs !== null && status !== null) {
      ch = grenzgaengerStand({
        lohnausweis: lohnausweisWerteAusRecord(chRecord),
        ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
        ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
        status,
        wechselkurs,
        gegated: gatedIncomeTypes(answers),
      })
    }

    return bescheidBerechnungsstand(angestellte, ch)
  }

  private async toResponse(userId: string, steuerjahr: number, record: AssessmentRecord | null): Promise<AssessmentResponseDto> {
    const { felder, werte } = felderAusRecord(record)
    const status: BescheidStatus = record?.status ?? 'eingegangen'
    const bescheiddatum = record?.bescheiddatum ?? null
    const einspruchGrund = record?.einspruchGrund ?? null

    const stand = await this.berechnungsstand(userId, steuerjahr)
    const abgleich = reconcileAssessment(werte, stand)

    const fristEnde = bescheiddatum === null ? null : appealDeadlineEnd(bescheiddatum)
    const verbleibendeTage =
      fristEnde === null ? null : remainingAppealDays(bescheiddatum as string, heuteIso())

    return {
      status,
      bescheiddatum,
      einspruchGrund,
      felder,
      abgleich: {
        abweichungen: abgleich.abweichungen.map((a): BescheidAbweichungDto => ({ ...a })),
        berechnungUnvollstaendig: abgleich.berechnungUnvollstaendig,
      },
      frist: { bescheiddatum, fristEnde, verbleibendeTage },
      naechsteZustaende: [...naechsteBescheidZustaende(status)],
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<AssessmentResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'bescheid' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(
    userId: string,
    steuerjahr: number,
    feld: Parameters<AssessmentRepository['setFeld']>[2],
    dto: PutAssessmentFieldDto,
  ): Promise<AssessmentResponseDto> {
    const record = await this.repository.setFeld(userId, steuerjahr, feld, wertAusDto(feld, dto))
    return this.toResponse(userId, steuerjahr, record)
  }

  async setDatum(userId: string, steuerjahr: number, dto: SetAssessmentDateDto): Promise<AssessmentResponseDto> {
    if (dto.datum !== null && dto.datum !== undefined && !ISO_DATE_RE.test(dto.datum)) {
      throw new InvalidInputError('BESCHEIDDATUM_INVALID', 'bescheiddatum must be an ISO yyyy-mm-dd date.')
    }
    const record = await this.repository.setDatum(userId, steuerjahr, dto.datum ?? null)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setStatus(userId: string, steuerjahr: number, dto: SetBescheidStatusDto): Promise<AssessmentResponseDto> {
    const current = await this.repository.findForUserAndYear(userId, steuerjahr)
    const von: BescheidStatus = current?.status ?? 'eingegangen'
    const nach = dto.status as BescheidStatus
    if (!istBescheidUebergangErlaubt(von, nach)) {
      throw new ConflictError('BESCHEID_TRANSITION_ILLEGAL', `illegal Bescheid transition "${von}" → "${nach}"`)
    }
    const record = await this.repository.setStatus(userId, steuerjahr, nach)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setEinspruch(userId: string, steuerjahr: number, dto: SetAppealDto): Promise<AssessmentResponseDto> {
    if (!isAppealReason(dto.grund)) {
      throw new InvalidInputError('EINSPRUCH_GRUND_UNKNOWN', `unknown Einspruch-Grund "${dto.grund}"`)
    }
    const current = await this.repository.findForUserAndYear(userId, steuerjahr)
    const von: BescheidStatus = current?.status ?? 'eingegangen'
    if (!istBescheidUebergangErlaubt(von, 'einspruch-eingelegt')) {
      throw new ConflictError('BESCHEID_TRANSITION_ILLEGAL', `illegal Bescheid transition "${von}" → "einspruch-eingelegt"`)
    }
    const record = await this.repository.setEinspruch(userId, steuerjahr, dto.grund)
    return this.toResponse(userId, steuerjahr, record)
  }
}

function wertAusDto(feld: Parameters<AssessmentRepository['setFeld']>[2], dto: PutAssessmentFieldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  if (dto.wert === undefined || !isValidAssessmentAmount(feld, dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `kind "erfasst" requires a valid whole-euro \`wert\` for "${feld}".`)
  }
  return serializeAssessmentField(feld, dto.wert)
}

export function heuteIso(jetzt: Date = new Date()): string {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(jetzt)
  const jahr = teile.find((p) => p.type === 'year')!.value
  const monat = teile.find((p) => p.type === 'month')!.value
  const tag = teile.find((p) => p.type === 'day')!.value
  return `${jahr}-${monat}-${tag}`
}
