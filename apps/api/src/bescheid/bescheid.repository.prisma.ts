import { Inject, Injectable } from '@nestjs/common'
import type { AssessmentField, AssessmentStatus } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AssessmentFields, AssessmentRecord, AssessmentRepository } from './bescheid.repository.js'

type Row = {
  userId: string
  taxYear: number
  status: string
  assessmentDate: string | null
  appealReason: string | null
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
    taxYear: row.taxYear,
    status: row.status as AssessmentStatus,
    assessmentDate: row.assessmentDate,
    appealReason: row.appealReason,
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

  async findForUserAndYear(userId: string, taxYear: number): Promise<AssessmentRecord | null> {
    const row = await this.prisma.assessment.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : toRecord(row)
  }

  async setField(userId: string, taxYear: number, field: AssessmentField, value: string | null): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.assessment.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: {
          userId,
          taxYear,
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

  async setDate(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.assessment.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, status: 'eingegangen', assessmentDate: date },
        update: { assessmentDate: date },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setStatus(userId: string, taxYear: number, status: AssessmentStatus): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.assessment.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, status },
        update: { status },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  async setAppeal(userId: string, taxYear: number, reason: string): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.assessment.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, status: 'einspruch-eingelegt', appealReason: reason },
        update: { status: 'einspruch-eingelegt', appealReason: reason },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }
}
