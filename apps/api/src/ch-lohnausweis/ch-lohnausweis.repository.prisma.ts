import { Inject, Injectable } from '@nestjs/common'
import { LOHNAUSWEIS_BETRAG_FELDER, type LohnausweisBetragFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ChLohnausweisFelder, ChLohnausweisRecord, ChLohnausweisRepository } from './ch-lohnausweis.repository.js'

/** The Lohnausweis field id → Prisma column name (the id's hyphen-free camelCase form). */
const FELD_SPALTE: Record<LohnausweisBetragFeldId, string> = {
  lohn: 'lohn',
  gehaltsnebenleistungen: 'gehaltsnebenleistungen',
  'unregelmaessige-leistungen': 'unregelmaessigeLeistungen',
  kapitalleistungen: 'kapitalleistungen',
  beteiligungsrechte: 'beteiligungsrechte',
  sitzungsgelder: 'sitzungsgelder',
  'andere-leistungen': 'andereLeistungen',
  'bruttolohn-total': 'bruttolohnTotal',
  'ahv-beitraege': 'ahvBeitraege',
  'berufliche-vorsorge': 'beruflicheVorsorge',
  nettolohn: 'nettolohn',
  quellensteuer: 'quellensteuer',
  spesen: 'spesen',
  'weitere-nebenleistungen': 'weitereNebenleistungen',
}

/** The row shape the repository reads/writes — the 14 amount columns, the freitext + the Kurs. */
type ChLohnausweisRow = {
  userId: string
  steuerjahr: number
  lohn: string | null
  gehaltsnebenleistungen: string | null
  unregelmaessigeLeistungen: string | null
  kapitalleistungen: string | null
  beteiligungsrechte: string | null
  sitzungsgelder: string | null
  andereLeistungen: string | null
  bruttolohnTotal: string | null
  ahvBeitraege: string | null
  beruflicheVorsorge: string | null
  nettolohn: string | null
  quellensteuer: string | null
  spesen: string | null
  weitereNebenleistungen: string | null
  bemerkungen: string | null
  saeule3aChf: string | null
  krankenkasseChf: string | null
  wechselkursMonat: string | null
  wechselkursKurs: number | null
  wechselkursModus: string | null
  wechselkursBelegId: string | null
}

function toRecord(row: ChLohnausweisRow): ChLohnausweisRecord {
  const felder = {} as ChLohnausweisFelder
  for (const feld of LOHNAUSWEIS_BETRAG_FELDER) felder[feld] = row[FELD_SPALTE[feld] as keyof ChLohnausweisRow] as string | null
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    felder,
    bemerkungen: row.bemerkungen,
    saeule3aChf: row.saeule3aChf,
    krankenkasseChf: row.krankenkasseChf,
    wechselkursMonat: row.wechselkursMonat,
    wechselkursKurs: row.wechselkursKurs,
    wechselkursModus: row.wechselkursModus,
    wechselkursBelegId: row.wechselkursBelegId,
  }
}

/** The one-keyed update/insert payload for `feld` — typed as a sparse record, never a computed
 *  `{[spalte]: wert}` cast that could silently target a non-column key. */
function feldData(feld: LohnausweisBetragFeldId, wert: string | null): Record<string, string | null> {
  return { [FELD_SPALTE[feld]]: wert }
}

/** A fresh row's create payload — every field `null` (`offen`), never a fabricated figure. */
const EMPTY_CREATE: Record<string, null> = Object.fromEntries([
  ...LOHNAUSWEIS_BETRAG_FELDER.map((f) => [FELD_SPALTE[f], null]),
  ['bemerkungen', null],
  ['saeule3aChf', null],
  ['krankenkasseChf', null],
  ['wechselkursMonat', null],
  ['wechselkursKurs', null],
  ['wechselkursModus', null],
  ['wechselkursBelegId', null],
])

@Injectable()
export class PrismaChLohnausweisRepository implements ChLohnausweisRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — the CHF figures are field-encrypted at rest
  // (ADR-0008): actual income is the most sensitive personal fact a tax app holds, joinable to
  // Profile's Steuer-ID via the same userId (see schema.prisma's ChLohnausweis doc).
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<ChLohnausweisRecord | null> {
    const row = await this.prisma.chLohnausweis.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row as ChLohnausweisRow)
  }

  async setFeld(userId: string, steuerjahr: number, feld: LohnausweisBetragFeldId, wert: string | null): Promise<ChLohnausweisRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, ...feldData(feld, wert) },
        update: feldData(feld, wert),
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChLohnausweisRow)
  }

  async setBemerkungen(userId: string, steuerjahr: number, text: string | null): Promise<ChLohnausweisRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, bemerkungen: text },
        update: { bemerkungen: text },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChLohnausweisRow)
  }

  async setVorsorge(userId: string, steuerjahr: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<ChLohnausweisRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, saeule3aChf, krankenkasseChf },
        update: { saeule3aChf, krankenkasseChf },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChLohnausweisRow)
  }

  async setWechselkurs(
    userId: string,
    steuerjahr: number,
    wechselkurs: { monat: string; kurs: number; modus: string; belegId?: string },
  ): Promise<ChLohnausweisRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: {
          userId,
          steuerjahr,
          ...EMPTY_CREATE,
          wechselkursMonat: wechselkurs.monat,
          wechselkursKurs: wechselkurs.kurs,
          wechselkursModus: wechselkurs.modus,
          wechselkursBelegId: wechselkurs.belegId ?? null,
        },
        update: {
          wechselkursMonat: wechselkurs.monat,
          wechselkursKurs: wechselkurs.kurs,
          wechselkursModus: wechselkurs.modus,
          wechselkursBelegId: wechselkurs.belegId ?? null,
        },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChLohnausweisRow)
  }
}
