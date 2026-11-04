import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it } from 'vitest'
import { RequireScopeGuard } from '../src/auth/require-scope.guard.js'
import { AUTH_CONTEXT_REQUEST_KEY, type AuthContext } from '../src/auth/user-context.guard.js'

class DummyController {
  dummy = true
}

function makeContext(authContext?: AuthContext): ExecutionContext {
  const request = { [AUTH_CONTEXT_REQUEST_KEY]: authContext }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => {},
    getClass: () => DummyController,
  } as unknown as ExecutionContext
}

describe('RequireScopeGuard (ADR-0052 §2 / §4)', () => {
  it('admits a regular user session regardless of scopes', () => {
    const reflector = { getAllAndOverride: () => ['steuerdaten:read'] } as unknown as Reflector
    const guard = new RequireScopeGuard(reflector)
    expect(guard.canActivate(makeContext({ source: 'nutzer' }))).toBe(true)
  })

  it('admits an assistant that has the required scope', () => {
    const reflector = { getAllAndOverride: () => ['steuerdaten:read'] } as unknown as Reflector
    const guard = new RequireScopeGuard(reflector)
    const assistantContext: AuthContext = {
      source: 'assistent',
      clientId: 'c1',
      clientName: 'Claude',
      scopes: ['openid', 'steuerdaten:read', 'steuerdaten:write'],
    }
    expect(guard.canActivate(makeContext(assistantContext))).toBe(true)
  })

  it('rejects an assistant that lacks the required scope with 403 Forbidden', () => {
    const reflector = { getAllAndOverride: () => ['steuerdaten:write'] } as unknown as Reflector
    const guard = new RequireScopeGuard(reflector)
    const assistantContext: AuthContext = {
      source: 'assistent',
      clientId: 'c1',
      clientName: 'Claude',
      scopes: ['openid', 'steuerdaten:read'], // missing steuerdaten:write
    }
    expect(() => guard.canActivate(makeContext(assistantContext))).toThrow(ForbiddenException)
  })

  it('admits when no scope is required on the route', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector
    const guard = new RequireScopeGuard(reflector)
    const assistantContext: AuthContext = {
      source: 'assistent',
      clientId: 'c1',
      clientName: 'Claude',
      scopes: ['openid'],
    }
    expect(guard.canActivate(makeContext(assistantContext))).toBe(true)
  })
})
