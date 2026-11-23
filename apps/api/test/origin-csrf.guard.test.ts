import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { OriginCsrfGuard } from '../src/auth/origin-csrf.guard.js'

// ADR-0103 vulnerability 1 — origin-based CSRF for the `/v1` controllers. The session cookie is
// SameSite=None (ADR-0011), so a cross-site page can send a credentialed request; CORS only stops it
// reading the reply. These prove the guard refuses a forged cross-site Origin and lets the real clients
// through — the control's "break it" proof (ADR-0021).

const TRUSTED = ['https://app.steuereule.de', 'https://allowed.example.com']

function makeContext(
  method: string,
  headers: Record<string, string | undefined> = {},
): ExecutionContext {
  const request = { method, headers }
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext
}

describe('OriginCsrfGuard', () => {
  const guard = new OriginCsrfGuard(TRUSTED)

  it('rejects a state-changing request from a disallowed Origin (the CSRF attack)', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const context = makeContext(method, { origin: 'https://evil.example.com' })
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    }
  })

  it('allows a state-changing request from a trusted Origin (the real web app)', () => {
    const context = makeContext('POST', { origin: 'https://allowed.example.com' })
    expect(guard.canActivate(context)).toBe(true)
  })

  it('allows a bearer-authenticated request regardless of Origin (the MCP/OAuth path carries no cookie)', () => {
    const context = makeContext('POST', { origin: 'https://evil.example.com', authorization: 'Bearer some-token' })
    expect(guard.canActivate(context)).toBe(true)
  })

  it('allows a state-changing request with no Origin header (a native app / server-to-server client)', () => {
    const context = makeContext('POST', {})
    expect(guard.canActivate(context)).toBe(true)
  })

  it('never blocks safe methods, even from a disallowed Origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const context = makeContext(method, { origin: 'https://evil.example.com' })
      expect(guard.canActivate(context)).toBe(true)
    }
  })

  it('a forged Origin does not get in by wearing a bearer-looking but non-Bearer Authorization header', () => {
    // Only a real `Bearer ` prefix exempts; `Basic`/garbage still faces the Origin check.
    const context = makeContext('POST', { origin: 'https://evil.example.com', authorization: 'Basic abc' })
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
  })
})
