import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type {
  HouseholdPersonRecord,
  HouseholdRepository,
  MembershipRecord,
  MergeCandidateRecord,
  PartnerLinkRecord,
} from './household.repository.js'

const toPerson = (row: {
  id: string
  householdUserId: string
  kind: string
  sealed: string
  linkedUserId: string | null
  leftFromYear: number | null
  updatedByUserId: string
  updatedAt: Date
}): HouseholdPersonRecord => ({ ...row, kind: row.kind === 'spouse' ? 'spouse' : 'child' })

const toCandidate = (row: { id: string; householdUserId: string; personId: string; otherPersonId: string; resolution: string | null }): MergeCandidateRecord => ({
  ...row,
  resolution: row.resolution === 'same' || row.resolution === 'different' ? row.resolution : null,
})

/** Household tables (ADR-0062). The person facts are sealed by PersonSealService, not by Prisma. */
@Injectable()
export class PrismaHouseholdRepository implements HouseholdRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listPersons(householdUserId: string) {
    return (await this.prisma.householdPerson.findMany({ where: { householdUserId }, orderBy: { createdAt: 'asc' } })).map(toPerson)
  }

  async findPerson(id: string) {
    const row = await this.prisma.householdPerson.findUnique({ where: { id } })
    return row ? toPerson(row) : null
  }

  async createPerson(input: Omit<HouseholdPersonRecord, 'updatedAt' | 'leftFromYear' | 'linkedUserId'> & { linkedUserId?: string | null }) {
    return toPerson(await this.prisma.householdPerson.create({ data: { ...input, linkedUserId: input.linkedUserId ?? null } }))
  }

  async updatePerson(id: string, patch: Partial<Pick<HouseholdPersonRecord, 'sealed' | 'leftFromYear' | 'linkedUserId' | 'updatedByUserId'>>) {
    return toPerson(await this.prisma.householdPerson.update({ where: { id }, data: patch }))
  }

  async deletePerson(id: string) {
    await this.prisma.householdPerson.delete({ where: { id } })
  }

  async listMemberships(householdUserId: string): Promise<MembershipRecord[]> {
    return this.prisma.taxYearMembership.findMany({
      where: { person: { householdUserId } },
      select: { id: true, personId: true, taxYear: true, childId: true, spouseUserId: true },
      orderBy: { taxYear: 'asc' },
    })
  }

  async findMembershipByChildId(childId: string): Promise<MembershipRecord | null> {
    return this.prisma.taxYearMembership.findUnique({
      where: { childId },
      select: { id: true, personId: true, taxYear: true, childId: true, spouseUserId: true },
    })
  }

  async createMembership(input: Omit<MembershipRecord, 'id'>): Promise<MembershipRecord> {
    return this.prisma.taxYearMembership.create({
      data: input,
      select: { id: true, personId: true, taxYear: true, childId: true, spouseUserId: true },
    })
  }

  async deleteMembership(id: string) {
    await this.prisma.taxYearMembership.delete({ where: { id } })
  }

  async moveMemberships(fromPersonId: string, toPersonId: string) {
    await this.prisma.taxYearMembership.updateMany({ where: { personId: fromPersonId }, data: { personId: toPersonId } })
  }

  async findPartnerLinkByPersonA(personAUserId: string): Promise<PartnerLinkRecord | null> {
    return this.prisma.partnerLink.findUnique({
      where: { personAUserId },
      select: { id: true, personAUserId: true, personBUserId: true, spousePersonId: true, validFromYear: true, endedFromYear: true },
    })
  }

  async findPartnerLinkByPersonB(personBUserId: string): Promise<PartnerLinkRecord | null> {
    if (personBUserId === '') return null
    return this.prisma.partnerLink.findFirst({
      where: { personBUserId },
      select: { id: true, personAUserId: true, personBUserId: true, spousePersonId: true, validFromYear: true, endedFromYear: true },
    })
  }

  async upsertPartnerLink(personAUserId: string, data: Omit<PartnerLinkRecord, 'id' | 'personAUserId'>): Promise<PartnerLinkRecord> {
    return this.prisma.partnerLink.upsert({
      where: { personAUserId },
      create: { personAUserId, ...data },
      update: data,
      select: { id: true, personAUserId: true, personBUserId: true, spousePersonId: true, validFromYear: true, endedFromYear: true },
    })
  }

  async listCandidates(householdUserId: string) {
    return (await this.prisma.householdMergeCandidate.findMany({ where: { householdUserId } })).map(toCandidate)
  }

  async createCandidate(input: Omit<MergeCandidateRecord, 'id' | 'resolution'>) {
    const known = await this.prisma.householdMergeCandidate.findFirst({
      where: {
        OR: [
          { personId: input.personId, otherPersonId: input.otherPersonId },
          { personId: input.otherPersonId, otherPersonId: input.personId },
        ],
      },
    })
    if (!known) await this.prisma.householdMergeCandidate.create({ data: input })
  }

  async resolveCandidate(id: string, resolution: 'same' | 'different') {
    return toCandidate(await this.prisma.householdMergeCandidate.update({ where: { id }, data: { resolution, resolvedAt: new Date() } }))
  }
}
