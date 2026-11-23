// ADR-0106 D3/D4/D14 — the client address better-auth keys rate limits and Session.ipAddress on is the
// one Fastify resolved, never a value the client sent. Fastify's `inject` sets the socket peer
// (`remoteAddress`), so distinct clients can be told apart without a network.
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { CLIENT_IP_HEADER, installClientIpHeader } from '../src/auth/client-ip.js'
import { createBetterAuth } from '../src/auth/better-auth.js'

let app: FastifyInstance | undefined

function echoApp(trustProxy: string[]): FastifyInstance {
  const instance = Fastify({ trustProxy })
  installClientIpHeader(instance)
  instance.get('/echo', async (request) => ({ seen: request.raw.headers[CLIENT_IP_HEADER] ?? null }))
  return instance
}

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('installClientIpHeader', () => {
  it('without a trusted proxy, the socket peer is the address, whatever headers the client sends', async () => {
    app = echoApp([])
    const response = await app.inject({
      method: 'GET',
      url: '/echo',
      remoteAddress: '198.51.100.7',
      headers: { 'x-forwarded-for': '203.0.113.99', [CLIENT_IP_HEADER]: '192.0.2.1' },
    })
    expect(response.json()).toEqual({ seen: '198.51.100.7' })
  })

  it('two clients without X-Forwarded-For get two addresses, not one shared bucket (D4)', async () => {
    app = echoApp([])
    const first = await app.inject({ method: 'GET', url: '/echo', remoteAddress: '198.51.100.7' })
    const second = await app.inject({ method: 'GET', url: '/echo', remoteAddress: '198.51.100.8' })
    expect([first.json(), second.json()]).toEqual([{ seen: '198.51.100.7' }, { seen: '198.51.100.8' }])
  })

  it('behind a trusted proxy, the client the proxy appended is the address, not the hop a client forged', async () => {
    app = echoApp(['10.0.0.0/24'])
    const response = await app.inject({
      method: 'GET',
      url: '/echo',
      remoteAddress: '10.0.0.5',
      headers: { 'x-forwarded-for': '192.0.2.66, 203.0.113.50' },
    })
    expect(response.json()).toEqual({ seen: '203.0.113.50' })
  })

  it('an untrusted peer cannot claim a forwarded address', async () => {
    app = echoApp(['10.0.0.0/24'])
    const response = await app.inject({
      method: 'GET',
      url: '/echo',
      remoteAddress: '198.51.100.7',
      headers: { 'x-forwarded-for': '203.0.113.50' },
    })
    expect(response.json()).toEqual({ seen: '198.51.100.7' })
  })
})

describe('better-auth reads only the server-written address', () => {
  it('is configured with the internal header as its only IP source', () => {
    const { auth } = createBetterAuth({
      prisma: {} as never,
      secret: 'client-ip-test-secret-0123456789abcdef',
      baseUrl: 'http://127.0.0.1:3000',
      trustedOrigins: [],
      webAppUrl: 'http://127.0.0.1:8081',
      emailSender: { send: async () => undefined } as never,
    })
    expect(auth.options.advanced?.ipAddress).toEqual({ ipAddressHeaders: [CLIENT_IP_HEADER] })
  })
})
