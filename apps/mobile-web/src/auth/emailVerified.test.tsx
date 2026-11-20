import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }))
vi.mock('./useAccountSession', () => ({ useAccountSession: () => ({ state: session.state }) }))

import { useEmailVerified } from './useEmailVerified'

const signedIn = (email: string, emailVerified: boolean) => ({ status: 'signed-in', session: { user: { email, emailVerified } } })

describe('useEmailVerified', () => {
  it('is true only for a verified address of the signed-in account', () => {
    session.state = signedIn('anna@example.com', true)
    expect(renderHook(() => useEmailVerified('anna@example.com')).result.current).toBe(true)
  })

  it('is false for another address, an unverified one, no address, or no session', () => {
    session.state = signedIn('anna@example.com', true)
    expect(renderHook(() => useEmailVerified('other@example.com')).result.current).toBe(false)
    expect(renderHook(() => useEmailVerified(undefined)).result.current).toBe(false)
    session.state = signedIn('anna@example.com', false)
    expect(renderHook(() => useEmailVerified('anna@example.com')).result.current).toBe(false)
    session.state = { status: 'signed-out' }
    expect(renderHook(() => useEmailVerified('anna@example.com')).result.current).toBe(false)
  })
})
