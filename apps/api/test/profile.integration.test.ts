// Real-Postgres cascade (ADR-0004). Run via `pnpm --filter @steuereule/api
// test:integration` against a migrated database (`DATABASE_URL` set, migrations
// applied via `prisma migrate deploy`) — e.g. the compose/testcontainers stage, never
// the plain no-DB `pnpm -r test` job. Proves the same contract as profile.http.test.ts
// but through the real PrismaProfileRepository and the real unique-userId constraint.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { validationExceptionFactory } from '../src/common/validation-exception-factory.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { extractSessionCookie } from './support/build-test-app.js'

const VALID_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

describe('PROFILE /v1/profile — real Postgres', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
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
    await app.getHttpAdapter().getInstance().ready()
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.profile.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET before any PUT returns the well-defined empty/default DTO, never an error', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/profile' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ firstName: null, lastName: null, steuerId: null, steuernummer: null })
  })

  it('PUT -> GET read-your-writes round-trip against the real table', async () => {
    const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    expect(put.statusCode).toBe(200)
    const cookie = extractSessionCookie(put.headers['set-cookie'])!

    const get = await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })
    expect(get.json()).toEqual(VALID_PAYLOAD)
  })

  it('PUT twice with the same payload is idempotent — one row in Postgres', async () => {
    const first = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD, headers: { cookie } })

    await expect(prisma.profile.count()).resolves.toBe(1)
  })

  it('an invalid payload (10-digit steuerId) returns 400 and writes zero rows', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, steuerId: '1234567890' },
    })
    expect(response.statusCode).toBe(400)
    await expect(prisma.profile.count()).resolves.toBe(0)
  })

  it('an empty name field returns 400 and writes zero rows', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, firstName: '' },
    })
    expect(response.statusCode).toBe(400)
    await expect(prisma.profile.count()).resolves.toBe(0)
  })

  it('cross-userId isolation: userB GET never sees userA’s row, userB PUT never overwrites userA', async () => {
    const userAPut = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    const userACookie = extractSessionCookie(userAPut.headers['set-cookie'])!

    const userBGet = await app.inject({ method: 'GET', url: '/v1/profile' })
    expect(userBGet.json()).toEqual({ firstName: null, lastName: null, steuerId: null, steuernummer: null })

    const userBPayload = { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }
    await app.inject({ method: 'PUT', url: '/v1/profile', payload: userBPayload })

    const userAGet = await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie: userACookie } })
    expect(userAGet.json()).toEqual(VALID_PAYLOAD)

    await expect(prisma.profile.count()).resolves.toBe(2)
  })
})
