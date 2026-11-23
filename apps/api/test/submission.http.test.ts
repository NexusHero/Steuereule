// ADR-0098 §8 — the Abgabe over real HTTP (guard, ValidationPipe, DomainError mapping) against fakes,
// no live Postgres (ADR-0004). The cockpit shows what was recorded.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'submission-http-test-secret'

const USER = 'user-abgabe'
const COOKIE = { cookie: 'better-auth.session_token=tok-abgabe' }
const YEAR = 2025

describe('/v1/steuerjahre/:jahr/abgabe', () => {
  let app: NestFastifyApplication
  let built: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async () => {
    built = await buildTestApp({ sessionsByToken: { 'tok-abgabe': USER } })
    app = built.app
    built.taxYearRepository.seed(USER, { taxYear: YEAR, openItems: 0 })
    built.submissionRepository.seedYear(USER, YEAR)
    built.interviewRepository.seed(USER, YEAR, { job: 'Angestellt', familienstand: 'Ledig', ausland: 'Nein', kinder: 'Nein' })
    built.lstbRepository.seed({ userId: USER, taxYear: YEAR, bruttoarbeitslohn: '48200', lohnsteuer: '7457', sozialversicherung: '9880' })
  })

  afterEach(async () => {
    await app.close()
  })

  const submit = (submittedOn: unknown, headers: Record<string, string> = COOKIE) =>
    app.inject({ method: 'POST', url: `/v1/steuerjahre/${YEAR}/abgabe`, headers, payload: { submittedOn } })
  const cockpit = async () => (await app.inject({ method: 'GET', url: `/v1/steuerjahre/${YEAR}/cockpit`, headers: COOKIE })).json()

  it('needs an account', async () => {
    const response = await submit('2026-03-14', {})
    expect(response.statusCode).toBe(401)
  })

  it('records the submission, freezes the version and shows it in the cockpit', async () => {
    expect((await cockpit()).submission).toBeNull()

    const response = await submit('2026-03-14')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'eingereicht', submittedOn: '2026-03-14', replacedPrevious: false })
    expect((await built.filingVersionRepository.findLatest(USER, YEAR))?.positions.bruttoarbeitslohnA).toBe(48_200)
    expect((await cockpit()).submission).toEqual({ status: 'eingereicht', submittedOn: '2026-03-14', withdrawable: true })
    expect(built.auditRepository.all()).toContainEqual(expect.objectContaining({ userId: USER, action: 'WRITE', resource: 'abgabe' }))
  })

  it('a second submission replaces the first and says so', async () => {
    await submit('2026-03-14')
    const response = await submit('2026-04-02')
    expect(response.json()).toEqual({ status: 'eingereicht', submittedOn: '2026-04-02', replacedPrevious: true })
    expect((await cockpit()).submission.submittedOn).toBe('2026-04-02')
  })

  it.each([[undefined], ['14.03.2026'], [20260314]])('rejects the malformed body %s at the edge', async (submittedOn) => {
    const response = await submit(submittedOn)
    expect(response.statusCode).toBe(400)
    expect(response.json().fields.map((f: { field: string }) => f.field)).toContain('submittedOn')
    expect(await built.filingVersionRepository.findLatest(USER, YEAR)).toBeNull()
  })

  it.each([
    ['2999-01-01', 'in-der-zukunft'],
    ['2025-06-30', 'vor-jahresende'],
    ['2026-02-30', 'format'],
  ])('rejects the date %s with a domain error (%s)', async (submittedOn, problem) => {
    const response = await submit(submittedOn)
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'SUBMISSION_DATE_INVALID', details: { problem } })
  })

  it('undoes the submission until a Bescheid is recorded', async () => {
    await submit('2026-03-14')

    const response = await app.inject({ method: 'DELETE', url: `/v1/steuerjahre/${YEAR}/abgabe`, headers: COOKIE })

    expect(response.statusCode).toBe(204)
    expect((await cockpit()).submission).toBeNull()
    expect(await built.filingVersionRepository.findLatest(USER, YEAR)).toBeNull()
    expect(await built.submissionRepository.yearStatus(USER, YEAR)).toBe('entwurf')
  })

  it('refuses to undo once a Bescheid is recorded (409 SUBMISSION_HAS_ASSESSMENT)', async () => {
    await submit('2026-03-14')
    await built.assessmentRepository.setField(USER, YEAR, 'erstattung', '400')
    expect((await cockpit()).submission.withdrawable).toBe(false)

    const response = await app.inject({ method: 'DELETE', url: `/v1/steuerjahre/${YEAR}/abgabe`, headers: COOKIE })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'SUBMISSION_HAS_ASSESSMENT' })
    expect(await built.filingVersionRepository.findLatest(USER, YEAR)).not.toBeNull()
  })

  it('has nothing to undo without a submission (404 SUBMISSION_NOT_FOUND)', async () => {
    const response = await app.inject({ method: 'DELETE', url: `/v1/steuerjahre/${YEAR}/abgabe`, headers: COOKIE })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'SUBMISSION_NOT_FOUND' })
  })

  it('refuses a year without anything entered (404 TAX_YEAR_NOT_FOUND)', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/steuerjahre/2024/abgabe', headers: COOKIE, payload: { submittedOn: '2026-03-14' } })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'TAX_YEAR_NOT_FOUND' })
  })
})

// ADR-0103 vulnerability 4 — filing the return requires a verified email. Both accounts here are fully
// set up for the year, so the only difference is the verification flag: the control's "break it" proof.
describe('/v1/steuerjahre/:jahr/abgabe — verified-email gate (ADR-0103)', () => {
  let app: NestFastifyApplication
  const VERIFIED = 'verified-user'
  const UNVERIFIED = 'unverified-user'

  beforeEach(async () => {
    const built = await buildTestApp({
      sessionsByToken: {
        'tok-verified': { userId: VERIFIED, emailVerified: true },
        'tok-unverified': { userId: UNVERIFIED, emailVerified: false },
      },
    })
    app = built.app
    for (const user of [VERIFIED, UNVERIFIED]) {
      built.taxYearRepository.seed(user, { taxYear: YEAR, openItems: 0 })
      built.submissionRepository.seedYear(user, YEAR)
      built.interviewRepository.seed(user, YEAR, { job: 'Angestellt', familienstand: 'Ledig', ausland: 'Nein', kinder: 'Nein' })
      built.lstbRepository.seed({ userId: user, taxYear: YEAR, bruttoarbeitslohn: '48200', lohnsteuer: '7457', sozialversicherung: '9880' })
    }
  })

  afterEach(async () => {
    await app.close()
  })

  const submitAs = (token: string) =>
    app.inject({ method: 'POST', url: `/v1/steuerjahre/${YEAR}/abgabe`, headers: { cookie: `better-auth.session_token=${token}` }, payload: { submittedOn: '2026-03-14' } })

  it('refuses a signed-in account whose email is not verified (403)', async () => {
    const response = await submitAs('tok-unverified')
    expect(response.statusCode).toBe(403)
  })

  it('lets the same filing through once the email is verified (200)', async () => {
    const response = await submitAs('tok-verified')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'eingereicht' })
  })
})
