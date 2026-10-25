// Fast, no-DB unit tier (ADR-0004): UebernahmeService against the fake repositories. The copy
// moves ALL of the previous year's facts (LStB, Rente, Kapital, every Vermietungsobjekt) — the
// stored field strings travel UNVERÄNDERT (open stays open, ADR-032) — and each copied fact gets
// an UNBESTÄTIGTE Kennzeichnung (ADR-021). A year that was already taken over is a 409, a source
// year without ANY take-over-able fact is a 404, a Bestätigung without a Kennzeichnung is a 404.
// The real-Postgres proofs (ciphertext, audit, idempotence over real HTTP) live in
// test/acceptance/req-028-jahresuebernahme.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { UebernahmeService } from '../src/uebernahme/uebernahme.service.js'
import { FakeKapitalRepository } from './fakes/fake-kapital.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeRenteRepository } from './fakes/fake-rente.repository.js'
import { FakeUebernahmeRepository } from './fakes/fake-uebernahme.repository.js'
import { FakeVermietungRepository } from './fakes/fake-vermietung.repository.js'

const USER_ID = 'user-1'
const ZIELJAHR = 2026

describe('UebernahmeService', () => {
  let repository: FakeUebernahmeRepository
  let lstb: FakeLstbRepository
  let rente: FakeRenteRepository
  let kapital: FakeKapitalRepository
  let vermietung: FakeVermietungRepository
  let service: UebernahmeService

  beforeEach(() => {
    repository = new FakeUebernahmeRepository()
    lstb = new FakeLstbRepository()
    rente = new FakeRenteRepository()
    kapital = new FakeKapitalRepository()
    vermietung = new FakeVermietungRepository()
    service = new UebernahmeService(repository, lstb, rente, kapital, vermietung)
  })

  it('kopiert die LStB-Zeile des Vorjahrs unverändert und markiert sie UNBESTÄTIGT (ADR-021)', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const response = await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    expect(response).toEqual({ kennzeichnungen: [{ postenKey: 'lstb', vorjahr: 2025, bestaetigt: false }] })
    // Die kopierten Feld-Strings sind unverändert (die ehrlichen Zustände reisen mit).
    const kopie = await lstb.findForUserAndYear(USER_ID, ZIELJAHR)
    expect(kopie).toMatchObject({ bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
  })

  it('M2: kopiert ALLE Fakten — LStB + Rente + Kapital + jedes Vermietungsobjekt, je eine Kennzeichnung', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    rente.seed({ userId: USER_ID, steuerjahr: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })
    kapital.seed({ userId: USER_ID, steuerjahr: 2025, kapitalertraege: '3000' })
    vermietung.seed({ id: 'alt-1', userId: USER_ID, steuerjahr: 2025, mieteinnahmen: '9600', anschaffungskosten: '100000', baujahr: '1995', werbungskosten: '1200' })
    vermietung.seed({ id: 'alt-2', userId: USER_ID, steuerjahr: 2025, mieteinnahmen: '7200', anschaffungskosten: '80000', baujahr: '2001', werbungskosten: null })

    const response = await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    expect(response.kennzeichnungen).toHaveLength(5)
    const postenKeys = response.kennzeichnungen.map((k) => k.postenKey)
    expect(postenKeys.filter((k) => k.startsWith('vermietung-'))).toHaveLength(2)
    expect(postenKeys.filter((k) => ['lstb', 'rente', 'kapital'].includes(k)).sort()).toEqual(['kapital', 'lstb', 'rente'])
    expect(response.kennzeichnungen.every((k) => k.bestaetigt === false && k.vorjahr === 2025)).toBe(true)

    // Die kopierten Fakten: Rente + Kapital unverändert, zwei Objekte mit allen Feld-Strings.
    const renteKopie = await rente.findForUserAndYear(USER_ID, ZIELJAHR)
    expect(renteKopie).toMatchObject({ rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })
    const kapitalKopie = await kapital.findForUserAndYear(USER_ID, ZIELJAHR)
    expect(kapitalKopie).toMatchObject({ kapitalertraege: '3000' })
    const objektKopien = await vermietung.listForUserAndYear(USER_ID, ZIELJAHR)
    expect(objektKopien).toHaveLength(2)
    expect(objektKopien.map((o) => o.werbungskosten).sort()).toEqual(['1200', null])
  })

  it('ein zweiter Kopierversuch ist ein 409 — nie eine stille Kopie', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })
    await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025)).rejects.toThrow('already taken over')
  })

  it('ein Vorjahr ohne EINEN einzigen übernehmbaren Fakt ist ein 404 — nie eine erfundene Kopie', async () => {
    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025)).rejects.toThrow('Nothing to take over')
  })

  it('M2: eine Übernahme mit NUR Rente (kein LStB) funktioniert — der Fakt zählt, nicht die Anlage', async () => {
    rente.seed({ userId: USER_ID, steuerjahr: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: null, alterBeiRentenbeginn: null })

    const response = await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    expect(response).toEqual({ kennzeichnungen: [{ postenKey: 'rente', vorjahr: 2025, bestaetigt: false }] })
  })

  it('ein ungültiges von-Jahr ist ein 400 (nicht ganzzahlig, nicht vor dem Zieljahr)', async () => {
    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025.5)).rejects.toThrow('strictly before')
    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2027)).rejects.toThrow('strictly before')
  })

  it('ADR-022: höchstens 4 Rückjahre — ein älteres von-Jahr ist ein 400, nie eine stille Alt-Kopie', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2021, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2021)).rejects.toThrow('at most 4 previous years')
  })

  it('ADR-022: genau 4 Rückjahre sind erlaubt', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2022, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    const response = await service.uebernehme(USER_ID, ZIELJAHR, 2022)

    expect(response.kennzeichnungen).toEqual([{ postenKey: 'lstb', vorjahr: 2022, bestaetigt: false }])
  })

  it('bestaetige dreht das Flag (ADR-021: angetippt), ohne Kennzeichnung ist es ein 404', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })
    await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    const response = await service.bestaetige(USER_ID, ZIELJAHR, 'lstb')
    expect(response).toEqual({ kennzeichnungen: [{ postenKey: 'lstb', vorjahr: 2025, bestaetigt: true }] })

    await expect(service.bestaetige(USER_ID, ZIELJAHR, 'gibt-es-nicht')).rejects.toThrow('No take-over exists')
  })

  it('ist strikt auf userId und Steuerjahr gescoped', async () => {
    lstb.seed({ userId: 'someone-else', steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025)).rejects.toThrow('Nothing to take over')
    expect(await service.getState(USER_ID, ZIELJAHR)).toEqual({ kennzeichnungen: [] })
  })
})
