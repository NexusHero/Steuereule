// Regression test for the auth-mount CORS defect Salih's local test caught (real
// cross-origin HTTP in a browser, not `.inject()` and not Node's own CORS-blind
// `fetch()`): `reply.hijack()` in mount-better-auth.ts bypasses Fastify's `onSend`
// hook chain entirely, so Nest's `app.enableCors(...)` (registered in src/main.ts,
// itself hooked via `onSend`) never gets a chance to decorate a *real* `/api/auth/*`
// response — unlike every ordinary Nest route (e.g. `/v1/profile`), which does carry
// the CORS headers because it's never hijacked.
//
// A naive OPTIONS-preflight check doesn't catch this: preflight is answered by a hook
// that runs before the route ever executes, so it looks correct regardless of what the
// route handler itself does. The defect only shows on the real GET/POST response
// through the hijacked route — asserted here against the actual `buildApp()` boot over
// a real socket (real Postgres required, same tier/style as req-005/006/009/010).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'auth-mount-cors-secret'
process.env.BETTER_AUTH_SECRET = 'auth-mount-cors-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39995'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const DISALLOWED_ORIGIN = 'https://not-allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

describe('CORS on the better-auth mount (/api/auth/*), against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('a real (non-OPTIONS) GET through the hijacked mount still carries the CORS headers Nest sets everywhere else', async () => {
    const response = await fetch(`${baseUrl}/api/auth/get-session`, {
      headers: { origin: ALLOWED_ORIGIN },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('vary')).toMatch(/Origin/i)
  })

  it('a real POST (sign-up) through the hijacked mount also carries the CORS headers', async () => {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ email: 'mount-cors@example.com', password: 'a-fine-strong-password-1', name: 'Mount Cors' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('a disallowed Origin gets no Access-Control-Allow-Origin header on the mount — fail-closed, never a wildcard or reflected origin', async () => {
    const response = await fetch(`${baseUrl}/api/auth/get-session`, {
      headers: { origin: DISALLOWED_ORIGIN },
    })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('no Origin header at all (a same-origin/non-browser caller) still gets a normal response, unaffected by the CORS fix', async () => {
    const response = await fetch(`${baseUrl}/api/auth/get-session`)

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})
