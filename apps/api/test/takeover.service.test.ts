// Fast, no-DB unit tier (ADR-0004): UebernahmeService against the fake repositories. The copy
// moves ALL of the previous year's facts (LStB, Rente, Kapital, every Vermietungsobjekt) — the
// stored field strings travel UNVERÄNDERT (open stays open, ADR-032) — and every copied value gets
// an UNBESTÄTIGTE Kennzeichnung (ADR-021) through the generic layer (ADR-0052 §6). A value the
// user already entered in the target year wins: the copy becomes a proposal (ADR-0052 §7). A year
// that was already taken over is a 409, a source year without ANY take-over-able fact is a 404.
// The real-Postgres proofs live in test/acceptance/req-028-jahresuebernahme.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { TakeoverService } from '../src/takeover/takeover.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakeYearTakeoverRepository } from './fakes/fake-year-takeover.repository.js'

const USER_ID = 'user-1'
const TARGET_YEAR = 2026

const LSTB_FIELDS_2025 = [
  { itemKey: 'lstb.bruttoarbeitslohn', lastYear: 2025, confirmed: false },
  { itemKey: 'lstb.lohnsteuer', lastYear: 2025, confirmed: false },
  { itemKey: 'lstb.sozialversicherung', lastYear: 2025, confirmed: false },
]

