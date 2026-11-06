import { Inject, Injectable, Optional } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { calculateDifferentialChildBenefit, isValidChildBirthDate, calculateChildrenStatus, type ChildData } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../kopplung/kopplung.repository.js'
import { CHILD_REPOSITORY, type ChildRecord, type ChildRepository } from './kind.repository.js'
import type { CreateChildDto, KinderResponseDto, ChildResponseDto, UpdateChildDto } from './dto/kind.dto.js'

function toChildData(r: ChildRecord, effectiveSwissEur: number | null): ChildData {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    birthDate: r.geburtsdatum,
    taxId: r.taxId,
    childBenefit: r.childBenefitClaimEur ? Number(r.childBenefitClaimEur) : null,
    swissFamilyAllowanceEur: effectiveSwissEur,
  }
}

function toDto(r: ChildRecord, effectiveSwissEur: number | null, year: number): ChildResponseDto {
  const diff = effectiveSwissEur != null ? calculateDifferentialChildBenefit(r.geburtsdatum, year, effectiveSwissEur) : null
  return {
    id: r.id,
    sequenceNumber: r.sequenceNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    geburtsdatum: r.geburtsdatum,
    taxId: r.taxId,
    childBenefitClaimEur: r.childBenefitClaimEur,
    kinship: r.kinship,
    kinshipB: r.kinshipB,
    familyBenefitsOffice: r.familyBenefitsOffice,
    domesticResidenceAllYear: r.domesticResidenceAllYear,
    otherParent: r.otherParent,
    otherParentName: r.otherParentName,
    otherParentBirthDate: r.otherParentBirthDate,
    otherParentAddress: r.otherParentAddress,
    otherParentKind: r.otherParentKind,
    otherParentDiedOn: r.otherParentDiedOn,
    registeredWithMeAllYear: r.registeredWithMeAllYear,
    childBenefitToMeAllYear: r.childBenefitToMeAllYear,
    healthBasicEur: r.healthBasicEur,
    careEur: r.careEur,
    swissFamilyAllowanceEur: effectiveSwissEur != null ? String(effectiveSwissEur) : null,
    differentialChildBenefitEur: diff != null ? String(diff.differentialChildBenefit) : null,
    totalClaimEur: diff != null ? String(diff.totalClaim) : null,
  }
}

@Injectable()
export class ChildrenService {
  constructor(
    @Inject(CHILD_REPOSITORY) private readonly repository: ChildRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chSalaryCertificate?: CrossBorderSalaryStatementRepository,
    @Optional() @Inject(PARTNER_COUPLING_REPOSITORY) private readonly link?: PartnerCouplingRepository,
  ) {}

  private async getPerChildSwissAllowanceEur(userId: string, year: number, count: number): Promise<number | null> {
    if (!this.chSalaryCertificate || count <= 0) return null
    let chRecord = await this.chSalaryCertificate.findForUserAndYear(userId, year)
    if ((!chRecord?.nGre.familienzulagenChf || Number(chRecord.nGre.familienzulagenChf) <= 0) && this.link) {
      const k = await this.link.findByUserAndYear(userId, year)
      if (k?.filingType === 'zusammen' && k.personBUserId) {
        const spouseCh = await this.chSalaryCertificate.findForUserAndYear(k.personBUserId, year)
        if (spouseCh?.nGre.familienzulagenChf && Number(spouseCh.nGre.familienzulagenChf) > 0) {
          chRecord = spouseCh
        }
      }
    }
    const allowancesChf = chRecord?.nGre.familienzulagenChf
    if (!allowancesChf || Number(allowancesChf) <= 0) return null
    const rate = chRecord?.exchangeRateValue ?? 1.0
    const perChildChf = Math.round(Number(allowancesChf) / count)
    return Math.round(perChildChf * rate)
  }

  private async toResponse(userId: string, records: ChildRecord[], year: number): Promise<KinderResponseDto> {
    const perChildEur = await this.getPerChildSwissAllowanceEur(userId, year, records.length)
    const data = records.map((r) => {
      const effectiveSwissEur = r.swissFamilyAllowanceEur ? Number(r.swissFamilyAllowanceEur) : perChildEur
      return toChildData(r, effectiveSwissEur)
    })
    const status = calculateChildrenStatus(data, year)
    return {
      kinder: records.map((r) => {
        const effectiveSwissEur = r.swissFamilyAllowanceEur ? Number(r.swissFamilyAllowanceEur) : perChildEur
        return toDto(r, effectiveSwissEur, year)
      }),
      count: status.count,
      childBenefitSum: status.childBenefitSum,
      totalAllowance: status.totalAllowance,
      swissFamilyAllowanceSum: status.swissFamilyAllowanceSum,
      differentialChildBenefitSum: status.differentialChildBenefitSum,
    }
  }

  async list(userId: string, taxYear: number): Promise<KinderResponseDto> {
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    if (records.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'kind' })
    }
    return this.toResponse(userId, records, taxYear)
  }

  async create(userId: string, taxYear: number, dto: CreateChildDto): Promise<KinderResponseDto> {
    if (!isValidChildBirthDate(dto.geburtsdatum, taxYear)) {
      throw new InvalidInputError('GEBURTSDATUM_INVALID', 'The birth date is not valid for this tax year.')
    }
    await this.repository.create(userId, taxYear, dto)
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    return this.toResponse(userId, records, taxYear)
  }

  async update(userId: string, taxYear: number, id: string, dto: UpdateChildDto): Promise<KinderResponseDto> {
    if (dto.geburtsdatum && !isValidChildBirthDate(dto.geburtsdatum, taxYear)) {
      throw new InvalidInputError('GEBURTSDATUM_INVALID', 'The birth date is not valid for this tax year.')
    }
    const updated = await this.repository.update(userId, taxYear, id, dto)
    if (!updated) {
      throw new NotFoundError('KIND_NOT_FOUND', `Kind "${id}" does not exist for this account.`)
    }
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    return this.toResponse(userId, records, taxYear)
  }

  async delete(userId: string, taxYear: number, id: string): Promise<KinderResponseDto> {
    const deleted = await this.repository.delete(userId, taxYear, id)
    if (!deleted) {
      throw new NotFoundError('KIND_NOT_FOUND', `Kind "${id}" does not exist for this account.`)
    }
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    return this.toResponse(userId, records, taxYear)
  }
}
