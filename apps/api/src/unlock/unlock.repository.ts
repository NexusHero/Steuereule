import type { SessionOwner } from './payment-provider.js'

export const UNLOCK_REPOSITORY = Symbol('UNLOCK_REPOSITORY')

/**
 * The price paid (ADR-0101 §21): `standard` opens the printout; `selbststaendig`, the higher one, opens a
 * year with self-employment (fill-in help, exports) and everything `standard` opens.
 */
export type UnlockTier = 'standard' | 'selbststaendig'

/**
 * A row's life: `offen` (session created) → `bezahlt` (webhook); `offen` → `abgelaufen` (the session
 * closed unpaid); `bezahlt` → `erstattet` | `angefochten` (refund, dispute); `angefochten` → `bezahlt`
 * (dispute won). Only `bezahlt` unlocks.
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
  /** An open session that closed unpaid. */
  markClosed(sessionId: string): Promise<void>
  /** A paid session refunded or disputed: it no longer unlocks. */
  revoke(sessionId: string, reason: 'erstattet' | 'angefochten'): Promise<void>
  /** A disputed session whose dispute was won: it unlocks again. */
  restore(sessionId: string): Promise<void>
  /** Paid for at least `tier` (default `standard`). */
  isPaid(userId: string, taxYear: number, tier?: UnlockTier): Promise<boolean>
}
