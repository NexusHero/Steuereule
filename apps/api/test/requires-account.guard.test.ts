// #318 — RequiresAccountGuard, the route-scoped seam @RequiresAccount() applies. Pure
// unit test: constructs the guard directly (no constructor deps) and feeds it the
// exact request shape UserContextGuard would have already stamped.
//
// Red path (ADR-0021, #318 P3): remove @RequiresAccount() from a route and a guest
// caller is admitted — see test/interview.http.test.ts for that proof against the
// real controller wiring. This file proves the guard's own logic in isolation.
import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { RequiresAccountGuard } from '../src/auth/requires-account.guard.js'
import { GuestCannotUseThisEndpointError } from '../src/common/account-required.error.js'
import { USER_ID_KIND_REQUEST_KEY, USER_ID_REQUEST_KEY, type UserIdKind } from '../src/auth/user-context.guard.js'

function makeContext(kind: UserIdKind | undefined): ExecutionContext {
  const request = { [USER_ID_REQUEST_KEY]: 'some-user-id', [USER_ID_KIND_REQUEST_KEY]: kind }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('RequiresAccountGuard', () => {
  it('admits a real account session', () => {
    const guard = new RequiresAccountGuard()
    expect(guard.canActivate(makeContext('session'))).toBe(true)
  })

  it('admits a bearer token (OAuth 2.1 assistant access for an account)', () => {
    const guard = new RequiresAccountGuard()
    expect(guard.canActivate(makeContext('bearer'))).toBe(true)
  })

  it('rejects a guest with a GuestCannotUseThisEndpointError (401)', () => {
    const guard = new RequiresAccountGuard()
    expect(() => guard.canActivate(makeContext('guest'))).toThrow(GuestCannotUseThisEndpointError)
  })

  it('rejects a request with no identity kind at all (defensive: never admit by default)', () => {
    const guard = new RequiresAccountGuard()
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(GuestCannotUseThisEndpointError)
  })

  it('the thrown error is an unauthenticated ACCOUNT_REQUIRED error', () => {
    const guard = new RequiresAccountGuard()

    const act = () => guard.canActivate(makeContext('guest'))

    expect(act).toThrow(expect.objectContaining({ kind: 'unauthenticated', code: 'ACCOUNT_REQUIRED' }))
  })
})
