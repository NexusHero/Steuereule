import { Inject, Injectable } from '@nestjs/common'
import type { RentalFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { RentalAttributes, RentalCarryOver, RentalObjectRecord, RentalRepository } from './rental.repository.js'

function toRecord(row: {
  id: string
  userId: string
  taxYear: number
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  strasse?: string | null
  hausnummer?: string | null
  plz?: string | null
  city?: string | null
  livingArea?: string | null
  depreciationAsLastYear?: boolean | null
  umlagen?: string | null
  schuldzinsen?: string | null
  einheiten?: string | null
  anteilA?: string | null
  propertyKey: string
  anschaffungsdatum?: string | null
  erhaltungsaufwand?: string | null
}): RentalObjectRecord {
  return {
    id: row.id,
    userId: row.userId,
    taxYear: row.taxYear,
    mieteinnahmen: row.mieteinnahmen,
    anschaffungskosten: row.anschaffungskosten,
    baujahr: row.baujahr,
    werbungskosten: row.werbungskosten,
    strasse: row.strasse ?? null,
    hausnummer: row.hausnummer ?? null,
    plz: row.plz ?? null,
    city: row.city ?? null,
    livingArea: row.livingArea ?? null,
    depreciationAsLastYear: row.depreciationAsLastYear ?? null,
    umlagen: row.umlagen ?? null,
    schuldzinsen: row.schuldzinsen ?? null,
    einheiten: row.einheiten ?? null,
    anteilA: row.anteilA ?? null,
    propertyKey: row.propertyKey,
    anschaffungsdatum: row.anschaffungsdatum ?? null,
    erhaltungsaufwand: row.erhaltungsaufwand ?? null,
  }
}

const ATTRIBUTE_KEYS = [
  'strasse',
  'hausnummer',
  'plz',
  'city',
  'livingArea',
  'depreciationAsLastYear',
  'umlagen',
  'schuldzinsen',
  'einheiten',
  'anteilA',
  'anschaffungsdatum',
  'erhaltungsaufwand',
] as const satisfies readonly (keyof RentalAttributes)[]

function fieldData(
  field: RentalFieldId,
  value: string | null,
): { mieteinnahmen?: string | null; anschaffungskosten?: string | null; baujahr?: string | null; werbungskosten?: string | null } {
  switch (field) {
    case 'mieteinnahmen':
      return { mieteinnahmen: value }
    case 'anschaffungskosten':
      return { anschaffungskosten: value }
    case 'baujahr':
      return { baujahr: value }
    case 'werbungskosten':
      return { werbungskosten: value }
  }
}

@Injectable()
export class PrismaRentalRepository implements RentalRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, taxYear: number): Promise<RentalObjectRecord[]> {
    const rows = await this.prisma.rentalProperty.findMany({
      where: { userId, taxYear },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async listForUser(userId: string): Promise<RentalObjectRecord[]> {
    const rows = await this.prisma.rentalProperty.findMany({ where: { userId }, orderBy: [{ taxYear: 'asc' }, { createdAt: 'asc' }] })
    return rows.map(toRecord)
  }

  async create(userId: string, taxYear: number, carry?: RentalCarryOver): Promise<RentalObjectRecord> {
    const carried = carry === undefined ? {} : { propertyKey: carry.propertyKey, anschaffungsdatum: carry.anschaffungsdatum }
    const [row] = await this.prisma.$transaction([
      this.prisma.rentalProperty.create({
        data: { userId, taxYear, mieteinnahmen: null, anschaffungskosten: null, baujahr: null, werbungskosten: null, ...carried },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }

  async setField(
    userId: string,
    taxYear: number,
    propertyId: string,
    field: RentalFieldId,
    value: string | null,
  ): Promise<RentalObjectRecord | null> {
    const existing = await this.prisma.rentalProperty.findFirst({ where: { id: propertyId, userId, taxYear } })
    if (existing === null) return null

    const [row] = await this.prisma.$transaction([
      this.prisma.rentalProperty.update({ where: { id: propertyId }, data: fieldData(field, value) }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }

  async delete(userId: string, taxYear: number, propertyId: string): Promise<boolean> {
    const existing = await this.prisma.rentalProperty.findFirst({ where: { id: propertyId, userId, taxYear } })
    if (existing === null) return false
    await this.prisma.$transaction([
      this.prisma.rentalProperty.delete({ where: { id: propertyId } }),
      // The object's markings and proposals go with it (API-21).
      this.prisma.marking.deleteMany({ where: { userId, taxYear, itemKey: { startsWith: `vermietung:${propertyId}.` } } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'vermietung' } }),
    ])
    return true
  }

  async setAddress(userId: string, taxYear: number, propertyId: string, attributes: RentalAttributes): Promise<RentalObjectRecord | null> {
    const existing = await this.prisma.rentalProperty.findFirst({ where: { id: propertyId, userId, taxYear } })
    if (existing === null) return null

    // Only the keys the request carries are written; an absent key keeps what is stored.
    const updateData: RentalAttributes = {}
    for (const key of ATTRIBUTE_KEYS) {
      if (attributes[key] !== undefined) Object.assign(updateData, { [key]: attributes[key] })
    }

    const [row] = await this.prisma.$transaction([
      this.prisma.rentalProperty.update({ where: { id: propertyId }, data: updateData }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }

}
