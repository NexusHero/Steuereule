// Fast, no-DB unit tier (ADR-0004): BestaetigungService against the fake repositories. The
// real-Postgres proofs live in test/acceptance/req-032-herkunft-bestaetigung.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { BestaetigungService } from '../src/bestaetigung/bestaetigung.service.js'
import { feldZugriffAus } from '../src/bestaetigung/feld-zugriff.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeKapitalRepository } from './fakes/fake-kapital.repository.js'
import { FakeKennzeichnungRepository } from './fakes/fake-kennzeichnung.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeRenteRepository } from './fakes/fake-rente.repository.js'
import { FakeVermietungRepository } from './fakes/fake-vermietung.repository.js'
import { AuditService } from '../src/audit/audit.service.js'

const USER = 'user-1'
const JAHR = 2025
const CLAUDE = { art: 'assistent', name: 'Claude' } as const

describe('BestaetigungService', () => {
  let kennzeichnungen: FakeKennzeichnungRepository
  let lstb: FakeLstbRepository
  let rente: FakeRenteRepository
  let vermietung: FakeVermietungRepository
  let service: BestaetigungService

  beforeEach(() => {
    kennzeichnungen = new FakeKennzeichnungRepository()
    lstb = new FakeLstbRepository()
    rente = new FakeRenteRepository()
    vermietung = new FakeVermietungRepository()
    const zugriff = feldZugriffAus({ lstb, rente, kapital: new FakeKapitalRepository(), vermietung })
    service = new BestaetigungService(kennzeichnungen, zugriff, new AuditService(new FakeAuditRepository()))
  })

  it('a non-user write into an empty field writes the value and leaves it unconfirmed', async () => {
    expect(await service.schreibe(USER, JAHR, 'lstb.bruttoarbeitslohn', '50000', CLAUDE)).toBe('geschrieben')
    expect((await lstb.findForUserAndYear(USER, JAHR))?.bruttoarbeitslohn).toBe('50000')
    expect(await service.fehlend(USER, JAHR)).toEqual(['unbestaetigt.anlageN'])
  })

  it('der Nutzer gewinnt: a typed value stays, the new one becomes a proposal', async () => {
    await lstb.setFeld(USER, JAHR, 'bruttoarbeitslohn', '4750')

    expect(await service.schreibe(USER, JAHR, 'lstb.bruttoarbeitslohn', '4800', CLAUDE)).toBe('vorschlag')

    expect((await lstb.findForUserAndYear(USER, JAHR))?.bruttoarbeitslohn).toBe('4750')
    expect(await service.fehlend(USER, JAHR)).toEqual([])
    const uebersicht = await service.uebersicht(USER, JAHR)
    expect(uebersicht.anlagen).toEqual([
      {
        anlage: 'anlageN',
        unbestaetigt: 0,
        werte: [
          {
            key: 'lstb.bruttoarbeitslohn',
            maske: 'lstb',
            instanz: null,
            feld: 'bruttoarbeitslohn',
            wert: '4750',
            herkunft: { art: 'nutzer' },
            bestaetigt: true,
            vorschlag: { wert: '4800', herkunft: { art: 'assistent', name: 'Claude' } },
          },
        ],
      },
    ])
  })

  it('confirming an Anlage lifts its block and only its block', async () => {
    await service.schreibe(USER, JAHR, 'lstb.lohnsteuer', '700', CLAUDE)
    await service.schreibe(USER, JAHR, 'rente.jahresbetrag', '12000', { art: 'uebernahme', vorjahr: 2024 })
    expect(await service.fehlend(USER, JAHR)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageR'])

    await service.bestaetigeAnlage(USER, JAHR, 'anlageR')

    expect(await service.fehlend(USER, JAHR)).toEqual(['unbestaetigt.anlageN'])
    expect((await service.uebersicht(USER, JAHR)).anlagen.map((a) => a.anlage)).toEqual(['anlageN'])
  })

  it('accepting a proposal writes it into the mask as confirmed; discarding leaves the user value without a marker', async () => {
    await lstb.setFeld(USER, JAHR, 'bruttoarbeitslohn', '4750')
    await lstb.setFeld(USER, JAHR, 'lohnsteuer', '700')
    await service.schreibe(USER, JAHR, 'lstb.bruttoarbeitslohn', '4800', CLAUDE)
    await service.schreibe(USER, JAHR, 'lstb.lohnsteuer', '720', CLAUDE)

    await service.entscheideVorschlag(USER, JAHR, 'lstb.bruttoarbeitslohn', 'annehmen')
    await service.entscheideVorschlag(USER, JAHR, 'lstb.lohnsteuer', 'verwerfen')

    expect(await lstb.findForUserAndYear(USER, JAHR)).toMatchObject({ bruttoarbeitslohn: '4800', lohnsteuer: '700' })
    expect(kennzeichnungen.alle()).toEqual([
      { userId: USER, steuerjahr: JAHR, key: 'lstb.bruttoarbeitslohn', herkunft: CLAUDE, bestaetigt: true, vorschlag: null },
    ])
    expect(await service.fehlend(USER, JAHR)).toEqual([])
  })

  it('a proposal decision on a field without a proposal is a 404, an unknown key a 400', async () => {
    await expect(service.entscheideVorschlag(USER, JAHR, 'lstb.lohnsteuer', 'annehmen')).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND' })
    await expect(service.entscheideVorschlag(USER, JAHR, 'gewerbe.gewinn', 'annehmen')).rejects.toMatchObject({ code: 'FIELD_UNKNOWN' })
  })

  it('an unknown Anlage is a 400, never a silent no-op', async () => {
    await expect(service.bestaetigeAnlage(USER, JAHR, 'anlageX' as never)).rejects.toMatchObject({ code: 'ANLAGE_UNKNOWN' })
  })

  it('writes into a Vermietungsobjekt by instance and refuses an object of another user', async () => {
    const eigenes = await vermietung.create(USER, JAHR)
    const fremdes = await vermietung.create('user-2', JAHR)

    await service.schreibe(USER, JAHR, `vermietung:${eigenes.id}.mieteinnahmen`, '9000', CLAUDE)
    await expect(service.schreibe(USER, JAHR, `vermietung:${fremdes.id}.mieteinnahmen`, '1', CLAUDE)).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' })

    expect((await vermietung.listForUserAndYear('user-2', JAHR))[0]?.mieteinnahmen).toBeNull()
    expect(await service.fehlend(USER, JAHR)).toEqual(['unbestaetigt.anlageV'])
  })

  it('the overview is scoped to the caller', async () => {
    await service.schreibe('user-2', JAHR, 'lstb.lohnsteuer', '700', CLAUDE)
    expect(await service.uebersicht(USER, JAHR)).toEqual({ anlagen: [] })
    expect(await service.fehlend(USER, JAHR)).toEqual([])
  })
})
