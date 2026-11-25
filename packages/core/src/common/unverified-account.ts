import { RETENTION } from './product-limits'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ADR-0030 §3a: the earliest moment the sweep may delete a never-verified account. Thirty days after
 * registration, and seven days after the recorded warning; a warning not sent yet goes out no sooner than now,
 * so its seven days count from now. The sweep runs on traffic (ADR-0029), so this is a floor, never an
 * appointment: the app says "frühestens am".
 */
export function unverifiedDeletionNotBefore(createdAt: Date, warningSentAt: Date | null, now: Date): Date {
  const afterRegistration = createdAt.getTime() + RETENTION.unverifiedAccountDays * DAY_MS
  const afterWarning = (warningSentAt ?? now).getTime() + RETENTION.unverifiedWarningDays * DAY_MS
  return new Date(Math.max(afterRegistration, afterWarning))
}