describe('UebernahmeService', () => {
  let repository: FakeMarkingRepository
  let lstb: FakeLstbRepository
  let pension: FakePensionRepository
  let capital: FakeCapitalRepository
  let rental: FakeRentalRepository
  let yearTakeover: FakeYearTakeoverRepository
  let service: TakeoverService

  beforeEach(() => {
    repository = new FakeMarkingRepository()
    lstb = new FakeLstbRepository()
    pension = new FakePensionRepository()
    capital = new FakeCapitalRepository()
    rental = new FakeRentalRepository()
    yearTakeover = new FakeYearTakeoverRepository()
    const confirmation = new ConfirmationService(repository, fieldAccessFrom({ lstb, pension, capital, rental }), new AuditService(new FakeAuditRepository()))
    service = new TakeoverService(repository, confirmation, lstb, pension, capital, rental, yearTakeover)
  })

  it('kopiert die LStB-Zeile des Vorjahrs unverändert und markiert sie UNBESTÄTIGT (ADR-021)', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const response = await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    expect(response).toEqual({ markings: LSTB_FIELDS_2025 })
    // Die kopierten Feld-Strings sind unverändert (die ehrlichen Zustände reisen mit).
    const copy = await lstb.findForUserAndYear(USER_ID, TARGET_YEAR)
    expect(copy).toMatchObject({ bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
  })

  it('M2: kopiert ALLE Fakten — LStB + Rente + Kapital + jedes Vermietungsobjekt, je eine Kennzeichnung', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    pension.seed({ userId: USER_ID, taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })
    capital.seed({ userId: USER_ID, taxYear: 2025, kapitalertraege: '3000' })
    rental.seed({ id: 'alt-1', userId: USER_ID, taxYear: 2025, mieteinnahmen: '9600', anschaffungskosten: '100000', baujahr: '1995', werbungskosten: '1200' })
    rental.seed({ id: 'alt-2', userId: USER_ID, taxYear: 2025, mieteinnahmen: '7200', anschaffungskosten: '80000', baujahr: '2001', werbungskosten: null })

    const response = await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    // Je kopiertem, nicht offenem Feld eine Kennzeichnung — offen bleibt offen und unmarkiert.
    const itemKeys = response.markings.map((k) => k.itemKey)
    expect(itemKeys.filter((k) => k.startsWith('lstb.'))).toHaveLength(3)
    expect(itemKeys.filter((k) => k.startsWith('rente.')).sort()).toEqual(['rente.jahresbetrag', 'rente.rentenart', 'rente.rentenbeginnJahr'])
    expect(itemKeys.filter((k) => k.startsWith('kapital.'))).toEqual(['kapital.kapitalertraege'])
    expect(itemKeys.filter((k) => k.startsWith('vermietung:'))).toHaveLength(7)
    expect(response.markings.every((k) => k.confirmed === false && k.lastYear === 2025)).toBe(true)

    // Die kopierten Fakten: Rente + Kapital unverändert, zwei Objekte mit allen Feld-Strings.
    const pensionCopy = await pension.findForUserAndYear(USER_ID, TARGET_YEAR)
    expect(pensionCopy).toMatchObject({ rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })
    const capitalCopy = await capital.findForUserAndYear(USER_ID, TARGET_YEAR)
    expect(capitalCopy).toMatchObject({ kapitalertraege: '3000' })
    const propertyCopies = await rental.listForUserAndYear(USER_ID, TARGET_YEAR)
    expect(propertyCopies).toHaveLength(2)
    expect(propertyCopies.map((o) => o.werbungskosten).sort()).toEqual(['1200', null])
  })

  it('ein zweiter Kopierversuch ist ein 409 — nie eine stille Kopie', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })
    await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2025)).rejects.toThrow('already taken over')
  })

  it('ein zweiter Kopierversuch ist auch dann ein 409, wenn der Nutzer alle übernommenen Felder selbst editiert hat', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })
    await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    // Nutzer ändert das Feld selbst in der Maske -> Kennzeichnung wird gelöscht
    await repository.remove(USER_ID, TARGET_YEAR, ['lstb.bruttoarbeitslohn'])

    // Zweiter Kopierversuch MUSS trotzdem ein 409 sein (Randfall-Schutz gegen doppelte Vermietungsobjekte)
    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2025)).rejects.toThrow('already taken over')
  })

  it('ein Vorjahr ohne EINEN einzigen übernehmbaren Fakt ist ein 404 — nie eine erfundene Kopie', async () => {
    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2025)).rejects.toThrow('Nothing to take over')
  })

  it('M2: eine Übernahme mit NUR Rente (kein LStB) funktioniert — der Fakt zählt, nicht die Anlage', async () => {
    pension.seed({ userId: USER_ID, taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: null, alterBeiRentenbeginn: null })

    const response = await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    expect(response).toEqual({
      markings: [
        { itemKey: 'rente.jahresbetrag', lastYear: 2025, confirmed: false },
        { itemKey: 'rente.rentenart', lastYear: 2025, confirmed: false },
      ],
    })
  })

  it('ein ungültiges von-Jahr ist ein 400 (nicht ganzzahlig, nicht vor dem Zieljahr)', async () => {
    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2025.5)).rejects.toThrow('strictly before')
    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2027)).rejects.toThrow('strictly before')
  })

  it('ADR-022: höchstens 4 Rückjahre — ein älteres von-Jahr ist ein 400, nie eine stille Alt-Kopie', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2021, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2021)).rejects.toThrow('at most 4 previous years')
  })

  it('ADR-022: genau 4 Rückjahre sind erlaubt', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2022, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    const response = await service.takeOver(USER_ID, TARGET_YEAR, 2022)

    expect(response.markings).toEqual([{ itemKey: 'lstb.bruttoarbeitslohn', lastYear: 2022, confirmed: false }])
  })

  it('ADR-0052 §7: ein im Zieljahr schon eingetragener Wert gewinnt — die Kopie wird ein Vorschlag', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: null })
    await lstb.setField(USER_ID, TARGET_YEAR, 'bruttoarbeitslohn', '52000')

    const response = await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    expect((await lstb.findForUserAndYear(USER_ID, TARGET_YEAR))?.bruttoarbeitslohn).toBe('52000')
    expect(response.markings).toEqual([{ itemKey: 'lstb.lohnsteuer', lastYear: 2025, confirmed: false }])
    expect(await repository.find(USER_ID, TARGET_YEAR, 'lstb.bruttoarbeitslohn')).toMatchObject({
      provenance: { kind: 'nutzer' },
      confirmed: true,
      proposal: { value: '50000', provenance: { kind: 'uebernahme', lastYear: 2025 } },
    })
  })

  it('ein zweiter Kopierversuch bleibt ein 409, auch wenn die Übernahme nur Vorschläge hinterließ', async () => {
    lstb.seed({ userId: USER_ID, taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })
    await lstb.setField(USER_ID, TARGET_YEAR, 'bruttoarbeitslohn', '52000')
    await service.takeOver(USER_ID, TARGET_YEAR, 2025)

    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2025)).rejects.toThrow('already taken over')
  })

  it('ist strikt auf userId und Steuerjahr gescoped', async () => {
    lstb.seed({ userId: 'someone-else', taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    await expect(service.takeOver(USER_ID, TARGET_YEAR, 2025)).rejects.toThrow('Nothing to take over')
    expect(await service.getState(USER_ID, TARGET_YEAR)).toEqual({ markings: [] })
  })
})
