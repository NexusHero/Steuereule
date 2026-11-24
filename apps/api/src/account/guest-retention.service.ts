import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { GUEST_ACTIVITY_RECORDER, GUEST_SWEEP_INTERVAL_MS, type GuestActivityNotes, sweepInactiveGuests } from '../guest/guest-retention.js'
import { GUEST_ACTIVITY_REPOSITORY, type GuestActivityRepository } from '../guest/guest-activity.repository.js'
import { ACCOUNT_DELETION_REPOSITORY, type AccountDeletionRepository } from './account-deletion.repository.js'

/**
 * Runs the guest-retention sweep (ADR-0109) the way the other sweeps of the app run (ADR-0029, the OAuth client
 * sweep): piggybacked on traffic, at most once an hour per process, never failing the request that triggered it.
 * Cloud Run scales to zero, so there is no timer to rely on: with no traffic nothing is erased, which is "no
 * sooner than 30 days", never "on day 30".
 */
@Injectable()
export class GuestRetentionService implements OnModuleInit {
  private readonly logger = new Logger(GuestRetentionService.name)
  private lastRun = 0

  constructor(
    @Inject(GUEST_ACTIVITY_REPOSITORY) private readonly repository: GuestActivityRepository,
    @Inject(ACCOUNT_DELETION_REPOSITORY) private readonly deletion: AccountDeletionRepository,
    @Inject(GUEST_ACTIVITY_RECORDER) private readonly notes: GuestActivityNotes,
  ) {}

  onModuleInit(): void {
    this.notes.afterTouch = () => void this.run()
  }

  async run(now = new Date()): Promise<void> {
    if (now.getTime() - this.lastRun < GUEST_SWEEP_INTERVAL_MS) return
    this.lastRun = now.getTime()
    try {
      const result = await sweepInactiveGuests(
        { repository: this.repository, erase: (userId) => this.deletion.deleteAccount(userId), onError: (error) => this.logger.warn(`Guest erasure failed: ${String(error)}`) },
        now,
      )
      if (result.erased + result.heldBack + result.failed > 0) {
        this.logger.log(`Guest retention sweep: ${result.erased} erased, ${result.heldBack} held back by a legal hold, ${result.failed} failed.`)
      }
    } catch (error) {
      this.lastRun = 0
      this.logger.warn(`Guest retention sweep failed: ${String(error)}`)
    }
  }
}
