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

  async findAllForUserAndYear(userId: string, steuerjahr: number): Promise<InterviewAnswerRecord[]> {
    const rows = await this.prisma.interviewAnswer.findMany({ where: { userId, steuerjahr } })
    return rows.map((row) => {
      if (!isValidAnswer(row.questionId as StepId, row.value)) {
        throw new InterviewAnswerIntegrityError(row.questionId)
      }
      return { questionId: row.questionId, value: row.value }
    })
  }

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
