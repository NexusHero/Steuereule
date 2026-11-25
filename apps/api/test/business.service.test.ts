// ADR-0101 — the self-employment path against in-memory repositories: the switch, the profile's
// suggestion, the append-only book with its hash chain (read and export refuse a tampered book), Storno,
// Festschreibung, quick path, bank import, VAT, trade tax with the Hebesatz table, the ELSTER fill-in help
// behind the tier, and booking drafts posted only on accept.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serializeBookingDraft, type BookingDraft } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { composeBusinessService } from '../src/business/business.composition.js'
import { bookingFieldAccess } from '../src/business/booking-field-access.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import type { UnlockService } from '../src/unlock/unlock.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

const A1 = { person: 'A', business: 1 } as const

const YEAR = 2024
const SPARKASSE = readFileSync(new URL('../../../packages/core/src/domains/ledger/__fixtures__/sparkasse-csv-camt-v2.csv', import.meta.url), 'utf8')

const sale: BookingDraft = {
  date: '2024-03-01',
  documentNumber: 'RE-2024-001',
  text: 'Honorar Projekt A',
  lines: [
    { account: '1200', side: 'debit', amount: 119_000 },
    { account: '8400', side: 'credit', amount: 119_000, taxKey: 'ust19' },
  ],
}

const supplies: BookingDraft = {
  date: '2024-03-05',
  documentNumber: 'Q-17',
  text: 'Büromaterial',
  lines: [
    { account: '4930', side: 'debit', amount: 11_900, taxKey: 'vst19' },
    { account: '1200', side: 'credit', amount: 11_900 },
  ],
}

function setup(job = 'Selbstständig', unlocked = true) {
  const repository = new FakeBusinessRepository()
  const interview = new FakeInterviewAnswerRepository()
  interview.seed('u', YEAR, { job })
  interview.seed('u', 2025, { job })
  interview.seed('u', 2026, { job })
  const unlock = { status: async () => (unlocked ? 'freigeschaltet' : 'offen') } as unknown as UnlockService
  let tick = 0
  const clock = () => `2026-11-19T10:00:${String(tick++ % 60).padStart(2, '0')}.000Z`
  const service = composeBusinessService(repository, interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory(), unlock, clock)
  return { repository, interview, service }
}

