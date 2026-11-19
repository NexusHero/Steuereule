import { Inject, Injectable } from '@nestjs/common'
import { ASSESSMENT_NEW_POSITION_IDS, isAppealOutcome, type AppealOutcome, type AssessmentPositionId, type AssessmentStatus } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AssessmentFields, AssessmentRecord, AssessmentRepository, AssessmentStoredField } from './assessment.repository.js'

type Row = {
  userId: string
  taxYear: number
  status: string
  assessmentDate: string | null
  appealReason: string | null
  appealDate?: string | null
  appealOutcome?: string | null
  appealOutcomeAmount?: string | null
  einnahmen: string | null
  vorsorgeaufwand: string | null
  anrechnung: string | null
  festgesetzteSteuer: string | null
  erstattung: string | null
  erlaeuterungen: string | null
} & Partial<Record<AssessmentPositionId, string | null>>

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
    appealDate: row.appealDate ?? null,
    appealOutcome: row.appealOutcome !== null && row.appealOutcome !== undefined && isAppealOutcome(row.appealOutcome) ? row.appealOutcome : null,
    appealOutcomeAmount: row.appealOutcomeAmount ?? null,
    fields: fieldsFromRow(row),
    positions: Object.fromEntries(ASSESSMENT_NEW_POSITION_IDS.map((id) => [id, row[id] ?? null])),
    explanations: row.erlaeuterungen,
  }
}

/** Every stored field is a column of the same name, so the write is that one column. */
function fieldData(field: AssessmentStoredField, value: string | null): Record<string, string | null> {
  return { [field]: value }
}

@Injectable()
export class PrismaAssessmentRepository implements AssessmentRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<AssessmentRecord | null> {
    const row = await this.prisma.assessment.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : toRecord(row)
  }

  async listForUser(userId: string): Promise<AssessmentRecord[]> {
    const rows = await this.prisma.assessment.findMany({ where: { userId }, orderBy: { taxYear: 'asc' } })
    return rows.map(toRecord)
  }

  private async upsert(userId: string, taxYear: number, data: Record<string, string | null>, create: Record<string, string | null> = {}): Promise<AssessmentRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.assessment.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, status: 'eingegangen', ...create, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'bescheid' },
      }),
    ])
    return toRecord(row)
  }

  setField(userId: string, taxYear: number, field: AssessmentStoredField, value: string | null): Promise<AssessmentRecord> {
    return this.upsert(userId, taxYear, fieldData(field, value))
  }

  setExplanations(userId: string, taxYear: number, text: string | null): Promise<AssessmentRecord> {
    return this.upsert(userId, taxYear, { erlaeuterungen: text })
  }

  setDate(userId: string, taxYear: number, date: string | null): Promise<AssessmentRecord> {
    return this.upsert(userId, taxYear, { assessmentDate: date })
  }

  setStatus(userId: string, taxYear: number, status: AssessmentStatus): Promise<AssessmentRecord> {
    return this.upsert(userId, taxYear, { status })
  }

  setAppeal(userId: string, taxYear: number, reason: string, date: string): Promise<AssessmentRecord> {
    return this.upsert(userId, taxYear, { status: 'einspruch-eingelegt', appealReason: reason, appealDate: date, appealOutcome: 'offen', appealOutcomeAmount: null })
  }

  setAppealOutcome(userId: string, taxYear: number, outcome: AppealOutcome, amount: string | null): Promise<AssessmentRecord> {
    return this.upsert(userId, taxYear, { appealOutcome: outcome, appealOutcomeAmount: amount })
  }

  async hasDeclaration(userId: string, taxYear: number): Promise<boolean> {
    // A year with answers is a declaration in the app even before its TaxYear row exists.
    const [year, answers] = await Promise.all([
      this.prisma.taxYear.findUnique({ where: { userId_taxYear: { userId, taxYear } } }),
      this.prisma.interviewAnswer.count({ where: { userId, taxYear } }),
    ])
    return year !== null || answers > 0
  }

  async recordExternalYear(userId: string, taxYear: number): Promise<boolean> {
    if (await this.hasDeclaration(userId, taxYear)) return false
    await this.prisma.taxYear.createMany({
      data: [{ userId, taxYear, baseEstimate: 0, openItems: 0, openConflicts: 0, status: 'extern-erledigt' }],
      skipDuplicates: true,
    })
    return true
  }
}
