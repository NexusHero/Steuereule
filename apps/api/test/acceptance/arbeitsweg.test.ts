// Arbeitsweg — the commute facts behind the Entfernungspauschale (Anlage N Zeilen 27–31). Real
// Postgres, real HTTP against `buildApp()`: the facts survive a reload, the Pauschale comes from the
// core, a guest is refused, and the workplace address is ciphertext at rest (ADR-0008).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'arbeitsweg-secret'
process.env.BETTER_AUTH_SECRET = 'arbeitsweg-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39981'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const ORIGIN = { origin: ALLOWED_ORIGIN }

const EINGABEN = {
  arbeitstage: [1, 2, 3, 4, 5],
  urlaubstage: 30,
  krankheitstage: 5,
  homeofficeTage: 20,
  feiertage: null,
  feiertageRegion: null,
  einfacheKm: 30,
  verkehrsmittel: 'pkw',
  taetigkeitsstaette: '79539 Lörrach, Hauptstraße 1',
}

describe('Arbeitsweg, against the real server', () => {
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
    resetRateLimiters(app)
    await prisma.$executeRawUnsafe(`DELETE FROM "Arbeitsweg"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUp(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ORIGIN },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Pendler' }),
    })
    expect(response.status).toBe(200)
    return response.headers.get('set-cookie')!.split(';')[0]!
  }

  it('stores the commute and returns Pendlertage and Entfernungspauschale, also after a reload', async () => {
    const cookie = await signUp('pendler@example.com')

    const put = await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify(EINGABEN),
    })
    const get = await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, { headers: { cookie } })

    expect(put.status).toBe(200)
    expect(await get.json()).toEqual({
      eingaben: EINGABEN,
      werktage: { wochentage: 261, werktage: 226, pendlertage: 206 },
      pendlerpauschale: 2019,
    })
  })

  it('keeps the workplace address as ciphertext at rest', async () => {
    const cookie = await signUp('verschluesselt@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify(EINGABEN),
    })
    const [row] = await prisma.$queryRawUnsafe<{ taetigkeitsstaette: string }[]>(`SELECT "taetigkeitsstaette" FROM "Arbeitsweg"`)

    expect(row!.taetigkeitsstaette).not.toContain('Lörrach')
  })

  it('refuses a guest', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`)

    expect(response.status).toBe(401)
  })

  it('rejects more days off than working days with a stable code', async () => {
    const cookie = await signUp('widerspruch@example.com')

    const response = await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify({ ...EINGABEN, urlaubstage: 300 }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'ARBEITSTAGE_WIDERSPRUCH' })
  })
})
