import type { GuestActivityRepository } from './guest-activity.repository.js'

/** A guest id with no write for this long is erased (ADR-0109, the stakeholder's retention decision). */
export const GUEST_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const GUEST_SWEEP_INTERVAL_MS = 60 * 60 * 1000
/** Erasures per run: each is a transaction over ~40 tables, and a run rides on a request. */
export const GUEST_SWEEP_BATCH = 25
const CLAIM_RETRY_MS = 60 * 60 * 1000

/** Written by `UserContextGuard` when a guest changes something; at most one DB write an hour per guest. */
export const GUEST_ACTIVITY_RECORDER = Symbol('GUEST_ACTIVITY_RECORDER')

export interface GuestActivityRecorder {
  touch(guestUserId: string): Promise<void>
}

export class GuestActivityNotes implements GuestActivityRecorder {
  private readonly lastTouch = new Map<string, number>()

  /** Called after a successful touch; the retention service hangs its sweep here (ADR-0029: it rides on traffic). */
  afterTouch: (() => void) | undefined

  constructor(private readonly repository: GuestActivityRepository) {}

  async touch(guestUserId: string, now = Date.now()): Promise<void> {
    const previous = this.lastTouch.get(guestUserId)
    if (previous !== undefined && now - previous < GUEST_SWEEP_INTERVAL_MS) return
    await this.repository.touch(guestUserId, new Date(now))
    // Remembered only after the write succeeded, so a failed one is tried again by the next request.
    if (this.lastTouch.size >= 10_000) this.lastTouch.clear()
    this.lastTouch.set(guestUserId, now)
    this.afterTouch?.()
  }
}

export interface GuestSweepDeps {
  readonly repository: GuestActivityRepository
  /** The account-deletion path itself: crypto-shredding of the keys, the one transaction, legal holds (ADR-0013). */
  readonly erase: (userId: string) => Promise<{ readonly retainedUnderLegalHold: number }>
  /** Told why one erasure failed (the sweep goes on with the next). */
  readonly onError?: ((error: unknown) => void) | undefined
}

export interface GuestSweepResult {
  readonly erased: number
  readonly heldBack: number
  readonly failed: number
}

/**
 * Erases the data of guests with no write for `GUEST_RETENTION_DAYS`, through the account-deletion path, so a
 * guest's receipts lose their key exactly as an account's do and a legal hold keeps what it must.
 * An id with a User row is an account, never a guest: its clock row is dropped and nothing else is touched.
 * A guest is claimed first (the clock moves an hour ahead), so two instances do not erase the same one.
 */
export async function sweepInactiveGuests({ repository, erase, onError }: GuestSweepDeps, now = new Date()): Promise<GuestSweepResult> {
  const cutoff = new Date(now.getTime() - GUEST_RETENTION_DAYS * DAY_MS)
  let erased = 0
  let heldBack = 0
  let failed = 0
  for (const userId of await repository.dueBefore(cutoff, GUEST_SWEEP_BATCH)) {
    if (!(await repository.claim(userId, cutoff, new Date(cutoff.getTime() + CLAIM_RETRY_MS)))) continue
    try {
      if (await repository.isAccount(userId)) {
        await repository.drop(userId)
        continue
      }
      const result = await erase(userId)
      if (result.retainedUnderLegalHold > 0) {
        // Held data stays; the clock starts over and the hold is looked at again in 30 days.
        await repository.restart(userId, now)
        heldBack += 1
      } else {
        await repository.drop(userId)
        erased += 1
      }
    } catch (error) {
      onError?.(error)
      // The claim already moved the clock an hour ahead: the next run retries it.
      failed += 1
    }
  }
  return { erased, heldBack, failed }
}
