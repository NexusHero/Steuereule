import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { StepUpGrantRepository } from './step-up-grant.repository.js'
import { stepUpIdentifier } from './step-up.js'

@Injectable()
export class PrismaStepUpGrantRepository implements StepUpGrantRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async hasValidGrant(sessionId: string, now = new Date()): Promise<boolean> {
    const grant = await this.prisma.verification.findFirst({
      where: { identifier: stepUpIdentifier(sessionId) },
    })
    return grant != null && grant.expiresAt.getTime() > now.getTime()
  }
}
