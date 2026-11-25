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
  /** A dispute was opened (`offen`) and possibly won (`gewonnen`). A won dispute never reopens. */
  readonly dispute: 'offen' | 'gewonnen' | null
  /** The session closed without a payment. */
  readonly closed: boolean
}

export type UnlockFact =
  | { readonly kind: 'paid'; readonly at: Date }
  | { readonly kind: 'closed' }
  | { readonly kind: 'refunded'; readonly at: Date }
  | { readonly kind: 'disputed' }
  | { readonly kind: 'dispute-won' }

export const NO_UNLOCK_FACTS: UnlockFacts = { paidAt: null, refundedAt: null, dispute: null, closed: false }

export function applyUnlockFact(facts: UnlockFacts, fact: UnlockFact): UnlockFacts {
  switch (fact.kind) {
    case 'paid':
      return { ...facts, paidAt: facts.paidAt ?? fact.at }
    case 'closed':
      return { ...facts, closed: true }
    case 'refunded':
      return { ...facts, refundedAt: facts.refundedAt ?? fact.at }
    case 'disputed':
      return { ...facts, dispute: facts.dispute ?? 'offen' }
    case 'dispute-won':
      return { ...facts, dispute: 'gewonnen' }
  }
}

/** Only `bezahlt` unlocks: paid, not refunded, no dispute pending. */
export function unlockStatusOf(facts: UnlockFacts): UnlockRowStatus {
  if (facts.refundedAt !== null) return 'erstattet'
  if (facts.dispute === 'offen') return 'angefochten'
  if (facts.paidAt !== null) return 'bezahlt'
  return facts.closed ? 'abgelaufen' : 'offen'
}

/** The facts of a stored row; `abgelaufen` is how a closed session is stored. */
export function unlockFactsOf(row: { status: string; paidAt: Date | null; refundedAt: Date | null; dispute: string | null }): UnlockFacts {
  return {
    paidAt: row.paidAt,
    refundedAt: row.refundedAt,
    dispute: row.dispute === 'offen' || row.dispute === 'gewonnen' ? row.dispute : null,
    closed: row.status === 'abgelaufen',
  }
}
