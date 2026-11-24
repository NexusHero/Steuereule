export const GUEST_ACTIVITY_REPOSITORY = Symbol('GUEST_ACTIVITY_REPOSITORY')

/** The retention clock of guests (ADR-0109): when each guest id last wrote anything. */
export interface GuestActivityRepository {
  /** Sets the guest's clock to `at`, creating it on the first write. */
  touch(guestUserId: string, at: Date): Promise<void>
  /** Guest ids whose clock is before `cutoff`, oldest first. */
  dueBefore(cutoff: Date, limit: number): Promise<string[]>
  /** Moves the clock to `to` only if it is still before `cutoff`; true for the one caller that got it. */
  claim(guestUserId: string, cutoff: Date, to: Date): Promise<boolean>
  /** Sets the clock (a legal hold looks again in 30 days). */
  restart(guestUserId: string, at: Date): Promise<void>
  /** Drops the clock row of an erased guest. */
  drop(guestUserId: string): Promise<void>
  /** Whether the id belongs to an account: an account is never a guest. */
  isAccount(userId: string): Promise<boolean>
}
