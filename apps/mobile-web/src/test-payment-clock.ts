import { act } from '@testing-library/react'
import type { PaymentClock } from './screens/shared/usePaymentConfirmation'

export interface ManualPaymentClock extends PaymentClock {
  /** Runs every status poll that is scheduled now. */
  poll(): void
  /** Lets the confirmation window run out now. */
  expire(): void
  /** Whether a confirmation window is open (it polls). */
  readonly polling: boolean
  /** Every delay the hook asked for, in the order it asked: the poll intervals and the timeouts. */
  readonly requested: { readonly every: readonly number[]; readonly after: readonly number[] }
}

/**
 * The payment confirmation's clock, moved by the test (WEB-1, WEB-35): polls and the timeout happen when the
 * test says, never after an amount of wall clock, so a slow runner cannot skip a state the test asserts.
 * The delays the hook asks for are recorded, so the length of the window is asserted without waiting for it.
 */
export function manualPaymentClock(): ManualPaymentClock {
  const polls = new Set<() => void>()
  const timeouts = new Set<() => void>()
  const requested = { every: [] as number[], after: [] as number[] }
  return {
    requested,
    every: (ms, run) => {
      requested.every.push(ms)
      polls.add(run)
      return () => {
        polls.delete(run)
      }
    },
    after: (ms, run) => {
      requested.after.push(ms)
      timeouts.add(run)
      return () => {
        timeouts.delete(run)
      }
    },
    poll: () => {
      act(() => {
        for (const run of Array.from(polls)) run()
      })
    },
    expire: () => {
      act(() => {
        for (const run of Array.from(timeouts)) run()
      })
    },
    get polling() {
      return polls.size > 0
    },
  }
}
