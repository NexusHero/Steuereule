import { Inject, Injectable } from '@nestjs/common'
import type { RentalFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { RentalObjectRecord, RentalRepository } from './vermietung.repository.js'

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
  }
}

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

  async create(userId: string, taxYear: number): Promise<RentalObjectRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.rentalProperty.create({
        data: { userId, taxYear, mieteinnahmen: null, anschaffungskosten: null, baujahr: null, werbungskosten: null },
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

  async setAddress(
    userId: string,
    taxYear: number,
    propertyId: string,
    address: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; city?: string | null; livingArea?: string | null; depreciationAsLastYear?: boolean | null; umlagen?: string | null; schuldzinsen?: string | null; einheiten?: string | null; anteilA?: string | null },
  ): Promise<RentalObjectRecord | null> {
    const existing = await this.prisma.rentalProperty.findFirst({ where: { id: propertyId, userId, taxYear } })
    if (existing === null) return null

    const updateData: {
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
    } = {}
    if (address.strasse !== undefined) updateData.strasse = address.strasse
    if (address.hausnummer !== undefined) updateData.hausnummer = address.hausnummer
    if (address.plz !== undefined) updateData.plz = address.plz
    if (address.city !== undefined) updateData.city = address.city
    if (address.livingArea !== undefined) updateData.livingArea = address.livingArea
    if (address.depreciationAsLastYear !== undefined) updateData.depreciationAsLastYear = address.depreciationAsLastYear
    if (address.umlagen !== undefined) updateData.umlagen = address.umlagen
    if (address.schuldzinsen !== undefined) updateData.schuldzinsen = address.schuldzinsen
    if (address.einheiten !== undefined) updateData.einheiten = address.einheiten
    if (address.anteilA !== undefined) updateData.anteilA = address.anteilA

    const [row] = await this.prisma.$transaction([
      this.prisma.rentalProperty.update({ where: { id: propertyId }, data: updateData }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }
}
