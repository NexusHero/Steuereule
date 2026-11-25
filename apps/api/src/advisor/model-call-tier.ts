import { Inject, Injectable } from '@nestjs/common'
import type { ModelCallTier } from '@steuereule/core'
import { UnlockService } from '../unlock/unlock.service.js'

/**
 * Whose share of the day's model calls the owl draws from for a user and year (H2-40): a year the user paid
 * for may use the reserve kept for paying accounts. Unknown counts as free; the check never fails a turn.
 */
@Injectable()
export class ModelCallTiers {
  constructor(@Inject(UnlockService) private readonly unlock: Pick<UnlockService, 'status'>) {}

  async tierOf(userId: string, taxYear: number): Promise<ModelCallTier> {
    try {
      return (await this.unlock.status(userId, taxYear)) === 'freigeschaltet' ? 'paid' : 'free'
    } catch {
      return 'free'
    }
  }
}
