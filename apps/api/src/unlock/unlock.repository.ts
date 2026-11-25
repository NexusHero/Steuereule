import type { RevokeReason, SessionOwner } from './payment-provider.js'

export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

/**
 * The price paid (ADR-0101 §21): `standard` opens the printout; `selbststaendig`, the higher one, opens a
 * year with self-employment (fill-in help, exports) and everything `standard` opens.
 */
export type UnlockTier = 'standard' | 'selbststaendig'

/**
 * `offen` (session created), `abgelaufen` (closed unpaid), `bezahlt`, `erstattet` (full refund), `angefochten`
 * (dispute pending). Only `bezahlt` unlocks. The status is computed from the stored facts
 * (`unlock-lifecycle.ts`), so the provider's events may arrive in any order and more than once.
 */
export type UnlockRowStatus = 'offen' | 'bezahlt' | 'abgelaufen' | 'erstattet' | 'angefochten'

export interface UnlockRepository {
  /** Idempotent per session id: a second call for the same session changes nothing. */
  createOpenOnes(userId: string, taxYear: number, sessionId: string, tier?: UnlockTier): Promise<void>
  /** The open sessions of the year at exactly `tier`, newest first. */
  openSessions(userId: string, taxYear: number, tier: UnlockTier): Promise<string[]>
  /** How many sessions were ever recorded for the year at `tier`: the attempt number of the next one. */
  countSessions(userId: string, taxYear: number, tier: UnlockTier): Promise<number>
  /**
   * Marks the session paid. Without a local row (it could not be written after the session was created)
   * the row is rebuilt from `owner`, so a payment never lands without a record (API-4).
   */
  markPaid(sessionId: string, amountCents: number | null, am: Date, owner?: SessionOwner): Promise<void>
  /** A session that closed unpaid (expired, or its asynchronous payment failed). */
  markClosed(sessionId: string): Promise<void>
  /**
   * A session refunded in full or disputed: it does not unlock, also when this arrives before the payment's
   * own event. Like `markPaid`, a missing row is rebuilt from `owner`.
   */
  revoke(sessionId: string, reason: RevokeReason, owner?: SessionOwner): Promise<void>
  /** That dispute was won: the session unlocks again once (or if) it is paid, not refunded, and no other dispute is open. */
  restore(sessionId: string, disputeId: string, owner?: SessionOwner): Promise<void>
  /** Paid for at least `tier` (default `standard`). */
  isPaid(userId: string, taxYear: number, tier?: UnlockTier): Promise<boolean>
}
