// Fast, no-DB unit tier (ADR-0004): BestaetigungService against the fake repositories. The
// real-Postgres proofs live in test/acceptance/req-032-herkunft-bestaetigung.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { ConfirmationService } from '../src/bestaetigung/bestaetigung.service.js'
import { fieldAccessFrom } from '../src/bestaetigung/feld-zugriff.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-kapital.repository.js'
import { FakeMarkingRepository } from './fakes/fake-kennzeichnung.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakePensionRepository } from './fakes/fake-rente.repository.js'
import { FakeRentalRepository } from './fakes/fake-vermietung.repository.js'
import { AuditService } from '../src/audit/audit.service.js'

const USER = 'user-1'
const YEAR = 2025
const CLAUDE = { kind: 'assistent', name: 'Claude' } as const

describe('BestaetigungService', () => {
  let markings: FakeMarkingRepository
  let lstb: FakeLstbRepository
  let pension: FakePensionRepository
  let rental: FakeRentalRepository
  let service: ConfirmationService

  beforeEach(() => {
    markings = new FakeMarkingRepository()
    lstb = new FakeLstbRepository()
    pension = new FakePensionRepository()
    rental = new FakeRentalRepository()
    const access = fieldAccessFrom({ lstb, pension, capital: new FakeCapitalRepository(), rental })
    service = new ConfirmationService(markings, access, new AuditService(new FakeAuditRepository()))
  })

  it('a non-user write into an empty field writes the value and leaves it unconfirmed', async () => {
    expect(await service.write(USER, YEAR, 'lstb.bruttoarbeitslohn', '50000', CLAUDE)).toBe('geschrieben')
    expect((await lstb.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('50000')
    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageN'])
  })

  it('der Nutzer gewinnt: a typed value stays, the new one becomes a proposal', async () => {
    await lstb.setField(USER, YEAR, 'bruttoarbeitslohn', '4750')

    expect(await service.write(USER, YEAR, 'lstb.bruttoarbeitslohn', '4800', CLAUDE)).toBe('vorschlag')

    expect((await lstb.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('4750')
    expect(await service.missing(USER, YEAR)).toEqual([])
    const overview = await service.overview(USER, YEAR)
    expect(overview.annexes).toEqual([
      {
        annex: 'anlageN',
        unconfirmed: 0,
        values: [
          {
            key: 'lstb.bruttoarbeitslohn',
            screen: 'lstb',
            instance: null,
            field: 'bruttoarbeitslohn',
            value: '4750',
            provenance: { kind: 'nutzer' },
            confirmed: true,
            proposal: { value: '4800', provenance: { kind: 'assistent', name: 'Claude' } },
          },
        ],
      },
    ])
  })

  it('confirming an Anlage lifts its block and only its block', async () => {
    await service.write(USER, YEAR, 'lstb.lohnsteuer', '700', CLAUDE)
    await service.write(USER, YEAR, 'rente.jahresbetrag', '12000', { kind: 'uebernahme', lastYear: 2024 })
    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageR'])

    await service.confirmAnnex(USER, YEAR, 'anlageR')

    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageN'])
    expect((await service.overview(USER, YEAR)).annexes.map((a) => a.annex)).toEqual(['anlageN'])
  })

  it('accepting a proposal writes it into the mask as confirmed; discarding leaves the user value without a marker', async () => {
    await lstb.setField(USER, YEAR, 'bruttoarbeitslohn', '4750')
    await lstb.setField(USER, YEAR, 'lohnsteuer', '700')
    await service.write(USER, YEAR, 'lstb.bruttoarbeitslohn', '4800', CLAUDE)
    await service.write(USER, YEAR, 'lstb.lohnsteuer', '720', CLAUDE)

    await service.decideProposal(USER, YEAR, 'lstb.bruttoarbeitslohn', 'annehmen')
    await service.decideProposal(USER, YEAR, 'lstb.lohnsteuer', 'verwerfen')

    expect(await lstb.findForUserAndYear(USER, YEAR)).toMatchObject({ bruttoarbeitslohn: '4800', lohnsteuer: '700' })
    expect(markings.all()).toEqual([
      { userId: USER, taxYear: YEAR, key: 'lstb.bruttoarbeitslohn', provenance: CLAUDE, confirmed: true, proposal: null },
    ])
    expect(await service.missing(USER, YEAR)).toEqual([])
  })

  it('a proposal decision on a field without a proposal is a 404, an unknown key a 400', async () => {
    await expect(service.decideProposal(USER, YEAR, 'lstb.lohnsteuer', 'annehmen')).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' })
    await expect(service.decideProposal(USER, YEAR, 'gewerbe.gewinn', 'annehmen')).rejects.toMatchObject({ code: 'FIELD_UNKNOWN' })
  })

  it('an unknown Anlage is a 400, never a silent no-op', async () => {
    await expect(service.confirmAnnex(USER, YEAR, 'anlageX' as never)).rejects.toMatchObject({ code: 'ANLAGE_UNKNOWN' })
  })

  it('writes into a Vermietungsobjekt by instance and refuses an object of another user', async () => {
    const own = await rental.create(USER, YEAR)
    const fremdes = await rental.create('user-2', YEAR)

    await service.write(USER, YEAR, `vermietung:${own.id}.mieteinnahmen`, '9000', CLAUDE)
    await expect(service.write(USER, YEAR, `vermietung:${fremdes.id}.mieteinnahmen`, '1', CLAUDE)).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' })

    expect((await rental.listForUserAndYear('user-2', YEAR))[0]?.mieteinnahmen).toBeNull()
    expect(await service.missing(USER, YEAR)).toEqual(['unbestaetigt.anlageV'])
  })

  it('the overview is scoped to the caller', async () => {
    await service.write('user-2', YEAR, 'lstb.lohnsteuer', '700', CLAUDE)
    expect(await service.overview(USER, YEAR)).toEqual({ annexes: [] })
    expect(await service.missing(USER, YEAR)).toEqual([])
  })
})
