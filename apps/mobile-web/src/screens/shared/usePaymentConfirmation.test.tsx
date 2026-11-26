// The confirmation window itself: how often the unlock status is read again and how long it is awaited.
// The screens' tests move the clock by hand, so this is where the two durations are asserted.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { manualPaymentClock } from '../../../test/test-payment-clock'
import { PAYMENT_CONFIRM_TIMEOUT_MS, PAYMENT_POLL_INTERVAL_MS, PaymentClockProvider, usePaymentConfirmation } from './usePaymentConfirmation'

function confirmation(outcome: 'erfolg' | 'abbruch' | undefined, unlocked: boolean | undefined) {
  const clock = manualPaymentClock()
  const refetch = vi.fn()
  const hook = renderHook(() => usePaymentConfirmation({ outcome, unlocked, refetch }), {
    wrapper: ({ children }: { children: ReactNode }) => <PaymentClockProvider value={clock}>{children}</PaymentClockProvider>,
  })
  return { clock, refetch, hook }
}

describe('usePaymentConfirmation: the confirmation window', () => {
  it('reads the status every 2 seconds and gives up after 60 seconds', () => {
    expect(PAYMENT_POLL_INTERVAL_MS).toBe(2_000)
    expect(PAYMENT_CONFIRM_TIMEOUT_MS).toBe(60_000)
    const { clock } = confirmation('erfolg', false)
    expect(clock.requested).toEqual({ every: [PAYMENT_POLL_INTERVAL_MS], after: [PAYMENT_CONFIRM_TIMEOUT_MS] })
  })

  it('opens the same window again on a recheck after the timeout', () => {
    const { clock, refetch, hook } = confirmation('erfolg', false)
    clock.poll()
    expect(refetch).toHaveBeenCalledTimes(1)
    clock.expire()
    expect(hook.result.current.phase).toBe('timeout')
    expect(clock.polling).toBe(false)
    act(() => hook.result.current.recheck())
    expect(hook.result.current.phase).toBe('confirming')
    expect(clock.requested).toEqual({ every: [PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_INTERVAL_MS], after: [PAYMENT_CONFIRM_TIMEOUT_MS, PAYMENT_CONFIRM_TIMEOUT_MS] })
  })

  it.each([
    ['erfolg', true],
    ['abbruch', false],
    [undefined, false],
  ] as const)('schedules nothing when there is nothing to await (%s, unlocked %s)', (outcome, unlocked) => {
    const { clock } = confirmation(outcome, unlocked)
    expect(clock.requested).toEqual({ every: [], after: [] })
  })
})

const SRC = join(__dirname, '..', '..')

function productionSources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...productionSources(path))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith('test-')) out.push(path)
  }
  return out
}

describe('the payment clock is not part of any screen', () => {
  it('only the hook knows the clock: no screen takes one as a prop or provides one', () => {
    const users = productionSources(SRC)
      .filter((file) => /PaymentClock|PAYMENT_POLL_INTERVAL_MS|PAYMENT_CONFIRM_TIMEOUT_MS/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
    expect(users).toEqual(['screens/shared/usePaymentConfirmation.ts'])
  })
})
