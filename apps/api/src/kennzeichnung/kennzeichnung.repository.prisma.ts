import { Inject, Injectable } from '@nestjs/common'
import { anlageVon, type Anlage, type Herkunft, type Kennzeichnung } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { KennzeichnungRecord, KennzeichnungRepository } from './kennzeichnung.repository.js'

interface HerkunftSpalten {
  art: string
  name: string | null
  belegId: string | null
  vorjahr: number | null
}

function herkunftAusSpalten({ art, name, belegId, vorjahr }: HerkunftSpalten): Herkunft {
  switch (art) {
    case 'nutzer':
      return { art: 'nutzer' }
    case 'uebernahme':
      if (vorjahr === null) break
      return { art: 'uebernahme', vorjahr }
    case 'assistent':
      if (name === null) break
      return belegId === null ? { art: 'assistent', name } : { art: 'assistent', name, belegId }
    case 'beleg':
      if (belegId === null) break
      return { art: 'beleg', belegId }
  }
  throw new Error(`Kennzeichnung: stored Herkunft "${art}" is incomplete`)
}

function herkunftZuSpalten(h: Herkunft): HerkunftSpalten {
  return {
    art: h.art,
    name: h.art === 'assistent' ? h.name : null,
    belegId: h.art === 'beleg' || (h.art === 'assistent' && h.belegId !== undefined) ? (h.belegId ?? null) : null,
    vorjahr: h.art === 'uebernahme' ? h.vorjahr : null,
  }
}

interface Row {
  userId: string
  steuerjahr: number
  postenKey: string
  herkunftArt: string
  herkunftName: string | null
  herkunftBelegId: string | null
  vorjahr: number | null
  bestaetigt: boolean
  vorschlagHerkunftArt: string | null
  vorschlagHerkunftName: string | null
  vorschlagBelegId: string | null
  vorschlagVorjahr: number | null
  vorschlagWert: string | null
}

function toRecord(row: Row): KennzeichnungRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    key: row.postenKey,
    herkunft: herkunftAusSpalten({ art: row.herkunftArt, name: row.herkunftName, belegId: row.herkunftBelegId, vorjahr: row.vorjahr }),
    bestaetigt: row.bestaetigt,
    vorschlag:
      row.vorschlagHerkunftArt === null
        ? null
        : {
            wert: row.vorschlagWert,
            herkunft: herkunftAusSpalten({ art: row.vorschlagHerkunftArt, name: row.vorschlagHerkunftName, belegId: row.vorschlagBelegId, vorjahr: row.vorschlagVorjahr }),
          },
  }
}

function toData(k: Omit<Kennzeichnung, 'wert'>) {
  const h = herkunftZuSpalten(k.herkunft)
  const v = k.vorschlag === null ? null : herkunftZuSpalten(k.vorschlag.herkunft)
  return {
    anlage: anlageVon(k.key),
    herkunftArt: h.art,
    herkunftName: h.name,
    herkunftBelegId: h.belegId,
    vorjahr: h.vorjahr,
    bestaetigt: k.bestaetigt,
    vorschlagHerkunftArt: v?.art ?? null,
    vorschlagHerkunftName: v?.name ?? null,
    vorschlagBelegId: v?.belegId ?? null,
    vorschlagVorjahr: v?.vorjahr ?? null,
    vorschlagWert: k.vorschlag?.wert ?? null,
  }
}

@Injectable()
export class PrismaKennzeichnungRepository implements KennzeichnungRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYears(userId: string, steuerjahre: readonly number[]): Promise<KennzeichnungRecord[]> {
    const rows = await this.prisma.kennzeichnung.findMany({
      where: { userId, steuerjahr: { in: [...steuerjahre] } },
      orderBy: { postenKey: 'asc' },
    })
    return rows.map(toRecord)
  }

  async find(userId: string, steuerjahr: number, key: string): Promise<KennzeichnungRecord | null> {
    const row = await this.prisma.kennzeichnung.findUnique({
      where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey: key } },
    })
    return row === null ? null : toRecord(row)
  }

  async speichere(userId: string, steuerjahr: number, kennzeichnung: Omit<Kennzeichnung, 'wert'>): Promise<KennzeichnungRecord> {
    const data = toData(kennzeichnung)
    const [row] = await this.prisma.$transaction([
      this.prisma.kennzeichnung.upsert({
        where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey: kennzeichnung.key } },
        create: { userId, steuerjahr, postenKey: kennzeichnung.key, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } }),
    ])
    return toRecord(row)
  }

  async entferne(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number> {
    if (keys.length === 0) return 0
    const { count } = await this.prisma.kennzeichnung.deleteMany({ where: { userId, steuerjahr, postenKey: { in: [...keys] } } })
    if (count > 0) {
      await this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } })
    }
    return count
  }

  async bestaetigeAnlage(userId: string, steuerjahre: readonly number[], anlage: Anlage): Promise<number> {
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.kennzeichnung.updateMany({
        where: { userId, steuerjahr: { in: [...steuerjahre] }, anlage, bestaetigt: false },
        data: { bestaetigt: true },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } }),
    ])
    return count
  }
}
