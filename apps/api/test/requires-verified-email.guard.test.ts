import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { RequiresVerifiedEmailGuard } from '../src/auth/requires-verified-email.guard.js'
import { EMAIL_VERIFIED_REQUEST_KEY, USER_ID_KIND_REQUEST_KEY } from '../src/auth/user-context.guard.js'

// ADR-0103 vulnerability 4 — sign-up stays open to unverified accounts (guest-first onboarding, ADR-0012),
// so the cost is paid at the sensitive action: a session whose email is unverified is refused here.
function makeContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext
}

describe('RequiresVerifiedEmailGuard', () => {
  const guard = new RequiresVerifiedEmailGuard()

  it('refuses a signed-in session whose email is not verified (the gate)', () => {
    const context = makeContext({ [USER_ID_KIND_REQUEST_KEY]: 'session', [EMAIL_VERIFIED_REQUEST_KEY]: false })
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
  })

  it('allows a signed-in session whose email is verified', () => {
    const context = makeContext({ [USER_ID_KIND_REQUEST_KEY]: 'session', [EMAIL_VERIFIED_REQUEST_KEY]: true })
    expect(guard.canActivate(context)).toBe(true)
  })

  it('allows a bearer/assistant caller (it cannot verify an email itself; OAuth consent stands in)', () => {
    const context = makeContext({ [USER_ID_KIND_REQUEST_KEY]: 'bearer', [EMAIL_VERIFIED_REQUEST_KEY]: true })
    expect(guard.canActivate(context)).toBe(true)
  })

  it('does not block a guest here — RequiresAccount is what refuses a guest; this guard is a no-op for it', () => {
    const context = makeContext({ [USER_ID_KIND_REQUEST_KEY]: 'guest' })
    expect(guard.canActivate(context)).toBe(true)
  })
})
