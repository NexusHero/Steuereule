import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { ForbidAssistantGuard } from '../src/auth/forbid-assistant.guard.js'
import { AUTH_CONTEXT_REQUEST_KEY, type AuthContext } from '../src/auth/user-context.guard.js'

function makeContext(authContext?: AuthContext): ExecutionContext {
  const request = { [AUTH_CONTEXT_REQUEST_KEY]: authContext }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('ForbidAssistantGuard (ADR-0052 §4 / Harte Regel 6)', () => {
  const guard = new ForbidAssistantGuard()

  it('admits a regular human user session', () => {
    expect(guard.canActivate(makeContext({ source: 'nutzer' }))).toBe(true)
  })

  it('rejects an assistant token with 403 Forbidden', () => {
    const assistantContext: AuthContext = {
      source: 'assistent',
      clientId: 'c1',
      clientName: 'Claude',
      scopes: ['openid', 'steuerdaten:read'],
    }
    expect(() => guard.canActivate(makeContext(assistantContext))).toThrow(ForbiddenException)
  })

  it('admits requests where no authContext was set (defensive, fallback to normal route processing)', () => {
    expect(guard.canActivate(makeContext(undefined))).toBe(true)
  })
})
