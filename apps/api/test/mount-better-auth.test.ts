// The better-auth handler reads the raw body itself; Fastify must hand both JSON and form bodies
// through untouched. OAuth clients send the token request as application/x-www-form-urlencoded
// (RFC 6749 § 4.1.3) — a consumed stream broke the token exchange for every MCP assistant (#450 5A).
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Module } from '@nestjs/common'
import type { Auth } from 'better-auth'
import { afterEach, describe, expect, it } from 'vitest'
import { mountBetterAuthHandler } from '../src/auth/mount-better-auth.js'

@Module({})
class EmptyModule {}

const echoAuth = {
  handler: async (request: Request) =>
    new Response(JSON.stringify({ contentType: request.headers.get('content-type'), body: await request.text() }), {
      headers: { 'content-type': 'application/json' },
    }),
} as unknown as Auth

describe('mountBetterAuthHandler', () => {
  let app: NestFastifyApplication | null = null
  afterEach(async () => {
    await app?.close()
    app = null
  })

  async function boot(): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [EmptyModule] }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await mountBetterAuthHandler(app, echoAuth)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    return app
  }

  it('hands a form body to better-auth unread (the OAuth token request)', async () => {
    const server = await boot()
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=authorization_code&code=abc',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ contentType: 'application/x-www-form-urlencoded', body: 'grant_type=authorization_code&code=abc' })
  })

  it('hands a JSON body to better-auth unread', async () => {
    const server = await boot()
    const res = await server.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { 'content-type': 'application/json' }, payload: '{"a":1}' })
    expect(res.json()).toEqual({ contentType: 'application/json', body: '{"a":1}' })
  })
})
