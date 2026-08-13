// registerClientAddressStamp (#350) — the thin Fastify adapter half of the
// IP-resolution seam. A real Fastify instance via `.inject()` (light-my-request
// never opens a real socket, but that's fine here: this test's whole point is
// proving the write lands on `request.raw.headers`, the exact object
// `mount-better-auth.ts` hands better-auth — not whether a real socket's `request.ip`
// is populated correctly, which the acceptance-tier real-boot tests cover instead).
//
// The specific defect this guards against (Musti's #350 finding): Fastify 5's
// `request.headers` SETTER stores into `additionalHeaders`
// (fastify@5.10.0/lib/request.js:276-285), which the GETTER merges back in for
// anyone reading `request.headers` — but which never reaches `request.raw.headers`.
// A stamp written via `request.headers[...] = value` would pass a test that only
// ever reads back through `request.headers`, while remaining invisible to
// better-auth. Every assertion below reads `request.raw.headers` directly, the one
// object that actually matters.
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { CLIENT_ADDRESS_HEADER } from '../src/auth/client-address.js'
import { registerClientAddressStamp } from '../src/auth/stamp-client-address.js'

async function buildTestApp(trustedProxies: string[]): Promise<{ app: FastifyInstance; rawHeadersSeen: () => Record<string, unknown> | undefined }> {
  const app = Fastify()
  let rawHeadersSeen: Record<string, unknown> | undefined
  registerClientAddressStamp(app, { trustedProxies })
  // oxlint's `no-async-endpoint-handlers` is an Express-specific heuristic (Express
  // does not await a handler's returned promise) that pattern-matches on any
  // `<x>.<verb>('/path', async ...)` call regardless of framework — this is Fastify,
  // whose router DOES await an async handler's returned promise natively (the whole
  // reason every route in this codebase, including mount-better-auth.ts's own, is
  // written this way). False positive for this framework, not a real risk here.
  // oxlint-disable-next-line no-async-endpoint-handlers
  app.all('/probe', async (request) => {
    // Deliberately `request.raw.headers`, never `request.headers` — this route
    // stands in for what better-auth's `toNodeHandler` actually receives
    // (`request.raw`), so a test reading `request.headers` here could not have
    // caught the trap at all.
    rawHeadersSeen = { ...request.raw.headers }
    return { ok: true }
  })
  await app.ready()
  return { app, rawHeadersSeen: () => rawHeadersSeen }
}

describe('registerClientAddressStamp', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('writes CLIENT_ADDRESS_HEADER onto request.raw.headers — not merely request.headers', async () => {
    const built = await buildTestApp([])
    app = built.app

    const response = await app.inject({ method: 'GET', url: '/probe' })
    expect(response.statusCode).toBe(200)

    const rawHeaders = built.rawHeadersSeen()
    // light-my-request's injected socket peer is '127.0.0.1' — asserted as a fact,
    // not assumed, since that's exactly what `resolveClientAddress` is handed as
    // `peer` here.
    expect(rawHeaders?.[CLIENT_ADDRESS_HEADER]).toBe('127.0.0.1')
  })

  it('OVERWRITES a caller-supplied value under the same header name — never appended, never trusted', async () => {
    const built = await buildTestApp([])
    app = built.app

    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { [CLIENT_ADDRESS_HEADER]: '203.0.113.66' },
    })
    expect(response.statusCode).toBe(200)

    const rawHeaders = built.rawHeadersSeen()
    expect(rawHeaders?.[CLIENT_ADDRESS_HEADER]).toBe('127.0.0.1')
    expect(rawHeaders?.[CLIENT_ADDRESS_HEADER]).not.toBe('203.0.113.66')
  })

  it('with a trusted proxy configured, appends the peer to a received x-forwarded-for chain', async () => {
    const built = await buildTestApp(['10.0.0.0/24'])
    app = built.app

    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.50' },
    })
    expect(response.statusCode).toBe(200)

    const rawHeaders = built.rawHeadersSeen()
    expect(rawHeaders?.[CLIENT_ADDRESS_HEADER]).toBe('198.51.100.1, 203.0.113.50, 127.0.0.1')
  })

  // The trap, proven directly: a stamp written the WRONG way (through the Fastify
  // `request.headers` setter) passes when read back through `request.headers` but
  // never reaches `request.raw.headers` — the exact "declared, not connected" shape
  // this file's header comment describes. Not a test of production code (there is
  // none left in this shape to test) — a permanent control-proof that the class of
  // bug stays caught, mirroring ADR-0021's own worked examples elsewhere in this
  // repo (e.g. assertDeviceAuthorizationDisabledPathsComplete's header comment).
  it('control: writing via request.headers (the wrong way) would NOT reach request.raw.headers', async () => {
    const wrongWayApp = Fastify()
    let sawOnRaw: unknown
    let sawOnFastifyGetter: unknown
    wrongWayApp.addHook('onRequest', async (request) => {
      // The mistake Musti's dispatch names explicitly: this goes into Fastify's own
      // `additionalHeaders` overlay, not `request.raw.headers`.
      request.headers = { ...request.headers, [CLIENT_ADDRESS_HEADER]: '203.0.113.9' }
    })
    // Same oxlint false positive as buildTestApp's own '/probe' route above.
    // oxlint-disable-next-line no-async-endpoint-handlers
    wrongWayApp.all('/probe', async (request) => {
      sawOnRaw = request.raw.headers[CLIENT_ADDRESS_HEADER]
      sawOnFastifyGetter = request.headers[CLIENT_ADDRESS_HEADER]
      return { ok: true }
    })
    await wrongWayApp.ready()
    await wrongWayApp.inject({ method: 'GET', url: '/probe' })
    await wrongWayApp.close()

    // Passes every test that only reads request.headers ...
    expect(sawOnFastifyGetter).toBe('203.0.113.9')
    // ... while never reaching the object better-auth is actually handed.
    expect(sawOnRaw).toBeUndefined()
  })
})
