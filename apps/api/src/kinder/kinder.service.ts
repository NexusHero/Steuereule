import { Inject, Injectable, Optional } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { calculateDifferentialChildBenefit, isValidChildBirthDate, calculateChildrenStatus, type KindDaten } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../kopplung/kopplung.repository.js'
import { CHILD_REPOSITORY, type ChildRecord, type ChildRepository } from './kind.repository.js'
import type { CreateKindDto, KinderResponseDto, KindResponseDto, UpdateKindDto } from './dto/kind.dto.js'

function toKindDaten(r: ChildRecord, effectiveSwissEur: number | null): KindDaten {
  return {
    id: r.id,
    vorname: r.vorname,
    nachname: r.nachname,
    geburtsdatum: r.geburtsdatum,
    steuerId: r.idnr,
    kindergeld: r.kindergeldAnspruchEur ? Number(r.kindergeldAnspruchEur) : null,
    schweizerKinderzulageEur: effectiveSwissEur,
  }
}

function toDto(r: ChildRecord, effectiveSwissEur: number | null, jahr: number): KindResponseDto {
  const diff = effectiveSwissEur != null ? calculateDifferentialChildBenefit(r.geburtsdatum, jahr, effectiveSwissEur) : null
  return {
    id: r.id,
    lfdNr: r.lfdNr,
    vorname: r.vorname,
    nachname: r.nachname,
    geburtsdatum: r.geburtsdatum,
    idnr: r.idnr,
    kindergeldAnspruchEur: r.kindergeldAnspruchEur,
    kindschaftsverhaeltnis: r.kindschaftsverhaeltnis,
    kindschaftsverhaeltnisB: r.kindschaftsverhaeltnisB,
    familienkasse: r.familienkasse,
    wohnsitzInlandGanzjaehrig: r.wohnsitzInlandGanzjaehrig,
    andererElternteil: r.andererElternteil,
    andererElternteilName: r.andererElternteilName,
    andererElternteilGeburtsdatum: r.andererElternteilGeburtsdatum,
    andererElternteilAdresse: r.andererElternteilAdresse,
    andererElternteilArt: r.andererElternteilArt,
    andererElternteilVerstorbenAm: r.andererElternteilVerstorbenAm,
    gemeldetBeiMirGanzjaehrig: r.gemeldetBeiMirGanzjaehrig,
    kindergeldAnMichGanzjaehrig: r.kindergeldAnMichGanzjaehrig,
    kvBasisEur: r.kvBasisEur,
    pvEur: r.pvEur,
    schweizerKinderzulageEur: effectiveSwissEur != null ? String(effectiveSwissEur) : null,
    differenzkindergeldEur: diff != null ? String(diff.differentialChildBenefit) : null,
    gesamtanspruchEur: diff != null ? String(diff.totalClaim) : null,
  }
}

@Injectable()
export class ChildrenService {
  constructor(
    @Inject(CHILD_REPOSITORY) private readonly repository: ChildRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chLohnausweis?: CrossBorderSalaryStatementRepository,
    @Optional() @Inject(PARTNER_COUPLING_REPOSITORY) private readonly kopplung?: PartnerCouplingRepository,
  ) {}

  private async getProKindSwissAllowanceEur(userId: string, jahr: number, count: number): Promise<number | null> {
    if (!this.chLohnausweis || count <= 0) return null
    let chRecord = await this.chLohnausweis.findForUserAndYear(userId, jahr)
    if ((!chRecord?.nGre.familienzulagenChf || Number(chRecord.nGre.familienzulagenChf) <= 0) && this.kopplung) {
      const k = await this.kopplung.findByUserAndYear(userId, jahr)
      if (k?.veranlagungsart === 'zusammen' && k.personBUserId) {
        const spouseCh = await this.chLohnausweis.findForUserAndYear(k.personBUserId, jahr)
        if (spouseCh?.nGre.familienzulagenChf && Number(spouseCh.nGre.familienzulagenChf) > 0) {
          chRecord = spouseCh
        }
      }
    }
    const zulagenChf = chRecord?.nGre.familienzulagenChf
    if (!zulagenChf || Number(zulagenChf) <= 0) return null
    const kurs = chRecord?.wechselkursKurs ?? 1.0
    const proKindChf = Math.round(Number(zulagenChf) / count)
    return Math.round(proKindChf * kurs)
  }

  private async toResponse(userId: string, records: ChildRecord[], jahr: number): Promise<KinderResponseDto> {
    const proKindEur = await this.getProKindSwissAllowanceEur(userId, jahr, records.length)
    const daten = records.map((r) => {
      const effectiveSwissEur = r.schweizerKinderzulageEur ? Number(r.schweizerKinderzulageEur) : proKindEur
      return toKindDaten(r, effectiveSwissEur)
    })
    const stand = calculateChildrenStatus(daten, jahr)
    return {
      kinder: records.map((r) => {
        const effectiveSwissEur = r.schweizerKinderzulageEur ? Number(r.schweizerKinderzulageEur) : proKindEur
        return toDto(r, effectiveSwissEur, jahr)
      }),
      anzahl: stand.anzahl,
      kindergeldSumme: stand.kindergeldSumme,
      freibetragGesamt: stand.freibetragGesamt,
      schweizerKinderzulageSumme: stand.schweizerKinderzulageSumme,
      differenzkindergeldSumme: stand.differenzkindergeldSumme,
    }
  }

  async list(userId: string, steuerjahr: number): Promise<KinderResponseDto> {
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    if (records.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'kind' })
    }
    return this.toResponse(userId, records, steuerjahr)
  }

  async create(userId: string, steuerjahr: number, dto: CreateKindDto): Promise<KinderResponseDto> {
    if (!isValidChildBirthDate(dto.geburtsdatum, steuerjahr)) {
      throw new InvalidInputError('GEBURTSDATUM_INVALID', 'The birth date is not valid for this tax year.')
    }
    await this.repository.create(userId, steuerjahr, dto)
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, records, steuerjahr)
  }

  async update(userId: string, steuerjahr: number, id: string, dto: UpdateKindDto): Promise<KinderResponseDto> {
    if (dto.geburtsdatum && !isValidChildBirthDate(dto.geburtsdatum, steuerjahr)) {
      throw new InvalidInputError('GEBURTSDATUM_INVALID', 'The birth date is not valid for this tax year.')
    }
    const updated = await this.repository.update(userId, steuerjahr, id, dto)
    if (!updated) {
      throw new NotFoundError('KIND_NOT_FOUND', `Kind "${id}" does not exist for this account.`)
    }
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, records, steuerjahr)
  }

  async delete(userId: string, steuerjahr: number, id: string): Promise<KinderResponseDto> {
    const deleted = await this.repository.delete(userId, steuerjahr, id)
    if (!deleted) {
      throw new NotFoundError('KIND_NOT_FOUND', `Kind "${id}" does not exist for this account.`)
    }
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, records, steuerjahr)
  }
}
