import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { systemDatabaseClient } from '../common/database-identity.js'
import type { StepUpGrantRepository } from './step-up-grant.repository.js'
import { stepUpIdentifier } from './step-up.js'

@Injectable()
export class PrismaStepUpGrantRepository implements StepUpGrantRepository {
  private readonly prisma: PrismaService

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    // A system path as a whole (P11): step-up-grant.
    this.prisma = systemDatabaseClient(prisma, 'step-up-grant')
  }

  async hasValidGrant(sessionId: string, now = new Date()): Promise<boolean> {
    const grant = await this.prisma.verification.findFirst({
      where: { identifier: stepUpIdentifier(sessionId) },
    })
    return grant != null && grant.expiresAt.getTime() > now.getTime()
  }
}
