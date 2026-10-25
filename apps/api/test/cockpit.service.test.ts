// REQ-001 + ticket 15 (Cockpit-Echtdaten) — pure service logic: userId+steuerjahr scoping and
// the honest fold → wire mapping, against the fake repositories (no HTTP, no DB). The
// Schätz-Platzhalter is gone: the stand now derives from @steuereule/core's cockpitSpanneAusEingaben
// over the real LStB + interview figures. Mirrors profile.service.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'
import { FakeUebernahmeRepository } from './fakes/fake-uebernahme.repository.js'

describe('CockpitService', () => {
  let taxYear: FakeTaxYearRepository
  let lstb: FakeLstbRepository
  let interview: FakeInterviewAnswerRepository
  let uebernahme: FakeUebernahmeRepository
  let service: CockpitService

  beforeEach(() => {
    taxYear = new FakeTaxYearRepository()
    lstb = new FakeLstbRepository()
    interview = new FakeInterviewAnswerRepository()
    uebernahme = new FakeUebernahmeRepository()
    service = new CockpitService(taxYear, lstb, interview, uebernahme)
  })

  it('REQ-001 returns null for a userId/steuerjahr with nothing seeded — the honest empty state', async () => {
    await expect(service.getSummary('user-a', 2026)).resolves.toBeNull()
  })

  it('derives a point value from the settled LStB Bruttoarbeitslohn once nothing is open (ADR-015)', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary).toEqual({ taxYear: 2026, stand: { kind: 'bestimmt', wert: 50000 }, openItems: 0 })
  })

  it('widens into a spanne when LStB fields are still open, around the settled partial sum', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 2 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    // Only the Bruttoarbeitslohn is entered; lohnsteuer + sozialversicherung remain open.
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.stand.kind).toBe('spanne')
    // 2 open LStB fields × 60 = 120 uncertainty around the settled 50000.
    expect(summary?.stand).toEqual({ kind: 'spanne', von: 49880, bis: 50120, offenePosten: 2, konflikte: 0, unbestaetigte: 0, unbestaetigteSumme: 0 })
  })

  it('ADR-021: eine unbestätigte Übernahme zählt in die Spanne — ruhig benannt, kein Konflikt', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    uebernahme.seed({ userId: 'user-a', steuerjahr: 2026, vorjahr: 2025, postenKey: 'lstb', bestaetigt: false })

    const summary = await service.getSummary('user-a', 2026)

    // Der Punktwert ist versagt; die Spanne trägt die übernommenen 50.000 € als Unsicherheit.
    expect(summary?.stand).toEqual({
      kind: 'spanne',
      von: 0,
      bis: 100000,
      offenePosten: 0,
      konflikte: 0,
      unbestaetigte: 1,
      unbestaetigteSumme: 50000,
    })
  })

  it('ADR-021: eine BESTÄTIGTE Übernahme ergibt wieder den Punktwert', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    uebernahme.seed({ userId: 'user-a', steuerjahr: 2026, vorjahr: 2025, postenKey: 'lstb', bestaetigt: true })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.stand).toEqual({ kind: 'bestimmt', wert: 50000 })
  })

  it('names the LStB widerspruch as a conflict, widening more than an item (ADR-008)', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    // lohnsteuer (60000) exceeds the Bruttoarbeitslohn (50000) — a named widerspruch, never fixed.
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '60000', sozialversicherung: '0' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.stand).toEqual({ kind: 'spanne', von: 50000 - 100, bis: 50000 + 100, offenePosten: 0, konflikte: 1, unbestaetigte: 0, unbestaetigteSumme: 0 })
  })

  it('reports a gated Einkunftsart honestly, naming it rather than widening into a fake range (ADR-032)', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    // Beides declares Gewerbe — gated in 1.0; the Angestellte income is still settled.
    interview.seed('user-a', 2026, { job: 'Beides' })
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.stand).toEqual({ kind: 'gated', summe: 50000, gegated: ['Gewerbe'] })
  })

  it('does not count LStB fields as open for a non-Angestellte person (Rente has no LStB)', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Rente' })
    // A pensioner has no LStB to transcribe, so the (absent) LStB must not widen the range.
    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.stand).toEqual({ kind: 'bestimmt', wert: 0 })
  })

  it('adds the declared Nebenjob Brutto to the settled income sum', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt', nebenjob: 'Nebenjob', 'nebenjob-brutto': '4000' })
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.stand).toEqual({ kind: 'bestimmt', wert: 54000 })
  })

  it('REQ-001 strictly scopes per userId: user-b never sees user-a’s tax year', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', steuerjahr: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    await expect(service.getSummary('user-b', 2026)).resolves.toBeNull()
  })

  it('REQ-001 strictly scopes per steuerjahr: the same userId with only 2026 seeded returns null for 2025', async () => {
    taxYear.seed('user-a', { steuerjahr: 2026, openItems: 0 })

    await expect(service.getSummary('user-a', 2025)).resolves.toBeNull()
  })
})
