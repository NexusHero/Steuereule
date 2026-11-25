import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@steuereule/api-client'
import { leaveOnSessionExpiry } from './sessionExpiryExit'
import { resetSessionExpiry, watchForSessionExpiry } from '../net/sessionExpiry'
import { rememberedReturnTo } from '../screens/funnel/sessionMemory'

afterEach(() => {
  resetSessionExpiry()
  sessionStorage.clear()
})

const expired = () => watchForSessionExpiry(new ApiError(401, { code: 'SESSION_EXPIRED' }))

/** WEB-24: the reaction of the app to 401 SESSION_EXPIRED, from whichever request reported it. */
describe('leaveOnSessionExpiry', () => {
  it('remembers the page, forgets the signed-in state and opens the sign-in, in that order', () => {
    const steps: string[] = []
    const stop = leaveOnSessionExpiry({
      currentPath: () => '/app/cockpit/rente/2025',
      forgetSignedInState: () => steps.push(`forget (return to ${rememberedReturnTo()})`),
      openSignIn: () => steps.push('sign-in'),
    })
    expired()
    expect(steps).toEqual(['forget (return to /app/cockpit/rente/2025)', 'sign-in'])
    stop()
  })

  it('reacts once to a burst of failing requests, and again after the next sign-in', () => {
    const openSignIn = vi.fn()
    const stop = leaveOnSessionExpiry({ currentPath: () => null, forgetSignedInState: vi.fn(), openSignIn })
    expired()
    expired()
    expect(openSignIn).toHaveBeenCalledTimes(1)
    resetSessionExpiry()
    expired()
    expect(openSignIn).toHaveBeenCalledTimes(2)
    stop()
  })

  it('remembers no place where there is none, and ignores a 401 that is not an expiry', () => {
    const openSignIn = vi.fn()
    const stop = leaveOnSessionExpiry({ currentPath: () => null, forgetSignedInState: vi.fn(), openSignIn })
    watchForSessionExpiry(new ApiError(401, { code: 'ACCOUNT_REQUIRED' }))
    expect(openSignIn).not.toHaveBeenCalled()
    expired()
    expect(rememberedReturnTo()).toBeNull()
    stop()
  })

  it('stops listening when unsubscribed', () => {
    const openSignIn = vi.fn()
    leaveOnSessionExpiry({ currentPath: () => null, forgetSignedInState: vi.fn(), openSignIn })()
    expired()
    expect(openSignIn).not.toHaveBeenCalled()
  })
})
