import type { GuestActivityRepository } from './guest-activity.repository.js'

/** A guest id with no write for this long is erased (ADR-0109, the stakeholder's retention decision). */
export const GUEST_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const GUEST_SWEEP_INTERVAL_MS = 60 * 60 * 1000
/** Erasures per batch: each is a transaction over ~40 tables, and a run rides on a request. */
export const GUEST_SWEEP_BATCH = 25
/**
 * Batches per run (API-9): a run goes on while guests are due, up to 20 batches = 500 erasures an hour per
 * process, against at most GUEST_CREATION_LIMIT (20) new guests an hour per address.
 */
export const GUEST_SWEEP_MAX_BATCHES = 20
export const GUEST_SWEEP_MAX_PER_RUN = GUEST_SWEEP_BATCH * GUEST_SWEEP_MAX_BATCHES
const CLAIM_RETRY_MS = 60 * 60 * 1000

/** Written by `UserContextGuard` when a guest changes something; at most one DB write an hour per guest. */
export const GUEST_ACTIVITY_RECORDER = Symbol('GUEST_ACTIVITY_RECORDER')

export interface GuestActivityRecorder {
  touch(guestUserId: string): Promise<void>
  /** Any request passed the guard: lets the sweep ride on ordinary traffic, not only on guest writes. */
  seen(): void
}

export class GuestActivityNotes implements GuestActivityRecorder {
  private readonly lastTouch = new Map<string, number>()

  /** Called on every guarded request; the retention service hangs its sweep here (ADR-0029: it rides on traffic). */
  afterTouch: (() => void) | undefined

  seen(): void {
    this.afterTouch?.()
  }

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
  const counts = { erased: 0, heldBack: 0, failed: 0 }
  const claimedTo = new Date(cutoff.getTime() + CLAIM_RETRY_MS)
  for (let batch = 0; batch < GUEST_SWEEP_MAX_BATCHES; batch += 1) {
    // A claimed guest's clock moved past the cutoff, so the next page holds the next guests.
    const due = await repository.dueBefore(cutoff, GUEST_SWEEP_BATCH)
    let claimed = 0
    for (const userId of due) {
      if (!(await repository.claim(userId, cutoff, claimedTo))) continue
      claimed += 1
      await sweepOne(userId, { repository, erase, onError }, claimedTo, now, counts)
    }
    // A short page is the last one; a page another instance claimed would only repeat itself.
    if (due.length < GUEST_SWEEP_BATCH || claimed === 0) break
  }
  return counts
}

async function sweepOne(
  userId: string,
  { repository, erase, onError }: GuestSweepDeps,
  claimedTo: Date,
  now: Date,
  counts: { erased: number; heldBack: number; failed: number },
): Promise<void> {
  try {
    if (await repository.isAccount(userId)) {
      await repository.drop(userId)
      return
    }
    // A guest who came back and wrote after the claim moved the clock to now: that guest is active again
    // and keeps the data. Checked right before the erasure, which cannot be taken back.
    if (!(await repository.stillClaimed(userId, claimedTo))) return
    const result = await erase(userId)
    if (result.retainedUnderLegalHold > 0) {
      // Held data stays; the clock starts over and the hold is looked at again in 30 days.
      await repository.restart(userId, now)
      counts.heldBack += 1
    } else {
      await repository.drop(userId)
      counts.erased += 1
    }
  } catch (error) {
    onError?.(error)
    // The claim already moved the clock an hour ahead: the next run retries it.
    counts.failed += 1
  }
}
