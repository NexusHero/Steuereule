import { Inject, Injectable } from '@nestjs/common'
import { isValidAnswer, type StepId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { InterviewAnswerRecord, InterviewAnswerRepository, WriteAnswerParams } from './interview-answer.repository.js'

/**
 * Thrown when a decrypted (or pass-through) InterviewAnswer.value doesn't
 * shape-validate as an accepted value for its own questionId (REQ-003.5's pattern,
 * mirrored from ProfileIntegrityError). This table has never written a plaintext row
 * — every write goes through this same field-encryption-extended client from day one
 * — so a value that doesn't validate against isValidAnswer() is definitionally
 * corruption, not legacy data.
 */
export class InterviewAnswerIntegrityError extends Error {
  constructor(questionId: string) {
    super(
      `InterviewAnswer.value for questionId "${questionId}" failed to decrypt to a valid value — the stored ciphertext may be corrupted.`,
    )
    this.name = 'InterviewAnswerIntegrityError'
  }
}

@Injectable()
export class PrismaInterviewAnswerRepository implements InterviewAnswerRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — this is the only place
  // InterviewAnswer rows are read/written, so it's the only place that needs to
  // (transparently) encrypt/decrypt `value` (ADR-0008). Mirrors PrismaProfileRepository.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUserAndYear(userId: string, steuerjahr: number): Promise<InterviewAnswerRecord[]> {
    const rows = await this.prisma.interviewAnswer.findMany({ where: { userId, steuerjahr } })
    return rows.map((row) => {
      if (!isValidAnswer(row.questionId as StepId, row.value)) {
        throw new InterviewAnswerIntegrityError(row.questionId)
      }
      return { questionId: row.questionId, value: row.value }
    })
  }

  /**
   * Writes the answer row, its WRITE audit entry (REQ-004.1) and the TaxYear.openItems
   * projection as a single Prisma array-form `$transaction` — all three commit or none
   * do. Mirrors PrismaProfileRepository.upsert's precedent of a repository directly
   * writing a table it doesn't conceptually "own" (there it's TaxDataAccessLog, here
   * it's additionally TaxYear) for true cross-table atomicity, which only the
   * Prisma-specific persistence layer can give without leaking Prisma types into the
   * Prisma-agnostic InterviewService/AuditService seam.
   *
   * TaxYear has never had a write path before this (see #318) — `create` seeds
   * `baseEstimate: 0`, an honest zero rather than an invented estimate: computing a
   * real estimate from interview answers is explicitly out of this slice's scope
   * (ADR-0032, D1), so there is nothing truthful to put there yet. A later slice that
   * does compute a real baseEstimate writes it through its own path; this upsert's
   * `update` branch only ever touches `openItems`, never clobbering a baseEstimate
   * that slice may since have set.
   */
  async write(params: WriteAnswerParams): Promise<void> {
    const { userId, steuerjahr, questionId, value, openItems } = params
    await this.prisma.$transaction([
      this.prisma.interviewAnswer.upsert({
        where: { userId_steuerjahr_questionId: { userId, steuerjahr, questionId } },
        create: { userId, steuerjahr, questionId, value },
        update: { value },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'interview' },
      }),
      this.prisma.taxYear.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, baseEstimate: 0, openItems, openConflicts: 0 },
        update: { openItems },
      }),
    ])
  }
}
