// WEB-9: the confirmed notices of the pre-filing check survive the Stripe round trip (a full page load in
// the same tab) and a reload; signing out clears them.
import { afterEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import type { Notice } from '@steuereule/core'
import { SUBMISSION_GATE_STORAGE_KEY, SubmissionGateProvider, useSubmissionGate, type SubmissionGateValue } from './SubmissionGateContext'

const NOTICES = [{ kind: 'a' }, { kind: 'b' }] as unknown as readonly Notice[]
const KINDS = NOTICES.map((notice) => notice.kind)

function mount(): { gate: () => SubmissionGateValue; unmount: () => void } {
  let current: SubmissionGateValue | null = null
  function Probe() {
    current = useSubmissionGate()
    return null
  }
  const { unmount } = render(
    <SubmissionGateProvider>
      <Probe />
    </SubmissionGateProvider>,
  )
  return { gate: () => current!, unmount }
}

afterEach(() => sessionStorage.clear())

describe('SubmissionGateProvider (WEB-9)', () => {
  it('keeps the confirmations across a new page load in the same tab', () => {
    const first = mount()
    act(() => first.gate().confirmNotices(2025, KINDS))
    expect(first.gate().areNoticesConfirmed(2025, NOTICES)).toBe(true)
    first.unmount()

    // The app boots again after the return from Stripe.
    const second = mount()
    expect(second.gate().areNoticesConfirmed(2025, NOTICES)).toBe(true)
    expect(second.gate().areNoticesConfirmed(2024, NOTICES)).toBe(false)
  })

  it('signing out clears them, also for the next load', () => {
    const first = mount()
    act(() => first.gate().confirmNotices(2025, KINDS))
    act(() => first.gate().resetSubmissionGate())
    expect(first.gate().areNoticesConfirmed(2025, NOTICES)).toBe(false)
    first.unmount()
    expect(sessionStorage.getItem(SUBMISSION_GATE_STORAGE_KEY)).toBeNull()
    expect(mount().gate().areNoticesConfirmed(2025, NOTICES)).toBe(false)
  })

  it('a damaged stored value is ignored, not trusted', () => {
    sessionStorage.setItem(SUBMISSION_GATE_STORAGE_KEY, '{"2025": "a", "x": ["a"]')
    expect(mount().gate().areNoticesConfirmed(2025, NOTICES)).toBe(false)
    sessionStorage.setItem(SUBMISSION_GATE_STORAGE_KEY, JSON.stringify({ 2025: 'a', abcd: ['a', 'b'] }))
    expect(mount().gate().areNoticesConfirmed(2025, NOTICES)).toBe(false)
  })
})
