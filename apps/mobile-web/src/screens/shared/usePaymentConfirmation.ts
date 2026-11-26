import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PaymentReturn } from '@steuereule/core'
import { classifyApiFailure } from '../../net/apiFailure'

/**
 * Where the user stands after the payment return trip (WEB-1, WEB-35), the same on the printout and on
 * the ELSTER page:
 * - `none`: not back from a checkout, or back from a cancel on a year that is paid anyway;
 * - `confirming`: back with success, the webhook has not unlocked the year yet; the status is polled;
 * - `paid`: back with success and the year is unlocked;
 * - `cancelled`: back from a cancel, nothing paid;
 * - `timeout`: back with success, but the unlock did not arrive in time.
 */
export type PaymentPhase = 'none' | 'confirming' | 'paid' | 'cancelled' | 'timeout'

/** Schedules the status polls and the timeout; each call returns its cancel. The real clock outside tests. */
export interface PaymentClock {
  every(ms: number, run: () => void): () => void
  after(ms: number, run: () => void): () => void
}

export const REAL_PAYMENT_CLOCK: PaymentClock = {
  every: (ms, run) => {
    const id = setInterval(run, ms)
    return () => clearInterval(id)
  },
  after: (ms, run) => {
    const id = setTimeout(run, ms)
    return () => clearTimeout(id)
  },
}

/**
 * The clock the payment confirmation schedules on: the real one unless a provider further up supplies another.
 * The screens take no clock; whoever needs to move time wraps them in `PaymentClockProvider`.
 */
const PaymentClockContext = createContext<PaymentClock>(REAL_PAYMENT_CLOCK)
export const PaymentClockProvider = PaymentClockContext.Provider

export interface PaymentConfirmationOptions {
  /** The outcome the route carried, from the shared return contract. */
  readonly outcome: PaymentReturn | undefined
  /** Whether the year is unlocked; undefined while the status is still loading. */
  readonly unlocked: boolean | undefined
  /** Reads the unlock status again. */
  readonly refetch: () => unknown
}

/** How often the unlock status is read again after a successful return, and how long it is awaited. */
export const PAYMENT_POLL_INTERVAL_MS = 2_000
export const PAYMENT_CONFIRM_TIMEOUT_MS = 60_000

/** The phase, and `recheck` to start a fresh confirmation window (after a timeout). */
export function usePaymentConfirmation({ outcome, unlocked, refetch }: PaymentConfirmationOptions): { readonly phase: PaymentPhase; readonly recheck: () => void } {
  const clock = useContext(PaymentClockContext)
  const [timedOut, setTimedOut] = useState(false)
  const [round, setRound] = useState(0)
  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  const waiting = outcome === 'erfolg' && unlocked !== true && !timedOut

  useEffect(() => {
    if (!waiting) return
    const stopPolling = clock.every(PAYMENT_POLL_INTERVAL_MS, () => void refetchRef.current())
    const stopTimeout = clock.after(PAYMENT_CONFIRM_TIMEOUT_MS, () => setTimedOut(true))
    return () => {
      stopPolling()
      stopTimeout()
    }
  }, [waiting, clock, round])

  const recheck = useCallback(() => {
    setTimedOut(false)
    setRound((n) => n + 1)
    void refetchRef.current()
  }, [])

  let phase: PaymentPhase = 'none'
  if (outcome === 'erfolg') phase = unlocked === true ? 'paid' : timedOut ? 'timeout' : 'confirming'
  else if (outcome === 'abbruch' && unlocked !== true) phase = 'cancelled'
  return { phase, recheck }
}

/** Why a checkout start was refused, read from the rejected request. `other` for anything not named here. */
export type CheckoutRefusal = 'already-paid' | 'pending' | 'throttled' | 'not-configured' | 'other'

/** The codes of the API's 503 when payment, or the tier asked for, is not set up in this environment. */
const NOT_CONFIGURED = new Set(['PAYMENT_NOT_CONFIGURED', 'PAYMENT_TIER_NOT_CONFIGURED'])

export function checkoutRefusalOf(error: unknown): CheckoutRefusal {
  const failure = classifyApiFailure(error)
  if (failure.code === 'ALREADY_PAID') return 'already-paid'
  if (failure.code === 'PAYMENT_PENDING') return 'pending'
  if (failure.kind === 'rate-limited') return 'throttled'
  if (failure.code !== undefined && NOT_CONFIGURED.has(failure.code)) return 'not-configured'
  return 'other'
}

/** A price from the unlock status as German money text, e.g. „34,99 €“; null when there is none. */
export function priceText(price: { readonly amountCents: number; readonly currency: string } | null | undefined): string | null {
  if (!price) return null
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: price.currency.toUpperCase() }).format(price.amountCents / 100)
  } catch {
    return null
  }
}
