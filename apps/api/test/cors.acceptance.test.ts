// CORS acceptance test (ADR-0011, issue #57) — asserts against the **running** server over
// real HTTP (a real socket via `app.listen()` + `fetch`), never `.inject()`. `.inject()`
// dispatches a synthetic request straight into Fastify's router and is how every other test
// in this package proves the HTTP contract, but CORS is enforced by the browser reading
// response headers off a real network round-trip — the acceptance criterion (#57) and
// ADR-0011 both call out that this must be checked against the real listening server.
//
// Uses the same fake-repository provider overrides as test/support/build-test-app.ts (no
// live Postgres needed) but adds `app.enableCors(...)` (importing the exact same
// `buildCorsOptions()` src/main.ts uses — see its header comment) and calls
// `app.listen(0)` for a real ephemeral port instead of just `.inject()`.
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { AUDIT_REPOSITORY } from '../src/audit/audit.repository.js'
import { validationExceptionFactory } from '../src/common/validation-exception-factory.js'
import { buildCorsOptions } from '../src/cors/build-cors-options.js'
import { ENCRYPTED_PRISMA } from '../src/prisma/encrypted-prisma.provider.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { PROFILE_REPOSITORY } from '../src/profile/profile.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const DISALLOWED_ORIGIN = 'https://not-allowed.example.com'

process.env.GUEST_SESSION_SECRET = 'cors-acceptance-test-secret'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

async function bootRealServer(): Promise<{ app: NestFastifyApplication; baseUrl: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PROFILE_REPOSITORY)
    .useValue(new FakeProfileRepository())
    .overrideProvider(AUDIT_REPOSITORY)
    .useValue(new FakeAuditRepository())
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(ENCRYPTED_PRISMA)
    .useValue({})
    .compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })

  // Imports the exact same options object src/main.ts's `app.enableCors(...)` uses — see
  // build-cors-options.ts's header comment for why this stopped being a hand-mirrored
  // copy (steuereule#153, F4).
  app.enableCors(buildCorsOptions(process.env))

  await app.register(fastifyCookie)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  await app.init()
  // A real socket, not `.inject()` — 0 binds an ephemeral free port.
  await app.listen(0, '127.0.0.1')
  const baseUrl = await app.getUrl()

  return { app, baseUrl }
}

describe('CORS — credentialed cross-origin (ADR-0011, #57), against the running server', () => {
  let app: NestFastifyApplication
  let baseUrl: string

  beforeEach(async () => {
    const booted = await bootRealServer()
    app = booted.app
    baseUrl = booted.baseUrl
  })

  afterEach(async () => {
    await app.close()
  })

  it('an allow-listed Origin gets a 2xx with the matched Access-Control-Allow-Origin and Allow-Credentials: true', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'GET',
      headers: { Origin: ALLOWED_ORIGIN },
    })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  // Regression test — found live via a real cross-origin browser QA pass on the
  // Datenschutz screen's export download (REQ-011/ADR-0013, steuereule#152):
  // `Content-Disposition` is not one of the CORS-safelisted response headers a browser
  // exposes to page JS by default, so `exportDownload.ts`'s filename read silently fell
  // back to a generic name on every real cross-origin deployment — invisible to
  // `curl`/Node's `fetch()`, which never enforce CORS (same lesson as #106/#108).
  it('Access-Control-Expose-Headers includes Content-Disposition for an allow-listed Origin', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'GET',
      headers: { Origin: ALLOWED_ORIGIN },
    })

    const exposedHeaders = (response.headers.get('access-control-expose-headers') ?? '').toLowerCase()
    expect(exposedHeaders).toContain('content-disposition')
  })

  it('a disallowed Origin gets no Access-Control-Allow-Origin header — refused, never a wildcard or a reflected origin', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'GET',
      headers: { Origin: DISALLOWED_ORIGIN },
    })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('the guest-session Set-Cookie carries SameSite=None; Secure (ADR-0011/ADR-0007) so it survives the cross-origin credentialed request', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'GET',
      headers: { Origin: ALLOWED_ORIGIN },
    })

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toMatch(/SameSite=None/i)
    expect(setCookie).toMatch(/Secure/i)
  })

  // Regression test — Salih's live cross-origin re-test caught that @fastify/cors@11.2.0's
  // default `methods: 'GET,HEAD,POST'` (main.ts's enableCors() never overrode it) never
  // includes PUT, so a credentialed cross-origin `PUT /v1/profile` (Onboarding save,
  // guest→account upgrade, the Profil screen) fails the browser's preflight — invisible to
  // `.inject()`-level tests, which never run a real preflight/CORS check at all.
  it('an OPTIONS preflight for PUT /v1/profile from an allow-listed Origin includes PUT in Access-Control-Allow-Methods', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    const allowedMethods = response.headers.get('access-control-allow-methods') ?? ''
    const methods = allowedMethods.split(',').map((method) => method.trim())
    expect(methods).toContain('PUT')
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
  })

  it('a disallowed Origin still gets no Access-Control-Allow-Origin on an OPTIONS preflight for PUT — fail-closed, regardless of the methods list', async () => {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'OPTIONS',
      headers: {
        Origin: DISALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('a real credentialed cross-origin PUT /v1/profile from an allow-listed Origin succeeds end-to-end', async () => {
    // First establish a guest session (mints the httpOnly cookie), exactly as the web
    // app's onboarding save flow would after an initial GET.
    const getResponse = await fetch(`${baseUrl}/v1/profile`, {
      method: 'GET',
      headers: { Origin: ALLOWED_ORIGIN },
    })
    const setCookie = getResponse.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    const guestCookie = (setCookie as string).split(';')[0] ?? ''
    expect(guestCookie).toBeTruthy()

    const putResponse = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
        Cookie: guestCookie,
      },
      body: JSON.stringify({ firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358' }),
    })

    expect(putResponse.status).toBe(200)
    expect(putResponse.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(putResponse.headers.get('access-control-allow-credentials')).toBe('true')
  })
})
