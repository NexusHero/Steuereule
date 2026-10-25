// Fast, no-DB unit tier (ADR-0004): UebernahmeService against FakeUebernahmeRepository +
// FakeLstbRepository. The copy is M1-scoped: die LStB-Zeile des Vorjahrs wandert unverändert ins
// Zieljahr, die Kennzeichnung markiert sie unbestätigt (ADR-021). Ein zweiter Kopierversuch ist
// ein 409, eine Bestätigung ohne Kennzeichnung ein 404. Die real-Postgres-Beweise (ciphertext,
// Audit, Idempotenz über echte Requests) leben in test/acceptance/req-028-jahresuebernahme.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { UebernahmeService } from '../src/uebernahme/uebernahme.service.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeUebernahmeRepository } from './fakes/fake-uebernahme.repository.js'

const USER_ID = 'user-1'
const ZIELJAHR = 2026

describe('UebernahmeService', () => {
  let repository: FakeUebernahmeRepository
  let lstb: FakeLstbRepository
  let service: UebernahmeService

  beforeEach(() => {
    repository = new FakeUebernahmeRepository()
    lstb = new FakeLstbRepository()
    service = new UebernahmeService(repository, lstb)
  })

  it('kopiert die LStB-Zeile des Vorjahrs unverändert und markiert sie UNBESTÄTIGT (ADR-021)', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const response = await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    expect(response).toEqual({ kennzeichnungen: [{ postenKey: 'lstb', vorjahr: 2025, bestaetigt: false }] })
    // Die kopierten Feld-Strings sind unverändert (die ehrlichen Zustände reisen mit).
    const kopie = await lstb.findForUserAndYear(USER_ID, ZIELJAHR)
    expect(kopie).toMatchObject({ bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
  })

  it('ein zweiter Kopierversuch ist ein 409 — nie eine stille Kopie', async () => {
    lstb.seed({ userId: USER_ID, steuerjahr: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })
    await service.uebernehme(USER_ID, ZIELJAHR, 2025)

    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025)).rejects.toThrow('already taken over')
  })

  it('ohne Vorjahres-LStB ist die Übernahme ein 404 — nie eine erfundene Kopie', async () => {
    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025)).rejects.toThrow('No LStB exists')
  })

  it('ein ungültiges von-Jahr ist ein 400 (nicht ganzzahlig, nicht vor dem Zieljahr)', async () => {
    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025.5)).rejects.toThrow('strictly before')
    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2027)).rejects.toThrow('strictly before')
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

    await expect(service.uebernehme(USER_ID, ZIELJAHR, 2025)).rejects.toThrow('No LStB exists')
    expect(await service.getState(USER_ID, ZIELJAHR)).toEqual({ kennzeichnungen: [] })
  })
})
