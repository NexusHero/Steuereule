import type { UnlockRowStatus } from './unlock.repository.js'

/**
 * What the payment provider told us about one checkout session. The provider does not deliver its events in
 * order and redelivers them, so a row does not store "the last event": it stores each fact once, every fact only
 * ever moves forward, and the status is computed from all of them. Any order and any repetition of the same
 * events therefore ends in the same status (`test/unlock-lifecycle.test.ts` runs every order).
 */
export interface UnlockFacts {
  /** The payment was confirmed. */
  readonly paidAt: Date | null
  /** The payment was refunded in full. Final: nothing brings the unlock back. */
  readonly refundedAt: Date | null
  /**
   * Each dispute by its provider id: opened (`offen`), and possibly won (`gewonnen`). A won dispute never
   * reopens, but a second, distinct dispute of the same payment locks the year again until it is won too.
   */
  readonly disputes: Readonly<Record<string, DisputeState>>
  /** The session closed without a payment. */
  readonly closed: boolean
}

export type UnlockFact =
  | { readonly kind: 'paid'; readonly at: Date }
  | { readonly kind: 'closed' }
  | { readonly kind: 'refunded'; readonly at: Date }
  | { readonly kind: 'disputed'; readonly disputeId: string }
  | { readonly kind: 'dispute-won'; readonly disputeId: string }

export type DisputeState = 'offen' | 'gewonnen'

/** A dispute stored before disputes had ids (one per row at most); the next won dispute closes it. */
export const LEGACY_DISPUTE_ID = 'legacy'

export const NO_UNLOCK_FACTS: UnlockFacts = { paidAt: null, refundedAt: null, disputes: {}, closed: false }

export function applyUnlockFact(facts: UnlockFacts, fact: UnlockFact): UnlockFacts {
  switch (fact.kind) {
    case 'paid':
      return { ...facts, paidAt: facts.paidAt ?? fact.at }
    case 'closed':
      return { ...facts, closed: true }
    case 'refunded':
      return { ...facts, refundedAt: facts.refundedAt ?? fact.at }
    case 'disputed':
      return { ...facts, disputes: { ...facts.disputes, [fact.disputeId]: facts.disputes[fact.disputeId] ?? 'offen' } }
    case 'dispute-won': {
      const disputes: Record<string, DisputeState> = { ...facts.disputes, [fact.disputeId]: 'gewonnen' }
      if (disputes[LEGACY_DISPUTE_ID] === 'offen') disputes[LEGACY_DISPUTE_ID] = 'gewonnen'
      return { ...facts, disputes }
    }
  }
}

/** Only `bezahlt` unlocks: paid, not refunded, no dispute pending. */
export function unlockStatusOf(facts: UnlockFacts): UnlockRowStatus {
  if (facts.refundedAt !== null) return 'erstattet'
  if (Object.values(facts.disputes).includes('offen')) return 'angefochten'
  if (facts.paidAt !== null) return 'bezahlt'
  return facts.closed ? 'abgelaufen' : 'offen'
}

/** The facts of a stored row; `abgelaufen` is how a closed session is stored. */
export function unlockFactsOf(row: { status: string; paidAt: Date | null; refundedAt: Date | null; disputes: unknown }): UnlockFacts {
  return {
    paidAt: row.paidAt,
    refundedAt: row.refundedAt,
    disputes: disputesOf(row.disputes),
    closed: row.status === 'abgelaufen',
  }
}

/** The stored dispute map; anything else in the column reads as no dispute. */
function disputesOf(stored: unknown): Readonly<Record<string, DisputeState>> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, DisputeState] => entry[1] === 'offen' || entry[1] === 'gewonnen'))
}
