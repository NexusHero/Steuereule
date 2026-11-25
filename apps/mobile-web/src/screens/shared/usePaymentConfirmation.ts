import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaymentReturn } from '@steuereule/core'

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

export interface PaymentConfirmationOptions {
  /** The outcome the route carried, from the shared return contract. */
  readonly outcome: PaymentReturn | undefined
  /** Whether the year is unlocked; undefined while the status is still loading. */
  readonly unlocked: boolean | undefined
  /** Reads the unlock status again. */
  readonly refetch: () => unknown
  readonly intervalMs?: number
  readonly timeoutMs?: number
}

export const PAYMENT_POLL_INTERVAL_MS = 2_000
export const PAYMENT_CONFIRM_TIMEOUT_MS = 60_000

/** The phase, and `recheck` to start a fresh confirmation window (after a timeout). */
export function usePaymentConfirmation({
  outcome,
  unlocked,
  refetch,
  intervalMs = PAYMENT_POLL_INTERVAL_MS,
  timeoutMs = PAYMENT_CONFIRM_TIMEOUT_MS,
}: PaymentConfirmationOptions): { readonly phase: PaymentPhase; readonly recheck: () => void } {
  const [timedOut, setTimedOut] = useState(false)
  const [round, setRound] = useState(0)
  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  const waiting = outcome === 'erfolg' && unlocked !== true && !timedOut

  useEffect(() => {
    if (!waiting) return
    const poll = setInterval(() => void refetchRef.current(), intervalMs)
    const stop = setTimeout(() => setTimedOut(true), timeoutMs)
    return () => {
      clearInterval(poll)
      clearTimeout(stop)
    }
  }, [waiting, intervalMs, timeoutMs, round])

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

/**
 * Why a checkout start was refused, from either shape the API client has: a response `{ status, data }`
 * or a thrown error `{ status, body }` / `{ status, code }`. `other` for anything not named here.
 */
export type CheckoutRefusal = 'already-paid' | 'pending' | 'throttled' | 'other'

export function checkoutRefusalOf(source: unknown): CheckoutRefusal {
  const record = source !== null && typeof source === 'object' ? (source as Record<string, unknown>) : {}
  const body = (record.body ?? record.data) as Record<string, unknown> | null | undefined
  const code = typeof record.code === 'string' ? record.code : body !== null && typeof body === 'object' && typeof body.code === 'string' ? body.code : null
  if (code === 'ALREADY_PAID') return 'already-paid'
  if (code === 'PAYMENT_PENDING') return 'pending'
  if (record.status === 429) return 'throttled'
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
