import { Inject, Injectable } from '@nestjs/common'
import { isValidAnswer, type StepId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { InterviewAnswerRecord, InterviewAnswerRepository, WriteAnswerParams } from './interview-answer.repository.js'

/** Thrown when a decrypted InterviewAnswer.value doesn't shape-validate as an accepted value for its own questionId. */
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
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUserAndYear(userId: string, taxYear: number): Promise<InterviewAnswerRecord[]> {
    const rows = await this.prisma.interviewAnswer.findMany({ where: { userId, taxYear } })
    return rows.map((row) => {
      if (!isValidAnswer(row.questionId as StepId, row.value)) {
        throw new InterviewAnswerIntegrityError(row.questionId)
      }
      return { questionId: row.questionId, value: row.value }
    })
  }

  async write(params: WriteAnswerParams): Promise<void> {
    const { userId, taxYear, questionId, value, openItems } = params
    if (value === '') {
      await this.prisma.interviewAnswer.deleteMany({
        where: { userId, taxYear, questionId },
      })
      return
    }
    await this.prisma.$transaction([
      this.prisma.interviewAnswer.upsert({
        where: { userId_taxYear_questionId: { userId, taxYear, questionId } },
        create: { userId, taxYear, questionId, value },
        update: { value },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'interview' },
      }),
      this.prisma.taxYear.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, baseEstimate: 0, openItems, openConflicts: 0 },
        update: { openItems },
      }),
    ])
  }
}
