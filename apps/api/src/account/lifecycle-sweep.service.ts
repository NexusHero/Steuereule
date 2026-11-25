import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { EMAIL_SENDER, type EmailSender } from '../auth/email-sender.js'
import { LoggingEmailSender } from '../auth/logging-email-sender.js'
import { resolveWebAppUrl } from '../auth/better-auth-env.js'
import { GUEST_ACTIVITY_RECORDER, type GuestActivityNotes } from '../guest/guest-retention.js'
import { ACCOUNT_DELETION_REPOSITORY, type AccountDeletionRepository } from './account-deletion.repository.js'
import { LIFECYCLE_SWEEP_REPOSITORY, type LifecycleSweepRepository } from './lifecycle-sweep.repository.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Runs the lifecycle sweeps (P7) the way the guest sweep runs (ADR-0029, ADR-0109): on traffic, never on a
 * timer (Cloud Run scales to zero), each at most once per interval and process, never failing the request.
 * Hourly: ended legal holds and the never-verified accounts (ADR-0030). Daily: ended login records and the
 * access log's retention.
 */
@Injectable()
export class LifecycleSweepService implements OnModuleInit {
  private readonly logger = new Logger(LifecycleSweepService.name)
  private lastHourly = 0
  private lastDaily = 0

  constructor(
    @Inject(LIFECYCLE_SWEEP_REPOSITORY) private readonly sweeps: LifecycleSweepRepository,
    @Inject(ACCOUNT_DELETION_REPOSITORY) private readonly deletion: AccountDeletionRepository,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(GUEST_ACTIVITY_RECORDER) private readonly notes: GuestActivityNotes,
  ) {}

  onModuleInit(): void {
    // The guest sweep hangs on the same hook; both ride on it.
    const previous = this.notes.afterTouch
    this.notes.afterTouch = () => {
      previous?.()
      void this.run()
    }
  }

  async run(now = new Date()): Promise<void> {
    if (now.getTime() - this.lastHourly >= HOUR_MS) {
      this.lastHourly = now.getTime()
      await this.step('legal holds', () => this.sweeps.sweepEndedLegalHolds((userId) => this.deletion.deleteAccount(userId), now))
      await this.step('unverified accounts', () =>
        this.sweeps.sweepUnverifiedAccounts(
          {
            email: this.email,
            // ADR-0030 activation gate: no deletion on the strength of a warning that only reached a log.
            mailIsDelivered: !(this.email instanceof LoggingEmailSender),
            signInUrl: `${resolveWebAppUrl()}/login`,
            eraseUnverified: (userId) => this.deletion.deleteUnverifiedAccount(userId),
          },
          now,
        ),
      )
    }
    if (now.getTime() - this.lastDaily >= DAY_MS) {
      this.lastDaily = now.getTime()
      await this.step('ended login records', () => this.sweeps.sweepEndedLoginRecords(now))
      await this.step('access log retention', () => this.sweeps.sweepOldAuditRows(now))
    }
  }

  private async step(name: string, run: () => Promise<unknown>): Promise<void> {
    try {
      const result = await run()
      this.logger.log(`Lifecycle sweep (${name}): ${JSON.stringify(result)}`)
    } catch (error) {
      this.logger.warn(`Lifecycle sweep (${name}) failed: ${String(error)}`)
    }
  }
}
