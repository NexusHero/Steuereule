// Arbeitsweg — the commute facts behind the Entfernungspauschale (Anlage N Zeilen 27–31). Real
// Postgres, real HTTP against `buildApp()`: the facts survive a reload, the Pauschale comes from the
// core, a guest is refused, and the workplace address is ciphertext at rest (ADR-0008).
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp as signUpAccount, useAcceptanceServer } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const ORIGIN = { origin: ALLOWED_ORIGIN }

const INPUTS = {
  workdays: [1, 2, 3, 4, 5],
  vacationDays: 30,
  sickDays: 5,
  homeOfficeDays: 20,
  publicHolidays: null,
  publicHolidayRegion: null,
  oneWayKm: 30,
  transport: 'pkw',
  workplace: '79539 Lörrach, Hauptstraße 1',
}

describe('Arbeitsweg, against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'arbeitsweg-secret',
      BETTER_AUTH_SECRET: 'arbeitsweg-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39981',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.$executeRawUnsafe(`DELETE FROM "Arbeitsweg"`)
      await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  const signUp = async (email: string): Promise<string> => (await signUpAccount(email, { name: 'Pendler' })).cookie

  it('stores the commute and returns Pendlertage and Entfernungspauschale, also after a reload', async () => {
    const cookie = await signUp('pendler@example.com')

    const put = await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify(INPUTS),
    })
    const get = await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, { headers: { cookie } })

    expect(put.status).toBe(200)
    expect(await get.json()).toEqual({
      inputs: expect.objectContaining(INPUTS),
      workdays: { weekdays: 261, workdays: 226, commuteDays: 206 },
      commuterAllowance: 2019,
    })
  })

  it('stores the further Werbungskosten and a second way after a change of job (ADR-0076, ADR-0079)', async () => {
    const cookie = await signUp('wechsel@example.com')
    const changed = {
      ...INPUTS,
      accountFeesEur: 16,
      workEquipmentEur: 110,
      workEquipmentNote: 'Berufskleidung',
      periodTo: '31.10.2025',
      secondOneWayKm: 80,
      secondTransport: 'pkw',
      secondWorkplace: '4058 Basel, Beispielstrasse 1',
      secondFrom: '01.11.2025',
    }

    await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify(changed),
    })
    // A later save without the new fields keeps them.
    await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify({ ...INPUTS, homeOfficeDays: 10 }),
    })
    const body = (await (await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, { headers: { cookie } })).json()) as { inputs: Record<string, unknown>; commuterAllowance: number }
    const [row] = await prisma.$queryRawUnsafe<{ zweiterWegOrt: string }[]>(`SELECT "zweiterWegOrt" FROM "Arbeitsweg"`)

    expect(body.inputs).toMatchObject({ accountFeesEur: 16, workEquipmentEur: 110, periodTo: '31.10.2025', secondOneWayKm: 80, secondFrom: '01.11.2025', homeOfficeDays: 10 })
    expect(body.commuterAllowance).toBeGreaterThan(2019)
    expect(row!.zweiterWegOrt).not.toContain('Basel')
  })

  it('keeps the workplace address as ciphertext at rest', async () => {
    const cookie = await signUp('verschluesselt@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/2025/arbeitsweg`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...ORIGIN },
      body: JSON.stringify(INPUTS),
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
      body: JSON.stringify({ ...INPUTS, vacationDays: 300 }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'ARBEITSTAGE_WIDERSPRUCH' })
  })
})
