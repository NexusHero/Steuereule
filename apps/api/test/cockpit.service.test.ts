// REQ-001 + ticket 15 (Cockpit-Echtdaten) — pure service logic: userId+steuerjahr scoping and
// the honest fold → wire mapping, against the fake repositories (no HTTP, no DB). The
// Schätz-Platzhalter is gone: the stand now derives from @steuereule/core's cockpitSpanneAusEingaben
// over the real LStB + interview figures. Mirrors profile.service.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { CockpitService } from '../src/cockpit/cockpit.service.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import type { CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'

describe('CockpitService', () => {
  let taxYear: FakeTaxYearRepository
  let lstb: FakeLstbRepository
  let interview: FakeInterviewAnswerRepository
  let takeover: FakeMarkingRepository
  let pension: FakePensionRepository
  let capital: FakeCapitalRepository
  let rental: FakeRentalRepository
  let ch: FakeChSalaryCertificateRepository
  let service: CockpitService

  beforeEach(() => {
    taxYear = new FakeTaxYearRepository()
    lstb = new FakeLstbRepository()
    interview = new FakeInterviewAnswerRepository()
    takeover = new FakeMarkingRepository()
    pension = new FakePensionRepository()
    capital = new FakeCapitalRepository()
    rental = new FakeRentalRepository()
    ch = new FakeChSalaryCertificateRepository()
    service = new CockpitService(taxYear, lstb, interview, takeover, pension, capital, rental, ch)
  })

  it('REQ-001 returns null for a userId/steuerjahr with nothing seeded — the honest empty state', async () => {
    await expect(service.getSummary('user-a', 2026)).resolves.toBeNull()
  })

  it('derives a point value from the settled LStB Bruttoarbeitslohn once nothing is open (ADR-015)', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary).toEqual({ taxYear: 2026, status: { kind: 'bestimmt', value: 50000 }, openItems: 0 })
  })

  it('widens into a spanne when LStB fields are still open, around the settled partial sum', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 2 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    // Only the Bruttoarbeitslohn is entered; lohnsteuer + sozialversicherung remain open.
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: null, sozialversicherung: null })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status.kind).toBe('spanne')
    // 2 open LStB fields × 60 = 120 uncertainty around the settled 50000.
    expect(summary?.status).toEqual({ kind: 'spanne', from: 49880, to: 50120, openItems: 2, conflicts: 0, unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('ADR-021: eine unbestätigte Übernahme zählt in die Spanne — ruhig benannt, kein Konflikt', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    void takeover.save('user-a', 2026, { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: false, proposal: null })

    const summary = await service.getSummary('user-a', 2026)

    // Der Punktwert ist versagt; die Spanne trägt die übernommenen 50.000 € als Unsicherheit.
    expect(summary?.status).toEqual({
      kind: 'spanne',
      from: 0,
      to: 100000,
      openItems: 0,
      conflicts: 0,
      unconfirmedItems: 1,
      unconfirmedSum: 50000,
    })
  })

  it('ADR-0052 §6: ein Fakt mit nur EINEM unbestätigten Feld (nicht der Summe) zählt trotzdem als unbestätigt', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    await takeover.save('user-a', 2026, { key: 'lstb.lohnsteuer', provenance: { kind: 'assistent', name: 'Claude' }, confirmed: false, proposal: null })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status).toMatchObject({ kind: 'spanne', unconfirmedItems: 1, unconfirmedSum: 50000 })
  })

  it('ADR-021: eine BESTÄTIGTE Übernahme ergibt wieder den Punktwert', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    void takeover.save('user-a', 2026, { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: true, proposal: null })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status).toEqual({ kind: 'bestimmt', value: 50000 })
  })

  it('ADR-021 M2: unbestätigte Rente/Kapital/Vermietung zählen MIT — jede erfasste Summe weitet die Spanne', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    void takeover.save('user-a', 2026, { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: false, proposal: null })
    void takeover.save('user-a', 2026, { key: 'rente.jahresbetrag', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: false, proposal: null })
    void takeover.save('user-a', 2026, { key: 'kapital.kapitalertraege', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: false, proposal: null })
    void takeover.save('user-a', 2026, { key: 'vermietung:obj-1.mieteinnahmen', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: false, proposal: null })
    pension.seed({ userId: 'user-a', taxYear: 2026, rentenart: 'GesetzlicheRente', jahresbetrag: '12000', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })
    capital.seed({ userId: 'user-a', taxYear: 2026, kapitalertraege: '3000' })
    rental.seed({ id: 'obj-1', userId: 'user-a', taxYear: 2026, mieteinnahmen: '9600', anschaffungskosten: '100000', baujahr: '1995', werbungskosten: '1200' })

    const summary = await service.getSummary('user-a', 2026)

    // 4 unbestätigte Fakten: 50000 + 12000 + 3000 + 9600 = 74600 als Unsicherheit.
    expect(summary?.status).toEqual({
      kind: 'spanne',
      from: 0,
      to: 50000 + 74600,
      openItems: 0,
      conflicts: 0,
      unconfirmedItems: 4,
      unconfirmedSum: 74600,
    })
  })

  it('ADR-021 M2: ein offenes kopiertes Feld trägt keine Summe — offen bleibt offen, nie ein fabricated zero', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })
    void takeover.save('user-a', 2026, { key: 'kapital.kapitalertraege', provenance: { kind: 'uebernahme', lastYear: 2025 }, confirmed: false, proposal: null })
    capital.seed({ userId: 'user-a', taxYear: 2026, kapitalertraege: null })

    const summary = await service.getSummary('user-a', 2026)

    // Der offene kopierte Fakt zählt NICHT in die Spanne — die LStB (nicht übernommen) bleibt bestimmt.
    expect(summary?.status).toEqual({ kind: 'bestimmt', value: 50000 })
  })

  it('names the LStB widerspruch as a conflict, widening more than an item (ADR-008)', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    // lohnsteuer (60000) exceeds the Bruttoarbeitslohn (50000) — a named widerspruch, never fixed.
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '60000', sozialversicherung: '0' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status).toEqual({ kind: 'spanne', from: 50000 - 100, to: 50000 + 100, openItems: 0, conflicts: 1, unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('reports a gated Einkunftsart honestly, naming it rather than widening into a fake range (ADR-032)', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    // Beides declares Gewerbe — gated in 1.0; the Angestellte income is still settled.
    interview.seed('user-a', 2026, { job: 'Beides' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status).toEqual({ kind: 'gated', sum: 50000, gated: ['Gewerbe'] })
  })

  it('does not count LStB fields as open for a non-Angestellte person (Rente has no LStB)', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Rente' })
    // A pensioner has no LStB to transcribe, so the (absent) LStB must not widen the range.
    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status).toEqual({ kind: 'bestimmt', value: 0 })
  })

  it('adds the declared Nebenjob Brutto to the settled income sum', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt', nebenjob: 'Nebenjob', 'nebenjob-brutto': '4000' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    const summary = await service.getSummary('user-a', 2026)

    expect(summary?.status).toEqual({ kind: 'bestimmt', value: 54000 })
  })

  it('REQ-001 strictly scopes per userId: user-b never sees user-a’s tax year', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })
    interview.seed('user-a', 2026, { job: 'Angestellt' })
    lstb.seed({ userId: 'user-a', taxYear: 2026, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '9000' })

    await expect(service.getSummary('user-b', 2026)).resolves.toBeNull()
  })

  it('REQ-001 strictly scopes per steuerjahr: the same userId with only 2026 seeded returns null for 2025', async () => {
    taxYear.seed('user-a', { taxYear: 2026, openItems: 0 })

    await expect(service.getSummary('user-a', 2025)).resolves.toBeNull()
  })

  describe('Grenzgänger CH — the Lohnausweis is the income, not the empty LStB', () => {
    const CROSS_BORDER = { job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }

    function salaryCertificate(fields: Partial<CrossBorderSalaryStatementRecord['fields']>, rate: number | null): CrossBorderSalaryStatementRecord {
      return {
        userId: 'user-a',
        taxYear: 2025,
        fields: fields as CrossBorderSalaryStatementRecord['fields'],
        bemerkungen: null,
        saeule3aChf: null,
        krankenkasseChf: null,
        exchangeRateMonth: rate === null ? null : '2025-12',
        exchangeRateValue: rate,
        exchangeRateMode: rate === null ? null : 'amtlich',
        exchangeRateReceiptId: null,
        nGre: {} as CrossBorderSalaryStatementRecord['nGre'],
      }
    }

    it('shows the converted Lohnausweis Bruttolohn as a point value once everything is there', async () => {
      taxYear.seed('user-a', { taxYear: 2025, openItems: 0 })
      interview.seed('user-a', 2025, CROSS_BORDER)
      ch.seed(salaryCertificate({ 'bruttolohn-total': '90000', 'berufliche-vorsorge': '4500', quellensteuer: '4050' }, 1.07))

      const summary = await service.getSummary('user-a', 2025)

      expect(summary?.status).toEqual({ kind: 'bestimmt', value: 96300 })
    })

    it('counts the missing rate and the missing Lohnausweis figures as open, never the LStB', async () => {
      taxYear.seed('user-a', { taxYear: 2025, openItems: 0 })
      interview.seed('user-a', 2025, CROSS_BORDER)
      ch.seed(salaryCertificate({ 'bruttolohn-total': '90000', 'berufliche-vorsorge': '4500' }, null))

      const summary = await service.getSummary('user-a', 2025)

      expect(summary?.status).toMatchObject({ kind: 'spanne', openItems: 2 })
    })
  })
})
