import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ChildDetails, ChildRecord, ChildRepository } from './child.repository.js'

function toRecord(row: {
  id: string
  userId: string
  taxYear: number
  sequenceNumber: number
  firstName: string
  lastName: string
  geburtsdatum: string
  taxId: string | null
  childBenefitClaimEur: string | null
} & Omit<ChildDetails, 'swissFamilyAllowancePayer'> & { swissFamilyAllowancePayer?: string | null }): ChildRecord {
  return {
    id: row.id,
    userId: row.userId,
    taxYear: row.taxYear,
    sequenceNumber: row.sequenceNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    geburtsdatum: row.geburtsdatum,
    taxId: row.taxId,
    childBenefitClaimEur: row.childBenefitClaimEur,
    kinship: row.kinship,
    kinshipB: row.kinshipB,
    familyBenefitsOffice: row.familyBenefitsOffice,
    domesticResidenceAllYear: row.domesticResidenceAllYear,
    otherParent: row.otherParent,
    otherParentName: row.otherParentName,
    otherParentBirthDate: row.otherParentBirthDate,
    otherParentAddress: row.otherParentAddress,
    otherParentKind: row.otherParentKind,
    otherParentDiedOn: row.otherParentDiedOn,
    registeredWithMeAllYear: row.registeredWithMeAllYear,
    childBenefitToMeAllYear: row.childBenefitToMeAllYear,
    healthBasicEur: row.healthBasicEur,
    careEur: row.careEur,
    swissFamilyAllowanceEur: row.swissFamilyAllowanceEur,
    childcareEur: row.childcareEur ?? null,
    childcareProvider: row.childcareProvider ?? null,
    childcareFrom: row.childcareFrom ?? null,
    childcareTo: row.childcareTo ?? null,
    swissFamilyAllowancePayer: row.swissFamilyAllowancePayer === 'A' || row.swissFamilyAllowancePayer === 'B' ? row.swissFamilyAllowancePayer : null,
  }
}

@Injectable()
export class PrismaChildRepository implements ChildRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, taxYear: number): Promise<ChildRecord[]> {
    const rows = await this.prisma.child.findMany({
      where: { userId, taxYear },
      orderBy: { sequenceNumber: 'asc' },
    })
    return rows.map(toRecord)
  }

  async listAllForUser(userId: string): Promise<ChildRecord[]> {
    const rows = await this.prisma.child.findMany({
      where: { userId },
      orderBy: [{ taxYear: 'asc' }, { sequenceNumber: 'asc' }],
    })
    return rows.map(toRecord)
  }

  async create(
    userId: string,
    taxYear: number,
    data: {
      firstName: string
      lastName: string
      geburtsdatum: string
      taxId?: string | null
      childBenefitClaimEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord> {
    const count = await this.prisma.child.count({ where: { userId, taxYear } })
    const [row] = await this.prisma.$transaction([
      this.prisma.child.create({
        data: {
          userId,
          taxYear,
          sequenceNumber: count + 1,
          firstName: data.firstName,
          lastName: data.lastName,
          geburtsdatum: data.geburtsdatum,
          taxId: data.taxId ?? null,
          childBenefitClaimEur: data.childBenefitClaimEur ?? null,
          kinship: data.kinship ?? null,
          kinshipB: data.kinshipB ?? null,
          familyBenefitsOffice: data.familyBenefitsOffice ?? null,
          domesticResidenceAllYear: data.domesticResidenceAllYear ?? null,
          otherParent: data.otherParent ?? null,
          otherParentName: data.otherParentName ?? null,
          otherParentBirthDate: data.otherParentBirthDate ?? null,
          otherParentAddress: data.otherParentAddress ?? null,
          otherParentKind: data.otherParentKind ?? null,
          otherParentDiedOn: data.otherParentDiedOn ?? null,
          registeredWithMeAllYear: data.registeredWithMeAllYear ?? null,
          childBenefitToMeAllYear: data.childBenefitToMeAllYear ?? null,
          healthBasicEur: data.healthBasicEur ?? null,
          careEur: data.careEur ?? null,
          swissFamilyAllowanceEur: data.swissFamilyAllowanceEur ?? null,
          childcareEur: data.childcareEur ?? null,
          childcareProvider: data.childcareProvider ?? null,
          childcareFrom: data.childcareFrom ?? null,
          childcareTo: data.childcareTo ?? null,
          swissFamilyAllowancePayer: data.swissFamilyAllowancePayer ?? null,
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kind' },
      }),
    ])
    return toRecord(row)
  }

  async update(
    userId: string,
    taxYear: number,
    id: string,
    data: {
      firstName?: string
      lastName?: string
      geburtsdatum?: string
      taxId?: string | null
      childBenefitClaimEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord | null> {
    const existing = await this.prisma.child.findFirst({ where: { id, userId, taxYear } })
    if (existing === null) return null

    // Prisma field names (the @map'ped column names are the database's business, #423).
    const updateData: Record<string, string | boolean | null> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = value
    }

    const [row] = await this.prisma.$transaction([
      this.prisma.child.update({ where: { id }, data: updateData }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kind' },
      }),
    ])
    return toRecord(row)
  }

  async delete(userId: string, taxYear: number, id: string): Promise<boolean> {
    const existing = await this.prisma.child.findFirst({ where: { id, userId, taxYear } })
    if (existing === null) return false

    await this.prisma.$transaction([
      this.prisma.child.delete({ where: { id } }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'kind' },
      }),
    ])
    return true
  }
}