describe('BusinessService (ADR-0101)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  beforeEach(() => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('switch off: the whole path answers 403, nothing is stored', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    const { service, repository } = setup()
    await expect(service.getProfile('u', YEAR, A1)).rejects.toMatchObject({ code: 'SELF_EMPLOYMENT_DISABLED' })
    await expect(service.post('u', YEAR, A1, sale)).rejects.toMatchObject({ code: 'SELF_EMPLOYMENT_DISABLED' })
    expect(repository.books.size).toBe(0)
  })

  it('an employee without a business is refused even with the switch on', async () => {
    const { service } = setup('Angestellt')
    await expect(service.getProfile('u', YEAR, A1)).rejects.toMatchObject({ code: 'SELF_EMPLOYMENT_NOT_DECLARED' })
  })

  it('the profession answers yield the core’s suggestion with its reasons, the user confirms', async () => {
    const { service } = setup()
    const saved = await service.saveProfile('u', YEAR, A1, {
      professionAnswers: { catalogProfession: 'Ingenieur', ownExpertWork: true, employsQualifiedStaff: false, leadsPersonally: true, tradesGoods: false } as never,
      confirmedKind: 'freiberuf',
    })
    expect(saved.suggestion?.suggestion).toBe('freiberuf')
    expect(saved.suggestion?.reasons.length).toBeGreaterThan(0)
    expect(saved.confirmedKind).toBe('freiberuf')
  })

  it('PUT merges: a field left out keeps its value, null clears it, a fact object merges key by key', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { name: 'Büro Muster', startDate: '2021-04-01', tradeTaxInputs: { financing: { debtChargesEur: 1000 }, einheitswertEur: 5000 } })
    const merged = await service.saveProfile('u', YEAR, A1, { smallBusiness: true, tradeTaxInputs: { einheitswertEur: 7000 } })
    expect(merged).toMatchObject({ name: 'Büro Muster', startDate: '2021-04-01', smallBusiness: true, tradeTaxInputs: { einheitswertEur: 7000, financing: { debtChargesEur: 1000 } } })
    const cleared = await service.saveProfile('u', YEAR, A1, { tradeTaxInputs: { financing: null } })
    expect(cleared.tradeTaxInputs).toEqual({ einheitswertEur: 7000 })
    expect((await service.saveProfile('u', YEAR, A1, { name: null })).name).toBeNull()
  })

  it('WEB-30: changing one loss field keeps Vortrag, Platz der Vorjahre, Rücktrag and Verzicht', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { lossFacts: { carriedForwardEur: 10_000, roomEur: [5_000, 2_000], carriedBackEur: 300, waiveCarryBack: true } })

    const saved = await service.saveProfile('u', YEAR, A1, { lossFacts: { carriedForwardEur: 12_000 } })

    expect(saved.lossFacts).toEqual({ carriedForwardEur: 12_000, roomEur: [5_000, 2_000], carriedBackEur: 300, waiveCarryBack: true })
    expect((await service.saveProfile('u', YEAR, A1, { lossFacts: { carriedBackEur: null } })).lossFacts).not.toHaveProperty('carriedBackEur')
  })

  it('WEB-31: a click on the period keeps § 148 exemption, Dauerfrist, Sondervorauszahlung and Monatswahl', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { vatPeriodFacts: { exemptFromBookkeeping: true, extension: true, specialPrepaymentEur: 800, chooseMonthly: true } })

    const saved = await service.saveProfile('u', YEAR, A1, { vatPeriodFacts: { period: 'quartal' } })

    expect(saved.vatPeriodFacts).toEqual({ exemptFromBookkeeping: true, extension: true, specialPrepaymentEur: 800, chooseMonthly: true, period: 'quartal' })
  })

  it('posts entries with VAT lines, numbers them gaplessly and keeps an intact hash chain', async () => {
    const { service } = setup()
    const first = await service.post('u', YEAR, A1, sale)
    const second = await service.post('u', YEAR, A1, supplies)
    expect([first.number, second.number]).toEqual([1, 2])
    expect(first.lines.map((l) => [l.account, l.side, l.amount])).toEqual([
      ['1200', 'debit', 119_000],
      ['8400', 'credit', 100_000],
      ['1776', 'credit', 19_000],
    ])
    const book = await service.getBook('u', YEAR, A1)
    expect(book.integrity).toMatchObject({ ok: true, entries: 2 })
  })

  it('a tampered entry shows as a broken book on read, and every export and booking refuses', async () => {
    const { service, repository } = setup()
    await service.post('u', YEAR, A1, sale)
    repository.tamper('u', YEAR, A1, 1, (entry) => ({ ...entry, text: 'geändert' }))
    const book = await service.getBook('u', YEAR, A1)
    expect(book.integrity).toMatchObject({ ok: false })
    expect(book.integrity.ok ? '' : book.integrity.reason).toMatch(/Buchung 1 weicht vom Protokoll ab/)
    await expect(service.gobdExport('u', YEAR, A1)).rejects.toMatchObject({ code: 'BOOK_INTEGRITY_BROKEN' })
    await expect(service.post('u', YEAR, A1, supplies)).rejects.toMatchObject({ code: 'BOOK_INTEGRITY_BROKEN' })
  })

  it('Storno mirrors the entry; the original stays and cannot be reversed twice', async () => {
    const { service } = setup()
    await service.post('u', YEAR, A1, supplies)
    const storno = await service.reverse('u', YEAR, A1, 1, { date: '2024-03-06', documentNumber: 'ST-1' })
    expect(storno.reversalOf).toBe(1)
    await expect(service.reverse('u', YEAR, A1, 1, { date: '2024-03-07', documentNumber: 'ST-2' })).rejects.toMatchObject({ code: 'LEDGER_ALREADY_REVERSED' })
    const book = await service.getBook('u', YEAR, A1)
    expect(book.entries[0]?.reversedBy).toBe(2)
  })

  it('Festschreibung blocks bookings in the period and never moves back', async () => {
    const { service } = setup()
    await service.lock('u', YEAR, A1, '2024-03-31')
    await expect(service.post('u', YEAR, A1, sale)).rejects.toMatchObject({ code: 'BOOKING_PERIOD_LOCKED' })
    await expect(service.lock('u', YEAR, A1, '2024-01-31')).rejects.toMatchObject({ code: 'LEDGER_PERIOD_LOCKED' })
  })

  it('an asset is registered with its booking in one transaction: a failed asset insert books nothing', async () => {
    const { service, repository } = setup()
    const notebook: BookingDraft = {
      date: '2024-03-14',
      documentNumber: 'RE-IT-1',
      text: 'Notebook',
      lines: [
        { account: '0420', side: 'debit', amount: 142_800, taxKey: 'vst19' },
        { account: '1200', side: 'credit', amount: 142_800 },
      ],
      asset: { label: 'Notebook', method: 'linear', category: 'computer' },
    }
    repository.failAssetInsert = true
    await expect(service.post('u', YEAR, A1, notebook)).rejects.toThrow(/asset insert failed/)
    expect(repository.books.get(`u|${YEAR}|A|1`)?.entries ?? []).toHaveLength(0)
    expect(repository.assets).toHaveLength(0)
    repository.failAssetInsert = false
    await service.post('u', YEAR, A1, notebook)
    expect(repository.assets).toMatchObject([{ account: '0420', acquisitionCost: 120_000, usefulLifeYears: 1 }])
  })

  it('§ 11: a payment on 5 January is booked in the payment year’s book and counts in that year’s EÜR', async () => {
    const { service } = setup()
    await service.post('u', 2025, A1, {
      date: '2025-01-05',
      documentNumber: 'M-12',
      text: 'Büromiete Dezember 2024',
      lines: [
        { account: '4210', side: 'debit', amount: 80_000 },
        { account: '1200', side: 'credit', amount: 80_000 },
      ],
    })
    const closing = await service.closing('u', 2025, A1)
    expect(closing.euer?.totals.byKey.ausgaben_raumkosten).toBe(80_000)
    expect(closing.euer?.totals.ausgaben).toBe(80_000)
  })

  it('a booking dated in another year is refused', async () => {
    const { service } = setup()
    await expect(service.post('u', YEAR, A1, { ...sale, date: '2025-01-02' })).rejects.toMatchObject({ code: 'BOOKING_WRONG_YEAR' })
  })

  it('the quick path books EÜR totals; the closing derives the profit from them', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [
      { key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 5_000_000 },
      { key: 'ausgaben_telekommunikation', amountCents: 120_000 },
    ])
    const closing = await service.closing('u', YEAR, A1)
    expect(closing.mode).toBe('euer')
    expect(closing.euer?.profit.profitEur).toBe(48_800)
  })

  it('a refund above the costs of the year raises the profit instead of failing the closing', async () => {
    const { service } = setup()
    await service.post('u', YEAR, A1, sale)
    const before = await service.closing('u', YEAR, A1)
    // A credit note for last year's office supplies: 4930 nets below 0 in 2024.
    await service.post('u', YEAR, A1, {
      date: '2024-04-02',
      documentNumber: 'GS-3',
      text: 'Gutschrift Büromaterial 2023',
      lines: [
        { account: '1200', side: 'debit', amount: 5_950 },
        { account: '4930', side: 'credit', amount: 5_950, taxKey: 'vst19' },
      ],
    })
    const closing = await service.closing('u', YEAR, A1)
    expect(closing.euer?.totals.byKey.ausgaben_sonstige).toBe(-5_000)
    expect(closing.euer?.profit.profitEur).toBe((before.euer?.profit.profitEur ?? 0) + 59.5)
  })

  it('bank import: preset CSV in, duplicates out on a re-import, a suggestion accepted as a booking with a rule', async () => {
    const { service } = setup()
    const first = await service.importBank('u', 2025, A1, { format: 'csv', content: SPARKASSE, preset: 'sparkasse' })
    expect(first.added).toBeGreaterThan(0)
    const again = await service.importBank('u', 2025, A1, { format: 'csv', content: SPARKASSE, preset: 'sparkasse' })
    expect(again.added).toBe(0)
    const list = await service.listBank('u', 2025, A1)
    const income = list.find((t) => t.transaction.amount === 119_000)!
    const entry = await service.acceptBank('u', 2025, A1, income.id, { account: '8400', taxKey: 'ust19', remember: true })
    expect(entry.lines[0]).toMatchObject({ account: '1200', side: 'debit', amount: 119_000 })
    const after = await service.listBank('u', 2025, A1)
    expect(after.find((t) => t.id === income.id)?.status).toBe('gebucht')
  })

  it('the VAT return is read off the journal: output and input VAT, prepayments', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { vatPrepaymentsCents: 1_000_000 })
    await service.post('u', YEAR, A1, sale)
    await service.post('u', YEAR, A1, supplies)
    const { result } = await service.vatReturn('u', YEAR, A1)
    expect(result.outputVat.standard).toBe(19_000 / 100)
    expect(result.inputVatDeductibleEur).toBe(19)
    expect(result.prepaymentsEur).toBe(10_000)
  })

  it('tests the Kleinunternehmer rule against the book: the founding year has the lower limit, the year before comes from its book (§ 19 UStG)', async () => {
    const { service } = setup()
    await service.saveProfile('u', 2025, A1, { smallBusiness: true, startDate: '2025-10-01' })
    await service.quickEntry('u', 2025, A1, [{ key: 'einnahmen_kleinunternehmer', amountCents: 2_600_000, date: '2025-12-01' }])
    expect((await service.vatReturn('u', 2025, A1)).smallBusiness).toEqual({
      eligible: false, priorYearLimitEur: 25_000, currentYearLimitEur: 25_000, crossed: 'current_year', foundingYear: true, priorYearKnown: true, turnoverEur: 26_000, matchesProfile: false,
      // The one quick entry passed the founding year's 25.000 €: taxed from its date (§ 19 Abs. 1 Satz 1 UStG).
      taxedFrom: '2025-12-01',
    })

    await service.saveProfile('u', YEAR, A1, { smallBusiness: true, startDate: '2020-01-01' })
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_kleinunternehmer', amountCents: 2_000_000 }])
    await service.saveProfile('u', 2025, A1, { startDate: '2020-01-01' })
    const later = (await service.vatReturn('u', 2025, A1)).smallBusiness
    // 20.000 € in 2024 keep the 25.000 € limit; 26.000 € in 2025 are under 100.000 €.
    expect(later).toMatchObject({ eligible: true, foundingYear: false, priorYearKnown: true, matchesProfile: true })
  })

  it('trade tax: Freiberuf owes none; a Gewerbe uses the table by AGS, the user’s correction wins', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 10_000_000 }])
    expect(await service.tradeTax('u', YEAR, A1)).toMatchObject({ status: 'entfaellt' })
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'gewerbe' })
    expect(await service.tradeTax('u', YEAR, A1)).toMatchObject({ status: 'offen', missing: ['hebesatz'] })
    await service.saveProfile('u', YEAR, A1, { municipalityAgs: '09162000' })
    const table = await service.tradeTax('u', YEAR, A1)
    expect(table).toMatchObject({ status: 'berechnet', multiplier: { percent: 490, source: 'tabelle' } })
    // 100.000 − 24.500 = 75.500 × 3,5 % = 2.642 € Messbetrag × 490 %
    expect(table.status === 'berechnet' ? table.result.tradeTaxEur : null).toBe(12_945.8)
    await service.saveProfile('u', YEAR, A1, { multiplierOverride: 400 })
    expect(await service.tradeTax('u', YEAR, A1)).toMatchObject({ status: 'berechnet', multiplier: { percent: 400, source: 'korrektur' } })
  })

  it('the Hebesatz lookup returns ambiguous names as choices and says which table year it used', () => {
    const { service } = setup()
    const neustadt = service.lookupHebesatz(2025, 'Neustadt')
    expect(neustadt.kind).toBe('choices')
    expect(neustadt.tableYear).toBe(2024)
    expect(neustadt.note).toMatch(/2024/)
    expect(service.lookupHebesatz(2024, 'München', 'BY')).toMatchObject({ kind: 'found', municipality: { multiplierPercent: 490 } })
  })

  it('ELSTER fill-in help: EÜR lines with Zeile and value; Anlage S without line numbers says why; locked without the tier', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'ausgaben_telekommunikation', amountCents: 120_000 }])
    const euer = await service.elsterHelp('u', YEAR, A1, 'anlage-euer')
    expect(euer.status).toBe('published')
    const telecom = euer.lines.find((l) => l.id === 'euer.ausgaben.kz280')
    expect(telecom).toMatchObject({ value: 1200 })
    expect(telecom?.zeile).toBeTruthy()
    expect(euer.lineNumbersAvailable).toBe(true)
    const s = await service.elsterHelp('u', YEAR, A1, 'anlage-s')
    expect(s.status).toBe('not_available')
    expect(s.lineNumbersAvailable).toBe(false)
    // The app says it once from `lineNumbersAvailable`; the API adds no second sentence.
    expect(s.note).toBeNull()
    expect(s.lineNumbersAvailable).toBe(false)
    // By meaning, with a stable id and the German field name, even without official line numbers.
    expect(s.lines).toEqual([{ id: 'anlage-s.gewinn', zeile: null, kennzahlen: [], label: 'Gewinn aus freiberuflicher Tätigkeit', column: null, value: -1200 }])

    const locked = setup('Selbstständig', false)
    await expect(locked.service.elsterHelp('u', YEAR, A1, 'anlage-euer')).rejects.toMatchObject({ status: 402 })
    await expect(locked.service.gobdExport('u', YEAR, A1)).rejects.toMatchObject({ status: 402 })
  })

  it('Anlage G and GewSt 1 A by meaning: Gewinn, § 35 figures and the GewSt fields of the catalogue, without Zeile', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'gewerbe', multiplierOverride: 400, tradeTaxInputs: { financing: { debtChargesEur: 3000 }, einheitswertEur: 20_000 } })
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 6_000_000 }])
    const g = await service.elsterHelp('u', YEAR, A1, 'anlage-g')
    expect(g).toMatchObject({ status: 'not_available', lineNumbersAvailable: false })
    expect(g.lines.map((l) => [l.id, l.label, l.zeile])).toEqual([
      ['anlage-g.gewinn', 'Gewinn aus Gewerbebetrieb', null],
      ['anlage-g.messbetrag', 'Gewerbesteuer-Messbetrag (§ 35 EStG)', null],
      ['anlage-g.gewerbesteuer', 'Tatsächlich zu zahlende Gewerbesteuer (§ 35 EStG)', null],
    ])
    expect(g.lines[0]?.value).toBe(60_000)
    const gewst = await service.elsterHelp('u', YEAR, A1, 'gewst-1-a')
    expect(gewst).toMatchObject({ status: 'published', lineNumbersAvailable: false })
    const byId = Object.fromEntries(gewst.lines.map((l) => [l.id, l.value]))
    expect(byId['gewst.gewinn']).toBe(60_000)
    expect(byId['gewst.hinzurechnung-entgelte-schulden']).toBe(3000)
    expect(byId['gewst.kuerzung-grundbesitz-einheitswert']).toBe(20_000)
    expect(gewst.lines.every((l) => l.zeile === null)).toBe(true)
  })

  it('GewSt 1 A names the Betriebsstätte by Gemeinde and AGS; the trade tax shows the profit and the § 10a loss used', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'gewerbe', municipalityAgs: '14713000', tradeTaxInputs: { lossCarriedForwardEur: 10_000 } })
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 8_200_000 }])
    const gewst = await service.elsterHelp('u', YEAR, A1, 'gewst-1-a')
    expect(gewst.lines.find((l) => l.id === 'gewst.betriebsstaette')?.value).toBe('Leipzig (AGS 14713000)')
    const trade = await service.tradeTax('u', YEAR, A1)
    expect(trade).toMatchObject({ status: 'berechnet', profitEur: 82_000, result: { lossUsedEur: 10_000, tradeIncomeBeforeLossEur: 82_000, roundedTradeIncomeEur: 72_000 } })
  })

  it('Anlage Sonstiges: the Feststellung line is a yes/no box („Ja“), the amount has no line of its own', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { lossFacts: { carriedForwardEur: 10_000 } })
    const help = await service.elsterHelp('u', YEAR, A1, 'anlage-sonstiges')
    expect(help.lines.find((l) => l.id === 'anlage-sonstiges.verlustvortrag-festgestellt')).toMatchObject({ zeile: '17', value: 'Ja' })
    expect(help.lines.some((l) => l.value === 10_000)).toBe(false)
  })

  it('keeps several businesses of one person apart and sums them where the law does (ADR-0101 §22)', async () => {
    const { service } = setup()
    expect(await service.listBusinesses('u', YEAR, 'A')).toEqual([{ business: 1, name: null, kind: null, mode: 'euer' }])
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'freiberuf', name: 'Übersetzungen', smallBusiness: false, vatPrepaymentsCents: 50_000 })
    const shop = await service.addBusiness('u', YEAR, 'A', 'Onlineshop')
    expect(shop).toMatchObject({ business: 2, name: 'Onlineshop', vatPrepaymentsCents: 50_000 })
    const A2 = { person: 'A', business: 2 } as const
    await service.saveProfile('u', YEAR, A2, { confirmedKind: 'gewerbe', multiplierOverride: 400 })
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 3_000_000 }])
    await service.quickEntry('u', YEAR, A2, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 5_000_000 }])
    await service.post('u', YEAR, A1, sale)
    await service.post('u', YEAR, A2, supplies)

    // Each book on its own: the shop's journal does not hold the translator's entries.
    expect((await service.getBook('u', YEAR, A2)).entries.map((e) => e.documentNumber)).not.toContain('RE-2024-001')
    // Anlage S and G apart (EÜR: the VAT collected is income, the input VAT paid an expense), one Messbetrag for the Gewerbebetrieb.
    const input = await service.estimateInput('u', YEAR, 'A')
    expect(input?.business.selfEmployedEur).toBe(31_190)
    expect(input?.business.tradeEur).toBe(49_881)
    expect(input?.business.tradeTax).toHaveLength(1)
    // One Unternehmer, one VAT return over both books (§ 2 Abs. 1 Satz 2 UStG), person-wide prepayments.
    const vat = await service.vatReturn('u', YEAR, A2)
    expect(vat.result.outputVat.standard).toBe(190)
    expect(vat.result.inputVatDeductibleEur).toBe(19)
    expect(vat.result.prepaymentsEur).toBe(500)
    // A person-wide fact saved from the second business lands on the first.
    await service.saveProfile('u', YEAR, A2, { vatMethod: 'soll' })
    expect((await service.getProfile('u', YEAR, A1)).vatMethod).toBe('soll')
    expect((await service.listBusinesses('u', YEAR, 'A')).map((b) => b.name)).toEqual(['Übersetzungen', 'Onlineshop'])
  })

  it('removes a further business only while it has no book, never the first', async () => {
    const { service } = setup()
    await service.addBusiness('u', YEAR, 'A', 'Versehen')
    await expect(service.removeBusiness('u', YEAR, A1)).rejects.toMatchObject({ code: 'BUSINESS_FIRST_STAYS' })
    const A2 = { person: 'A', business: 2 } as const
    await service.post('u', YEAR, A2, sale)
    await expect(service.removeBusiness('u', YEAR, A2)).rejects.toMatchObject({ code: 'BUSINESS_HAS_BOOK' })
    await service.addBusiness('u', YEAR, 'A', 'Leer')
    await service.removeBusiness('u', YEAR, { person: 'A', business: 3 })
    expect((await service.listBusinesses('u', YEAR, 'A')).map((b) => b.business)).toEqual([1, 2])
  })

  it('a booking on a non-deductible account is listed but does not lower the EÜR profit (§ 4 Abs. 5 EStG)', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 1_000_000 }])
    const before = (await service.estimateInput('u', YEAR, 'A'))!.business.selfEmployedEur ?? 0
    // 4635 (SKR03) Geschenke über der Freigrenze: 200 € that the profit must not take.
    await service.post('u', YEAR, A1, { date: '2024-05-02', documentNumber: 'G-1', text: 'Geschenk', lines: [{ account: '4635', side: 'debit', amount: 20_000 }, { account: '1200', side: 'credit', amount: 20_000 }] })
    expect((await service.estimateInput('u', YEAR, 'A'))!.business.selfEmployedEur).toBe(before)
  })

  it('books the private use of a business car: Entnahme, VAT on 80 % of the full list price, the commute off the car costs (ADR-0101 §22)', async () => {
    const { service } = setup()
    await service.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 5_000_000 }, { key: 'ausgaben_kfz', amountCents: 1_400_000 }])
    const before = (await service.estimateInput('u', 2025, 'A'))!.business.selfEmployedEur ?? 0
    const car = { drive: 'elektro', acquired: '2024-05-01', listPriceGrossEur: 52_000, businessShareOver50: true, monthsInBusiness: 12, method: 'pauschal', totalCostsEur: 14_000, commute: { distanceKm: 15, days: 200 } } as const
    const computed = await service.companyCar('u', 2025, A1, car)
    expect(computed).toMatchObject({ kind: 'berechnet', privateUseEur: 1_560, vat: { baseEur: 4_992, vatEur: 948.48 } })
    const entries = await service.bookCompanyCar('u', 2025, A1, car)
    expect(entries.map((e) => e.documentNumber)).toEqual(['Kfz-Privat-2025'])
    // 13.000 × 0,03 % × 15 × 12 = 702 € less 900 € Pauschale: nothing non-deductible, only the Entnahme posts.
    const after = (await service.estimateInput('u', 2025, 'A'))!.business.selfEmployedEur ?? 0
    // The profit rises by the Entnahme (1.560 €) and the VAT on it as income (948,48 €), the quick totals carry no VAT key.
    expect(after - before).toBeCloseTo(1_560 + 948.48, 2)
    const vat = await service.vatReturn('u', 2025, A1)
    expect(vat.result.outputVat.standard).toBeCloseTo(948.48, 2)
  })

  it('moves the non-deductible commute of a petrol car off the car costs', async () => {
    const { service } = setup()
    await service.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 5_000_000 }, { key: 'ausgaben_kfz', amountCents: 1_400_000 }])
    const before = (await service.estimateInput('u', 2025, 'A'))!.business.selfEmployedEur ?? 0
    const car = { drive: 'verbrenner', acquired: '2023-04-01', listPriceGrossEur: 45_990, businessShareOver50: true, monthsInBusiness: 12, method: 'pauschal', totalCostsEur: 14_000, commute: { distanceKm: 15, days: 200 } } as const
    const entries = await service.bookCompanyCar('u', 2025, A1, car)
    expect(entries.map((e) => e.documentNumber)).toEqual(['Kfz-Privat-2025', 'Kfz-Wege-2025'])
    const after = (await service.estimateInput('u', 2025, 'A'))!.business.selfEmployedEur ?? 0
    // Entnahme 5.508 € + its VAT 837,22 € + the commute 1.578,60 € that no longer counts as an expense.
    expect(after - before).toBeCloseTo(5_508 + 837.22 + 1_578.6, 2)
  })

  it('computes the Voranmeldungen from the book and carries their total into the annual return (§ 18 UStG, ADR-0101 §22)', async () => {
    const { service } = setup()
    // 2024: 12.000 € VAT owed → 2025 monthly (above 9.000 €).
    await service.post('u', 2024, A1, { date: '2024-06-01', documentNumber: 'R-24', text: 'Honorar', lines: [{ account: '1200', side: 'debit', amount: 7_516_000 }, { account: '8400', side: 'credit', amount: 7_516_000, taxKey: 'ust19' }] })
    await service.saveProfile('u', 2025, A1, { vatPeriodFacts: { extension: true } })
    await service.post('u', 2025, A1, { ...sale, date: '2025-03-01', documentNumber: 'R-25-1' })
    await service.post('u', 2025, A1, { ...supplies, date: '2025-03-05', documentNumber: 'Q-25-1' })
    // An intra-EU supply in May to an Austrian buyer.
    await service.post('u', 2025, A1, { date: '2025-05-02', documentNumber: 'R-25-2', text: 'Lieferung Wien', counterpartyVatId: 'atu 12345678', lines: [{ account: '1200', side: 'debit', amount: 500_000 }, { account: '8125', side: 'credit', amount: 500_000, taxKey: 'igLieferung' }] })
    const va = await service.vatPrepayments('u', 2025, A1)
    expect(va).toMatchObject({ period: 'monat', periodSource: 'vorjahressteuer', extension: true })
    expect(va.periods).toHaveLength(12)
    // 12.000 € × 12 / 12 / 11 → 1.091 € Sondervorauszahlung, deducted in December.
    expect(va.specialPrepaymentEur).toBe(1_091)
    const march = va.periods[2]!
    expect(march).toMatchObject({ label: '03/2025', due: '2025-05-10' })
    expect(march.kennzahlen).toMatchObject({ '81': 1_000, '66': 19, '83': 171 })
    expect(va.periods[11]!.kennzahlen['39']).toBe(1_091)
    expect(va.totalEur).toBe(171)
    expect(va.ecSalesList).toEqual({ period: 'quartal', reports: [{ label: 'Q2/2025', due: '2025-07-25', rows: [{ vatId: 'ATU12345678', goodsEur: 5_000, servicesEur: 0 }] }] })
    // No sum entered: the annual return takes the Voranmeldungen.
    expect((await service.vatReturn('u', 2025, A1)).result.prepaymentsEur).toBe(171)
    await service.saveProfile('u', 2025, A1, { vatPrepaymentsCents: 20_000 })
    expect((await service.vatReturn('u', 2025, A1)).result.prepaymentsEur).toBe(200)
  })

  it('a sale of the Gewerbebetrieb: the gain after the § 16 allowance goes into Anlage G with the Fünftelregelung, without trade tax (ADR-0101 §22)', async () => {
    const { service } = setup()
    await service.saveProfile('u', 2025, A1, {
      confirmedKind: 'gewerbe',
      multiplierOverride: 400,
      disposalFacts: { kind: 'veraeusserung', date: '2025-09-30', priceEur: 200_000, costsEur: 5_000, capitalAccountEur: 95_000, allowance: true, method: 'fuenftel' },
    })
    await service.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 3_000_000 }])
    expect(await service.specialTariffs('u', 2025, A1)).toEqual({ disposal: { gainEur: 100_000, allowanceEur: 45_000, taxableGainEur: 55_000, method: 'fuenftel' }, retained: null })
    const input = (await service.estimateInput('u', 2025, 'A'))!
    expect(input.business).toMatchObject({ tradeEur: 85_000, tradeWithoutTradeTaxEur: 55_000, special: { extraordinary: { gainEur: 55_000, method: 'fuenftel' } } })
    // The trade tax is the current profit's only.
    expect((await service.tradeTax('u', 2025, A1))).toMatchObject({ status: 'berechnet', profitEur: 30_000 })
  })

  it('§ 34a needs a Bilanz; there it takes the profit not withdrawn (ADR-0101 §22)', async () => {
    const { service } = setup()
    await service.saveProfile('u', 2025, A1, { retainedFacts: { requestedEur: 10_000 } })
    expect((await service.specialTariffs('u', 2025, A1)).retained).toBe('nur_bilanz')
    await service.saveProfile('u', 2026, A1, { mode: 'bilanz', retainedFacts: { requestedEur: 50_000 } })
    await service.post('u', 2026, A1, { ...sale, date: '2026-03-01', documentNumber: 'R-26', lines: [{ account: '1200', side: 'debit', amount: 11_900_000 }, { account: '8400', side: 'credit', amount: 11_900_000, taxKey: 'ust19' }] })
    const retained = (await service.specialTariffs('u', 2026, A1)).retained
    if (retained === null || retained === 'nur_bilanz') throw new Error('expected a result')
    expect(retained).toMatchObject({ favouredEur: 50_000, rate: 0.2825, taxEur: 14_125 })
    expect((await service.estimateInput('u', 2026, 'A'))!.business.special?.retained).toEqual({ favouredEur: 50_000, taxEur: 14_125, recaptureEur: 0 })
  })

  it('books payroll runs and derives the Lohnsteuer-Anmeldung and the Minijob charges (ADR-0101 §22)', async () => {
    const { service } = setup()
    await service.addPayrollRun('u', 2026, A1, { month: 1, kind: 'regulaer', employee: 'Anna', grossEur: 3_000, wageTaxEur: 450, soliEur: 0, churchTaxEur: 36, church: 'ev', employeeSocialEur: 620, employerSocialEur: 640 })
    const { entry } = await service.addPayrollRun('u', 2026, A1, { month: 1, kind: 'minijob', employee: 'Ben', grossEur: 600, statutoryHealthInsured: true })
    expect(entry?.date).toBe('2026-01-31')
    await expect(service.addPayrollRun('u', 2026, A1, { month: 2, kind: 'minijob', employee: 'Ben', grossEur: 700 })).rejects.toMatchObject({ code: 'PAYROLL_MINIJOB_OVER_LIMIT' })
    const p = await service.payroll('u', 2026, A1)
    // First year: January's 450 € × 12 = 5.400 € → monthly.
    expect(p.wageTaxPeriod).toBe('monat')
    expect(p.wageTaxReturns).toEqual([{ label: '01/2026', due: '2026-02-10', kennzahlen: { '86': 2, '42': 450, '61': 36, '83': 486 } }])
    expect(p.minijobCharges).toEqual([{ month: 1, totalEur: 208.62 }])
    expect(p.runs.map((r) => [r.employee, r.netEur])).toEqual([['Anna', 1_894], ['Ben', 578.4]])
    // The book: wages, Minijob, employer charges as Personalaufwand.
    const input = (await service.estimateInput('u', 2026, 'A'))!
    expect(input.business.selfEmployedEur).toBe(-(3_000 + 640 + 600 + 187.02))
  })

  it('a regular payment paid on 5 January for December counts in the year before (§ 11 ten-day rule, ADR-0101 §22)', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 1_000_000 }])
    await service.quickEntry('u', 2025, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 1_000_000 }])
    const before2024 = (await service.estimateInput('u', YEAR, 'A'))!.business.selfEmployedEur ?? 0
    await service.post('u', 2025, A1, { date: '2025-01-05', documentNumber: 'M-12', text: 'Büromiete Dezember', regularPayment: { dueDate: '2025-01-01', periodYear: 2024 }, lines: [{ account: '4210', side: 'debit', amount: 80_000 }, { account: '1200', side: 'credit', amount: 80_000 }] })
    expect((await service.estimateInput('u', YEAR, 'A'))!.business.selfEmployedEur).toBe(before2024 - 800)
    expect((await service.estimateInput('u', 2025, 'A'))!.business.selfEmployedEur).toBe(10_000)
  })

  it('a further business sees the person-wide Kleinunternehmer flag and losses, and must exist before it books (review)', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { smallBusiness: true, lossFacts: { carriedForwardEur: 5_000 } })
    await service.addBusiness('u', YEAR, 'A', 'Shop')
    const A2 = { person: 'A', business: 2 } as const
    expect((await service.bookingTarget('u', YEAR, A2)).smallBusiness).toBe(true)
    // A Kleinunternehmer cannot charge 19 % in the second business either.
    await expect(service.post('u', YEAR, A2, sale)).rejects.toBeTruthy()
    await expect(service.post('u', YEAR, { person: 'A', business: 7 }, supplies)).rejects.toMatchObject({ code: 'BUSINESS_UNKNOWN' })
  })

  it('takes 70 % of a Bewirtung booked as the 70/30 split once, not twice (review)', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 1_000_000 }])
    const before = (await service.estimateInput('u', YEAR, 'A'))!.business.selfEmployedEur ?? 0
    await service.post('u', YEAR, A1, { date: '2024-05-02', documentNumber: 'B-1', text: 'Bewirtung', lines: [{ account: '4650', side: 'debit', amount: 7_000 }, { account: '4654', side: 'debit', amount: 3_000 }, { account: '1200', side: 'credit', amount: 10_000 }] })
    expect((await service.estimateInput('u', YEAR, 'A'))!.business.selfEmployedEur).toBe(before - 70)
  })

  it('reads an EU service booked with the old keys as Kz 21 and § 13b Abs. 1, and lists it in the ZM (review)', async () => {
    const { service } = setup()
    await service.saveProfile('u', 2025, A1, { vatPeriodFacts: { period: 'quartal' } })
    await service.post('u', 2025, A1, { date: '2025-02-03', documentNumber: 'EU-1', text: 'Beratung Wien', counterpartyVatId: 'ATU12345678', lines: [{ account: '1200', side: 'debit', amount: 100_000 }, { account: '8336', side: 'credit', amount: 100_000, taxKey: 'ust0' }] })
    const va = await service.vatPrepayments('u', 2025, A1)
    const q1 = va.periods.find((p) => p.kennzahlen['21'] !== undefined)
    expect(q1?.kennzahlen['21']).toBe(1_000)
    expect(va.ecSalesList.reports[0]?.rows).toEqual([{ vatId: 'ATU12345678', goodsEur: 0, servicesEur: 1_000 }])
  })

  it('in the quarter the goods pass 50.000 €: one ZM up to that month, monthly after it (§ 18a Abs. 1 Satz 3 UStG)', async () => {
    const { service } = setup()
    const ig = (date: string, cents: number, n: string) => ({ date, documentNumber: n, text: 'Lieferung Wien', counterpartyVatId: 'ATU12345678', lines: [{ account: '1200', side: 'debit' as const, amount: cents }, { account: '8125', side: 'credit' as const, amount: cents, taxKey: 'igLieferung' as const }] })
    await service.post('u', 2025, A1, ig('2025-04-03', 3_000_000, 'R-1'))
    await service.post('u', 2025, A1, ig('2025-05-06', 3_000_000, 'R-2'))
    await service.post('u', 2025, A1, ig('2025-06-09', 1_000_000, 'R-3'))
    const va = await service.vatPrepayments('u', 2025, A1)
    expect(va.ecSalesList.period).toBe('monat')
    expect(va.ecSalesList.reports.map((r) => [r.label, r.due, r.rows[0]?.goodsEur])).toEqual([
      ['04–05/2025', '2025-06-25', 60_000],
      ['06/2025', '2025-07-25', 10_000],
    ])
  })

  it('books the pauschale Lohnsteuer, puts another community on its Land line and says when a Land has none (Vordruck 2026)', async () => {
    const { service } = setup()
    await service.saveProfile('u', 2026, A1, { municipalityAgs: '08111000' })
    await service.addPayrollRun('u', 2026, A1, { month: 1, kind: 'regulaer', employee: 'Anna', grossEur: 3_000, wageTaxEur: 300, churchTaxEur: 24, church: 'iw', flatWageTaxEur: 50, employeeSocialEur: 600, employerSocialEur: 620 })
    await service.addPayrollRun('u', 2026, A1, { month: 1, kind: 'regulaer', employee: 'Cem', grossEur: 2_000, wageTaxEur: 100, churchTaxEur: 8, church: 'jh' })
    const { entry } = await service.addPayrollRun('u', 2026, A1, { month: 1, kind: 'minijob', employee: 'Ben', grossEur: 600, statutoryHealthInsured: true, u1Applies: false })
    expect(entry).not.toBeNull()
    const p = await service.payroll('u', 2026, A1)
    // Baden-Württemberg: iw on line 73; jh has no line there and stays in Kz 83 only.
    expect(p.wageTaxReturns[0]!.kennzahlen).toEqual({ '86': 3, '42': 400, '41': 50, '48': 450, '73': 24, '83': 482 })
    expect(p.unassignedChurchCodes).toEqual(['jh'])
    // The Minijob without U1: 13 % + 15 % + 2 % + 0,22 % + 0,15 % of 600 € plus the RV share of 21,60 €.
    expect(p.minijobCharges).toEqual([{ month: 1, totalEur: 203.82 }])
  })

  it('lists the charges of a privately insured, RV-exempt Minijob without U1 (09b in CI, 21.11.2026)', async () => {
    const { service } = setup()
    await service.addPayrollRun('u', 2025, A1, { month: 1, kind: 'minijob', employee: 'Ben', grossEur: 520, statutoryHealthInsured: true, rvExempt: true, u1Applies: false })
    expect((await service.payroll('u', 2025, A1)).minijobCharges).toHaveLength(1)
  })

  it('adds a computer by its category, without a useful life of its own (09b in CI, 21.11.2026)', async () => {
    const { service, repository } = setup()
    await service.createAsset('u', 2025, A1, { label: 'Laptop', account: '0410', acquisitionDate: '2025-02-15', acquisitionCostCents: 150_000, method: 'linear', category: 'computer' })
    const [laptop] = await repository.listAssets('u', A1, 2025)
    expect([laptop?.label, laptop?.usefulLifeYears]).toEqual(['Laptop', 1])
  })

  it('adds an electric vehicle with the 75 % AfA, and stores nothing it cannot depreciate (§ 7 Abs. 2a EStG)', async () => {
    const { service, repository } = setup()
    const base = { label: 'E-Transporter', account: '0350', acquisitionCostCents: 4_000_000, method: 'elektrofahrzeug' }
    await service.createAsset('u', 2025, A1, { ...base, acquisitionDate: '2025-08-01' })
    await expect(service.createAsset('u', 2025, A1, { ...base, label: 'zu früh', acquisitionDate: '2025-06-30' })).rejects.toBeDefined()
    const stored = await repository.listAssets('u', A1, 2025)
    expect(stored.map((a) => a.label)).toEqual(['E-Transporter'])
  })

  it('books § 13b at 7 % on the rate-less § 13b accounts (DATEV 1785/1578) and taxes it at 7 % in the Voranmeldung', async () => {
    const { service } = setup()
    await service.saveProfile('u', 2025, A1, { vatPeriodFacts: { period: 'monat' } })
    const entry = await service.post('u', 2025, A1, { date: '2025-02-03', documentNumber: 'B-7', text: 'Bauleistung 7 %', lines: [{ account: '3120', side: 'debit', amount: 100_000, taxKey: 'rc13b7' }, { account: '1200', side: 'credit', amount: 100_000 }] })
    expect(entry.lines.map((l) => [l.account, l.side, l.amount])).toEqual(expect.arrayContaining([['1785', 'credit', 7_000], ['1578', 'debit', 7_000]]))
    const feb = (await service.vatPrepayments('u', 2025, A1)).periods.find((p) => p.from <= '2025-02-03' && p.to >= '2025-02-03')!
    expect(feb.kennzahlen).toMatchObject({ '84': 1_000, '85': 70, '67': 70 })
  })

  it('books the pauschale Lohnsteuer on „Pauschale Steuer für Arbeitnehmer“ (DATEV 4198) and caps the BAV-Förderbetrag at 288 € (§ 100 EStG)', async () => {
    const { service } = setup()
    const { entry } = await service.addPayrollRun('u', 2026, A1, { month: 1, kind: 'regulaer', employee: 'Anna', grossEur: 3_000, wageTaxEur: 300, flatWageTaxEur: 50, bavSupportEur: 200 })
    expect(entry!.lines.find((l) => l.account === '4198')).toMatchObject({ side: 'debit', amount: 5_000 })
    await expect(service.addPayrollRun('u', 2026, A1, { month: 2, kind: 'regulaer', employee: 'Anna', grossEur: 3_000, wageTaxEur: 300, bavSupportEur: 100 })).rejects.toMatchObject({ code: 'PAYROLL_BAV_SUPPORT' })
    const p = await service.payroll('u', 2026, A1)
    expect(p.wageTaxReturns[0]!.kennzahlen).toMatchObject({ '90': 1, '45': 200, '48': 150 })
  })

  it('takes a building with its facts, refuses the Sonder-AfA above the profit limit, and lets § 20 Nr. 2 allow the Istversteuerung', async () => {
    const { service } = setup()
    const hall = await service.createAsset('u', 2025, A1, { label: 'Halle', account: '0090', acquisitionDate: '2025-01-10', acquisitionCostCents: 30_000_000, method: 'building', building: { use: 'betrieb', completed: '1984-06-01', applicationFiled: '1983-02-01' } })
    // Bauantrag before 1.4.1985: not Nr. 1 but Nr. 2 b, 2 % of 300.000 € = 6.000 € a year.
    const register = (await service.assets('u', 2025, A1)).register.rows.find((r) => r.id === hall.id)!
    expect(register.depreciation).toBe(600_000)
    await expect(
      service.createAsset('u', 2025, A1, { label: 'Maschine', account: '0440', acquisitionDate: '2025-03-01', acquisitionCostCents: 1_000_000, method: 'linear', usefulLifeYears: 5, specialDepreciation: { byYear: { '2025': 200_000 }, priorYearProfitEur: 250_000 } }),
    ).rejects.toBeDefined()
    await service.saveProfile('u', 2025, A1, { vatPeriodFacts: { exemptFromBookkeeping: true } })
    await service.post('u', 2024, A1, { ...sale, lines: [{ account: '1200', side: 'debit', amount: 119_000_000 }, { account: '8400', side: 'credit', amount: 119_000_000, taxKey: 'ust19' }] })
    expect((await service.vatReturn('u', 2025, A1)).cashAccountingAllowed).toBe(true)
  })

  it('corrects the input VAT of an asset whose use changed (§ 15a UStG) in the annual VAT', async () => {
    const { service } = setup()
    await service.post('u', 2025, A1, { ...sale, date: '2025-03-01', documentNumber: 'R-25' })
    const car = await service.createAsset('u', 2025, A1, { label: 'Lieferwagen', account: '0350', acquisitionDate: '2024-01-05', acquisitionCostCents: 3_000_000, method: 'linear', usefulLifeYears: 6 })
    // 5.700 € input VAT, deducted in full; 2025 used half for tax-free turnover: 5.700 / 5 × 50 % = 570 € back.
    await service.setAssetFacts('u', 2025, A1, car.id, { vatCorrection: { inputVatCents: 570_000, originalShare: 1, shareByYear: { '2025': 0.5 } } })
    const vat = await service.vatReturn('u', 2025, A1)
    expect(vat.result.inputVatCorrectionEur).toBe(-570)
    expect(vat.inputVatCorrections).toEqual([{ assetId: car.id, label: 'Lieferwagen', correctionEur: -570, inPrepayment: false }])
    // 190 € output VAT on the sale plus the 570 € paid back.
    expect(vat.result.vatOfYearEur).toBe(760)
    await expect(service.setAssetFacts('u', 2025, A1, 'nope', { vatCorrection: null })).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
  })

  it('sends the E-Bilanz once, under the book’s lock, and keeps the ticket in the log (review)', async () => {
    const env = { ELSTER_TRANSMISSION_ENABLED: 'true', ELSTER_ERIC_CLI: fileURLToPath(new URL('./fixtures/fake-eric-cli.mjs', import.meta.url)), ELSTER_CERT_PATH: '/run/x.pfx', ELSTER_CERT_PIN: '123456', ELSTER_HERSTELLER_ID: '74931' }
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      const { service, repository } = setup()
      await service.saveProfile('u', 2025, A1, { mode: 'bilanz' })
      await service.saveProcedureDoc('u', 2025, A1, { steuernummer: '5133081508159' })
      await service.post('u', 2025, A1, { ...sale, date: '2025-03-01', documentNumber: 'R-25' })
      await expect(service.transmitEBilanz('u', 2025, A1, 'senden')).resolves.toMatchObject({ status: 'ok', ticket: 'TK-1' })
      expect(repository.books.get('u|2025|A|1')!.log.at(-1)).toMatchObject({ kind: 'export', payload: { kind: 'e-bilanz', ticket: 'TK-1' } })
      await expect(service.transmitEBilanz('u', 2025, A1, 'senden')).rejects.toMatchObject({ code: 'E_BILANZ_ALREADY_SENT' })
    } finally {
      for (const k of Object.keys(env)) if (saved[k] === undefined) delete process.env[k]
    }
  })

  it('takes the Sondervorauszahlung from the sum of last year’s Vorauszahlungen, not its annual VAT (§ 47 UStDV, verified)', async () => {
    const { service } = setup()
    // 2024 filed quarterly: 1.900 € VAT in Q1, so 1.900 € of Vorauszahlungen.
    await service.saveProfile('u', YEAR, A1, { vatPeriodFacts: { period: 'quartal' } })
    await service.post('u', YEAR, A1, { date: '2024-02-01', documentNumber: 'R-1', text: 'Honorar', lines: [{ account: '1200', side: 'debit', amount: 1_190_000 }, { account: '8400', side: 'credit', amount: 1_190_000, taxKey: 'ust19' }] })
    await service.saveProfile('u', 2025, A1, { vatPeriodFacts: { period: 'monat', extension: true } })
    const fromVoranmeldungen = (await service.vatPrepayments('u', 2025, A1)).specialPrepaymentEur
    expect(fromVoranmeldungen).toBe(Math.round(1_900 / 11))
    // A sum entered for 2024 wins.
    await service.saveProfile('u', YEAR, A1, { vatPrepaymentsCents: 1_100_000 })
    expect((await service.vatPrepayments('u', 2025, A1)).specialPrepaymentEur).toBe(1_000)
  })

  it('the GoBD export is a zip with index.xml and the journal, and is itself logged in the chain', async () => {
    const { service, repository } = setup()
    await service.post('u', YEAR, A1, sale)
    const zip = await service.gobdExport('u', YEAR, A1)
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(zip.includes(Buffer.from('index.xml'))).toBe(true)
    const book = repository.books.get(`u|${YEAR}|A|1`)!
    expect(book.log.at(-1)?.kind).toBe('export')
    expect((await service.getBook('u', YEAR, A1)).integrity.ok).toBe(true)
  })

  it('a booking draft is posted only on accept and undone by a Storno (Zero-Write)', async () => {
    const { service, repository } = setup()
    const access = bookingFieldAccess(service)
    const value = serializeBookingDraft(supplies)
    expect(await access.read('u', YEAR, 'entwurf-1')).toEqual({ entry: null })
    expect(repository.books.size).toBe(0)
    await access.write('u', YEAR, 'entwurf-1', 'entry', value)
    expect(await access.read('u', YEAR, 'entwurf-1')).toEqual({ entry: value })
    await expect(access.write('u', YEAR, 'entwurf-1', 'entry', value)).rejects.toMatchObject({ code: 'BOOKING_DRAFT_POSTED' })
    await access.write('u', YEAR, 'entwurf-1', 'entry', null)
    expect(await access.read('u', YEAR, 'entwurf-1')).toEqual({ entry: null })
    const book = await service.getBook('u', YEAR, A1)
    expect(book.entries.map((e) => [e.number, e.reversalOf, e.source])).toEqual([
      [1, null, 'eule:entwurf-1'],
      [2, 1, 'storno'],
    ])
  })

  it('the estimate input: the profit is Anlage S for a Freiberufler and Anlage G with § 35 for a Gewerbe', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 6_000_000 }])
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'freiberuf', lossFacts: { carriedForwardEur: 5000 } })
    expect(await service.estimateInput('u', YEAR, 'A')).toEqual({ business: { selfEmployedEur: 60_000, tradeEur: 0, tradeTax: [] }, losses: { carriedForwardEur: 5000 } })
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'gewerbe', multiplierOverride: 400 })
    const trade = await service.estimateInput('u', YEAR, 'A')
    expect(trade?.business).toMatchObject({ selfEmployedEur: 0, tradeEur: 60_000, tradeTax: [{ baseAmountEur: 1242, tradeTaxEur: 4968 }] })
  })
})
