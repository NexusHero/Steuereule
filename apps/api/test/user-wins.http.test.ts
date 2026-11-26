// „The user wins“ (ADR-0052 §7, amendment 1) on every mask, over real HTTP against fakes (ADR-0004): the
// assistant writes a value unconfirmed, the user changes it on the mask, and the assistant's marking is
// gone — so the assistant's next write is only a proposal and it cannot take the value back (MCP-1, MCP-21).
// The marking is settled in one place (`UserWriteMarkings`), not by the masks' services.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Provenance } from '@steuereule/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentDatabaseIdentity } from '../src/common/database-identity.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../src/children/child.repository.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { UserWriteMarkings } from '../src/confirmation/user-write-markings.js'
import { PROVENANCE_REPOSITORY } from '../src/marking/marking.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../src/rental/rental.repository.js'
import type { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'user-wins-http-test-secret'

const USER = 'user-wins'
const COOKIE = { cookie: 'better-auth.session_token=tok-user-wins' }
const YEAR = 2025
const CLAUDE: Provenance = { kind: 'assistent', name: 'Claude', clientId: 'client-claude' }

describe('a user write on a mask clears the assistant’s marking of the fields it changed', () => {
  let app: NestFastifyApplication
  let built: Awaited<ReturnType<typeof buildTestApp>>
  let confirmation: ConfirmationService
  let markings: FakeMarkingRepository

  beforeEach(async () => {
    built = await buildTestApp({ sessionsByToken: { 'tok-user-wins': USER } })
    app = built.app
    built.taxYearRepository.seed(USER, { taxYear: YEAR, openItems: 0 })
    confirmation = app.get(ConfirmationService)
    markings = app.get(PROVENANCE_REPOSITORY)
  })

  afterEach(async () => {
    await app.close()
  })

  const keys = () => markings.all().filter((m) => m.userId === USER).map((m) => m.key).sort()
  const send = async (method: 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) => {
    const response = await app.inject({ method, url, headers: COOKIE, ...(payload === undefined ? {} : { payload }) })
    expect(response.statusCode, response.body).toBeLessThan(300)
    return response
  }

  /** The assistant writes, the user changes the field on its mask, the assistant tries again. */
  async function userWins(key: string, assistantValue: string, userWrite: () => Promise<unknown>, assistantAgain: string) {
    expect(await confirmation.write(USER, YEAR, key, assistantValue, CLAUDE)).toBe('geschrieben')
    expect(keys()).toContain(key)
    await userWrite()
    expect(keys()).not.toContain(key)
    const userValue = await confirmation.readRawValue(USER, YEAR, key)
    expect(userValue).not.toBe(assistantValue)
    // The user's value is protected now: the assistant only proposes, and cannot withdraw it.
    expect(await confirmation.write(USER, YEAR, key, assistantAgain, CLAUDE)).toBe('vorschlag')
    expect(await confirmation.readRawValue(USER, YEAR, key)).toBe(userValue)
    await expect(confirmation.withdrawAssistantEntry(USER, YEAR, key, () => true)).resolves.toBe('vorschlag-entfernt')
    expect(await confirmation.readRawValue(USER, YEAR, key)).toBe(userValue)
  }

  it('Stammdaten: saving the whole form (MCP-1)', async () => {
    await send('PUT', '/v1/stammdaten', { wohnort: 'Freiburg' })
    await userWins('stammdaten.beruf', 'Lehrerin', () => send('PUT', '/v1/stammdaten', { wohnort: 'Freiburg', beruf: 'Ärztin' }), 'Lehrerin')
  })

  it('Profil (MCP-1)', async () => {
    await send('PUT', '/v1/profile', { firstName: 'Ada', lastName: 'Lovelace' })
    await userWins('profil.steuernummer', '1234567890', () => send('PUT', '/v1/profile', { firstName: 'Ada', lastName: 'Lovelace', steuernummer: '9876543210' }), '1234567890')
  })

  it('the booted app runs the user write inside the database identity of the user (interceptor order, P11)', async () => {
    // The write's transaction takes the identity it is opened under: DatabaseIdentityInterceptor must wrap
    // UserWriteInterceptor, or the write and its settling would run with no identity at all.
    const userWrites = app.get(UserWriteMarkings)
    const seen: unknown[] = []
    const around = userWrites.around.bind(userWrites)
    vi.spyOn(userWrites, 'around').mockImplementation((...args: Parameters<UserWriteMarkings['around']>) => {
      seen.push(currentDatabaseIdentity())
      return around(...args)
    })
    await send('PUT', '/v1/profile', { firstName: 'Ada', lastName: 'Lovelace' })
    expect(seen).toEqual([{ kind: 'user', userId: USER }])
  })

  it('Interview (MCP-1)', async () => {
    await userWins('interview.job', 'Angestellt', () => send('POST', `/v1/steuerjahre/${YEAR}/interview/antworten`, { questionId: 'job', value: 'Rente' }), 'Angestellt')
  })

  it('LStB: church tax, subsidies and the social lines, not only the three values (MCP-21)', async () => {
    await send('PUT', `/v1/steuerjahre/${YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: 48000 })
    await userWins('lstb.kirchensteuer', '310', () => send('PUT', `/v1/steuerjahre/${YEAR}/lstb-kirchensteuer`, { kirchensteuer: 290, kirchensteuerEhegatte: null }), '310')
    await userWins('lstb.zuschuesseKvPv', '1200', () => send('PUT', `/v1/steuerjahre/${YEAR}/lstb-zuschuesse`, { zuschuesseKvPv: 1100 }), '1200')
    await userWins('lstb.kvArbeitnehmer', '3900', () => send('PUT', `/v1/steuerjahre/${YEAR}/lstb-zeilen`, { kvArbeitnehmer: 3800 }), '3900')
    await userWins('lstb.lohnsteuer', '7000', () => send('PUT', `/v1/steuerjahre/${YEAR}/lstb/lohnsteuer`, { kind: 'erfasst', value: 6900 }), '7000')
  })

  it('Kapital: the depot owner (MCP-21)', async () => {
    await send('PUT', `/v1/steuerjahre/${YEAR}/kapital/kapitalertraege`, { kind: 'erfasst', value: 300 })
    await userWins('kapital.inhaber', 'B', () => send('PUT', `/v1/steuerjahre/${YEAR}/kapital/inhaber`, { inhaber: 'A' }), 'B')
  })

  it('Vermietung: the address route of an object (MCP-21)', async () => {
    const property = await app.get<RentalRepository>(RENTAL_REPOSITORY).create(USER, YEAR)
    await userWins(`vermietung:${property.id}.strasse`, 'Hauptstraße', () => send('PUT', `/v1/steuerjahre/${YEAR}/vermietung/objekte/${property.id}/adresse`, { strasse: 'Bahnhofstraße' }), 'Hauptstraße')
  })

  // The children's routes reach the household (Prisma) in this app, so the write runs through the one path directly;
  // that the routes take the path is the route check of `user-write-routes.test.ts`.
  it('Kind (MCP-1)', async () => {
    const children = app.get<ChildRepository>(CHILD_REPOSITORY)
    const child = await children.create(USER, YEAR, { firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2018-04-01' })
    await userWins(`kind:${child.id}.childcareEur`, '2400', () => app.get(UserWriteMarkings).around(USER, YEAR, ['kind'], () => children.update(USER, YEAR, child.id, { childcareEur: '2000' })), '2400')
  })

  it('Bescheid (MCP-1)', async () => {
    await userWins('assessment.festgesetzteSteuer', '4200', () => send('PUT', `/v1/steuerjahre/${YEAR}/bescheid/feld/festgesetzteSteuer`, { kind: 'erfasst', value: 4100 }), '4200')
  })

  it('Rente keeps working through the one path (regression of the hand-written removal)', async () => {
    await userWins('rente.jahresbetrag', '12000', () => send('PUT', `/v1/steuerjahre/${YEAR}/rente/jahresbetrag`, { kind: 'erfasst', value: 11800 }), '12000')
  })

  it('a field the write left as it was keeps its unconfirmed marking — saving a form is no confirmation', async () => {
    await send('PUT', '/v1/stammdaten', { wohnort: 'Freiburg' })
    await confirmation.write(USER, 0, 'stammdaten.kirchensteuerpflichtig', 'true', CLAUDE)
    await confirmation.write(USER, 0, 'stammdaten.beruf', 'Lehrerin', CLAUDE)

    await send('PUT', '/v1/stammdaten', { wohnort: 'Freiburg', beruf: 'Ärztin' })

    expect(keys()).toEqual(['stammdaten.kirchensteuerpflichtig'])
    expect(markings.all().find((m) => m.key === 'stammdaten.kirchensteuerpflichtig')?.confirmed).toBe(false)
  })

  it('deleting a child takes its markings and proposals along (API-21)', async () => {
    const child = await app.get<ChildRepository>(CHILD_REPOSITORY).create(USER, YEAR, { firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2018-04-01' })
    await confirmation.write(USER, YEAR, `kind:${child.id}.childcareEur`, '2400', CLAUDE)
    await confirmation.markUnconfirmed(USER, YEAR, [`kind:${child.id}.firstName`], CLAUDE)

    await app.get(UserWriteMarkings).around(USER, YEAR, ['kind'], () => app.get<ChildRepository>(CHILD_REPOSITORY).delete(USER, YEAR, child.id))

    expect(keys()).toEqual([])
    expect(await confirmation.missing(USER, YEAR)).toEqual([])
  })
})
