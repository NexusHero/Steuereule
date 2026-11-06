import { Inject, Injectable } from '@nestjs/common'
import type { AssessmentField, AssessmentStatus } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AssessmentFields, AssessmentRecord, AssessmentRepository } from './bescheid.repository.js'

type Row = {
  userId: string
  steuerjahr: number
  status: string
  bescheiddatum: string | null
  einspruchGrund: string | null
  einnahmen: string | null
  vorsorgeaufwand: string | null
  anrechnung: string | null
  festgesetzteSteuer: string | null
  erstattung: string | null
}

function fieldsFromRow(row: Row): AssessmentFields {
  return {
    einnahmen: row.einnahmen,
    vorsorgeaufwand: row.vorsorgeaufwand,
    anrechnung: row.anrechnung,
    festgesetzteSteuer: row.festgesetzteSteuer,
    erstattung: row.erstattung,
  }
}

function toRecord(row: Row): AssessmentRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    status: row.status as AssessmentStatus,
    bescheiddatum: row.bescheiddatum,
    einspruchGrund: row.einspruchGrund,
    fields: fieldsFromRow(row),
  }
}

function fieldData(field: AssessmentField, value: string | null): Partial<Row> {
  switch (field) {
    case 'einnahmen':
      return { einnahmen: value }
    case 'vorsorgeaufwand':
      return { vorsorgeaufwand: value }
    case 'anrechnung':
      return { anrechnung: value }
    case 'festgesetzteSteuer':
      return { festgesetzteSteuer: value }
    case 'erstattung':
      return { erstattung: value }
  }
}

@Injectable()
export class PrismaAssessmentRepository implements AssessmentRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<AssessmentRecord | null> {
    const row = await this.prisma.bescheid.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, steuerjahr: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: {
          userId,
          steuerjahr,
          status: 'eingegangen',
          ...fieldData(field, value),
        },
        update: fieldData(field, value),
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setDate(userId: string, steuerjahr: number, date: string | null): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, status: 'eingegangen', bescheiddatum: date },
        update: { bescheiddatum: date },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setStatus(userId: string, steuerjahr: number, status: AssessmentStatus): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, status },
        update: { status },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setAppeal(userId: string, steuerjahr: number, reason: string): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.bescheid.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, status: 'einspruch-eingelegt', einspruchGrund: reason },
        update: { status: 'einspruch-eingelegt', einspruchGrund: reason },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }
}
