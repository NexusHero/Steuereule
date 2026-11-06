import { Inject, Injectable } from '@nestjs/common'
import type { VermietungFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { VermietungsobjektRecord, VermietungRepository } from './vermietung.repository.js'

function toRecord(row: {
  id: string
  userId: string
  steuerjahr: number
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
  strasse?: string | null
  hausnummer?: string | null
  plz?: string | null
  ort?: string | null
  wohnflaeche?: string | null
  afaWieVorjahr?: boolean | null
  umlagen?: string | null
  schuldzinsen?: string | null
  einheiten?: string | null
  anteilA?: string | null
}): VermietungsobjektRecord {
  return {
    id: row.id,
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    mieteinnahmen: row.mieteinnahmen,
    anschaffungskosten: row.anschaffungskosten,
    baujahr: row.baujahr,
    werbungskosten: row.werbungskosten,
    strasse: row.strasse ?? null,
    hausnummer: row.hausnummer ?? null,
    plz: row.plz ?? null,
    ort: row.ort ?? null,
    wohnflaeche: row.wohnflaeche ?? null,
    afaWieVorjahr: row.afaWieVorjahr ?? null,
    umlagen: row.umlagen ?? null,
    schuldzinsen: row.schuldzinsen ?? null,
    einheiten: row.einheiten ?? null,
    anteilA: row.anteilA ?? null,
  }
}

function feldData(
  feld: VermietungFeldId,
  wert: string | null,
): { mieteinnahmen?: string | null; anschaffungskosten?: string | null; baujahr?: string | null; werbungskosten?: string | null } {
  switch (feld) {
    case 'mieteinnahmen':
      return { mieteinnahmen: wert }
    case 'anschaffungskosten':
      return { anschaffungskosten: wert }
    case 'baujahr':
      return { baujahr: wert }
    case 'werbungskosten':
      return { werbungskosten: wert }
  }
}

@Injectable()
export class PrismaVermietungRepository implements VermietungRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord[]> {
    const rows = await this.prisma.vermietungsobjekt.findMany({
      where: { userId, steuerjahr },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async create(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.vermietungsobjekt.create({
        data: { userId, steuerjahr, mieteinnahmen: null, anschaffungskosten: null, baujahr: null, werbungskosten: null },
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
    objectId: string,
    field: VermietungFeldId,
    value: string | null,
  ): Promise<VermietungsobjektRecord | null> {
    return this.setFeld(userId, taxYear, objectId, field, value)
  }

  async setFeld(
    userId: string,
    steuerjahr: number,
    objektId: string,
    feld: VermietungFeldId,
    wert: string | null,
  ): Promise<VermietungsobjektRecord | null> {
    const existing = await this.prisma.vermietungsobjekt.findFirst({ where: { id: objektId, userId, steuerjahr } })
    if (existing === null) return null

    const [row] = await this.prisma.$transaction([
      this.prisma.vermietungsobjekt.update({ where: { id: objektId }, data: feldData(feld, wert) }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }

  async setAddress(
    userId: string,
    taxYear: number,
    objectId: string,
    address: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: string | null; afaWieVorjahr?: boolean | null; umlagen?: string | null; schuldzinsen?: string | null; einheiten?: string | null; anteilA?: string | null },
  ): Promise<VermietungsobjektRecord | null> {
    return this.setAdresse(userId, taxYear, objectId, address)
  }

  async setAdresse(
    userId: string,
    steuerjahr: number,
    objektId: string,
    adresse: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null; wohnflaeche?: string | null; afaWieVorjahr?: boolean | null; umlagen?: string | null; schuldzinsen?: string | null; einheiten?: string | null; anteilA?: string | null },
  ): Promise<VermietungsobjektRecord | null> {
    const existing = await this.prisma.vermietungsobjekt.findFirst({ where: { id: objektId, userId, steuerjahr } })
    if (existing === null) return null

    const updateData: {
      strasse?: string | null
      hausnummer?: string | null
      plz?: string | null
      ort?: string | null
      wohnflaeche?: string | null
      afaWieVorjahr?: boolean | null
      umlagen?: string | null
      schuldzinsen?: string | null
      einheiten?: string | null
      anteilA?: string | null
    } = {}
    if (adresse.strasse !== undefined) updateData.strasse = adresse.strasse
    if (adresse.hausnummer !== undefined) updateData.hausnummer = adresse.hausnummer
    if (adresse.plz !== undefined) updateData.plz = adresse.plz
    if (adresse.ort !== undefined) updateData.ort = adresse.ort
    if (adresse.wohnflaeche !== undefined) updateData.wohnflaeche = adresse.wohnflaeche
    if (adresse.afaWieVorjahr !== undefined) updateData.afaWieVorjahr = adresse.afaWieVorjahr
    if (adresse.umlagen !== undefined) updateData.umlagen = adresse.umlagen
    if (adresse.schuldzinsen !== undefined) updateData.schuldzinsen = adresse.schuldzinsen
    if (adresse.einheiten !== undefined) updateData.einheiten = adresse.einheiten
    if (adresse.anteilA !== undefined) updateData.anteilA = adresse.anteilA

    const [row] = await this.prisma.$transaction([
      this.prisma.vermietungsobjekt.update({ where: { id: objektId }, data: updateData }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }
}
