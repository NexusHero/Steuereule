// ADR-0101 — the self-employment path against in-memory repositories: the switch, the profile's
// suggestion, the append-only book with its hash chain (read and export refuse a tampered book), Storno,
// Festschreibung, quick path, bank import, VAT, trade tax with the Hebesatz table, the ELSTER fill-in help
// behind the tier, and booking drafts posted only on accept.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serializeBookingDraft, type BookingDraft } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { BusinessService } from '../src/business/business.service.js'
import { bookingFieldAccess } from '../src/business/booking-field-access.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import type { UnlockService } from '../src/unlock/unlock.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

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
  const unlock = { status: async () => (unlocked ? 'freigeschaltet' : 'offen') } as unknown as UnlockService
  let tick = 0
  const clock = () => `2026-11-19T10:00:${String(tick++ % 60).padStart(2, '0')}.000Z`
  const service = new BusinessService(repository, interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory(), unlock, clock)
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
    delete process.env.SELBSTSTAENDIGE_ENABLED
    const { service, repository } = setup()
    await expect(service.getProfile('u', YEAR, 'A')).rejects.toMatchObject({ code: 'SELF_EMPLOYMENT_DISABLED' })
    await expect(service.post('u', YEAR, 'A', sale)).rejects.toMatchObject({ code: 'SELF_EMPLOYMENT_DISABLED' })
    expect(repository.books.size).toBe(0)
  })

  it('an employee without a business is refused even with the switch on', async () => {
    const { service } = setup('Angestellt')
    await expect(service.getProfile('u', YEAR, 'A')).rejects.toMatchObject({ code: 'SELF_EMPLOYMENT_NOT_DECLARED' })
  })

  it('the profession answers yield the core’s suggestion with its reasons, the user confirms', async () => {
    const { service } = setup()
    const saved = await service.saveProfile('u', YEAR, 'A', {
      professionAnswers: { catalogProfession: 'Ingenieur', ownExpertWork: true, employsQualifiedStaff: false, leadsPersonally: true, tradesGoods: false } as never,
      confirmedKind: 'freiberuf',
    })
    expect(saved.suggestion?.suggestion).toBe('freiberuf')
    expect(saved.suggestion?.reasons.length).toBeGreaterThan(0)
    expect(saved.confirmedKind).toBe('freiberuf')
  })

  it('PUT merges: a field left out keeps its value, null clears it, a nested object is replaced as a whole', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, 'A', { name: 'Büro Muster', startDate: '2021-04-01', tradeTaxInputs: { financing: { debtChargesEur: 1000 }, einheitswertEur: 5000 } })
    const merged = await service.saveProfile('u', YEAR, 'A', { smallBusiness: true, tradeTaxInputs: { einheitswertEur: 7000 } })
    expect(merged).toMatchObject({ name: 'Büro Muster', startDate: '2021-04-01', smallBusiness: true, tradeTaxInputs: { einheitswertEur: 7000 } })
    expect(merged.tradeTaxInputs.financing).toBeUndefined()
    expect((await service.saveProfile('u', YEAR, 'A', { name: null })).name).toBeNull()
  })

  it('posts entries with VAT lines, numbers them gaplessly and keeps an intact hash chain', async () => {
    const { service } = setup()
    const first = await service.post('u', YEAR, 'A', sale)
    const second = await service.post('u', YEAR, 'A', supplies)
    expect([first.number, second.number]).toEqual([1, 2])
    expect(first.lines.map((l) => [l.account, l.side, l.amount])).toEqual([
      ['1200', 'debit', 119_000],
      ['8400', 'credit', 100_000],
      ['1776', 'credit', 19_000],
    ])
    const book = await service.getBook('u', YEAR, 'A')
    expect(book.integrity).toMatchObject({ ok: true, entries: 2 })
  })

  it('a tampered entry shows as a broken book on read, and every export and booking refuses', async () => {
    const { service, repository } = setup()
    await service.post('u', YEAR, 'A', sale)
    repository.tamper('u', YEAR, 'A', 1, (entry) => ({ ...entry, text: 'geändert' }))
    const book = await service.getBook('u', YEAR, 'A')
    expect(book.integrity).toMatchObject({ ok: false })
    expect(book.integrity.ok ? '' : book.integrity.reason).toMatch(/Buchung 1 weicht vom Protokoll ab/)
    await expect(service.gobdExport('u', YEAR, 'A')).rejects.toMatchObject({ code: 'BOOK_INTEGRITY_BROKEN' })
    await expect(service.post('u', YEAR, 'A', supplies)).rejects.toMatchObject({ code: 'BOOK_INTEGRITY_BROKEN' })
  })

  it('Storno mirrors the entry; the original stays and cannot be reversed twice', async () => {
    const { service } = setup()
    await service.post('u', YEAR, 'A', supplies)
    const storno = await service.reverse('u', YEAR, 'A', 1, { date: '2024-03-06', documentNumber: 'ST-1' })
    expect(storno.reversalOf).toBe(1)
    await expect(service.reverse('u', YEAR, 'A', 1, { date: '2024-03-07', documentNumber: 'ST-2' })).rejects.toMatchObject({ code: 'LEDGER_ALREADY_REVERSED' })
    const book = await service.getBook('u', YEAR, 'A')
    expect(book.entries[0]?.reversedBy).toBe(2)
  })

  it('Festschreibung blocks bookings in the period and never moves back', async () => {
    const { service } = setup()
    await service.lock('u', YEAR, 'A', '2024-03-31')
    await expect(service.post('u', YEAR, 'A', sale)).rejects.toMatchObject({ code: 'BOOKING_PERIOD_LOCKED' })
    await expect(service.lock('u', YEAR, 'A', '2024-01-31')).rejects.toMatchObject({ code: 'LEDGER_PERIOD_LOCKED' })
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
    await expect(service.post('u', YEAR, 'A', notebook)).rejects.toThrow(/asset insert failed/)
    expect(repository.books.get(`u|${YEAR}|A`)?.entries ?? []).toHaveLength(0)
    expect(repository.assets).toHaveLength(0)
    repository.failAssetInsert = false
    await service.post('u', YEAR, 'A', notebook)
    expect(repository.assets).toMatchObject([{ account: '0420', acquisitionCost: 120_000, usefulLifeYears: 1 }])
  })

  it('§ 11: a payment on 5 January is booked in the payment year’s book and counts in that year’s EÜR', async () => {
    const { service } = setup()
    await service.post('u', 2025, 'A', {
      date: '2025-01-05',
      documentNumber: 'M-12',
      text: 'Büromiete Dezember 2024',
      lines: [
        { account: '4210', side: 'debit', amount: 80_000 },
        { account: '1200', side: 'credit', amount: 80_000 },
      ],
    })
    const closing = await service.closing('u', 2025, 'A')
    expect(closing.euer?.totals.byKey.ausgaben_raumkosten).toBe(80_000)
    expect(closing.euer?.totals.ausgaben).toBe(80_000)
  })

  it('a booking dated in another year is refused', async () => {
    const { service } = setup()
    await expect(service.post('u', YEAR, 'A', { ...sale, date: '2025-01-02' })).rejects.toMatchObject({ code: 'BOOKING_WRONG_YEAR' })
  })

  it('the quick path books EÜR totals; the closing derives the profit from them', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, 'A', [
      { key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 5_000_000 },
      { key: 'ausgaben_telekommunikation', amountCents: 120_000 },
    ])
    const closing = await service.closing('u', YEAR, 'A')
    expect(closing.mode).toBe('euer')
    expect(closing.euer?.profit.profitEur).toBe(48_800)
  })

  it('bank import: preset CSV in, duplicates out on a re-import, a suggestion accepted as a booking with a rule', async () => {
    const { service } = setup()
    const first = await service.importBank('u', 2025, 'A', { format: 'csv', content: SPARKASSE, preset: 'sparkasse' })
    expect(first.added).toBeGreaterThan(0)
    const again = await service.importBank('u', 2025, 'A', { format: 'csv', content: SPARKASSE, preset: 'sparkasse' })
    expect(again.added).toBe(0)
    const list = await service.listBank('u', 2025, 'A')
    const income = list.find((t) => t.transaction.amount === 119_000)!
    const entry = await service.acceptBank('u', 2025, 'A', income.id, { account: '8400', taxKey: 'ust19', remember: true })
    expect(entry.lines[0]).toMatchObject({ account: '1200', side: 'debit', amount: 119_000 })
    const after = await service.listBank('u', 2025, 'A')
    expect(after.find((t) => t.id === income.id)?.status).toBe('gebucht')
  })

  it('the VAT return is read off the journal: output and input VAT, prepayments', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, 'A', { vatPrepaymentsCents: 1_000_000 })
    await service.post('u', YEAR, 'A', sale)
    await service.post('u', YEAR, 'A', supplies)
    const { result } = await service.vatReturn('u', YEAR, 'A')
    expect(result.outputVat.standard).toBe(19_000 / 100)
    expect(result.inputVatDeductibleEur).toBe(19)
    expect(result.prepaymentsEur).toBe(10_000)
  })

  it('trade tax: Freiberuf owes none; a Gewerbe uses the table by AGS, the user’s correction wins', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, 'A', [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 10_000_000 }])
    expect(await service.tradeTax('u', YEAR, 'A')).toMatchObject({ status: 'entfaellt' })
    await service.saveProfile('u', YEAR, 'A', { confirmedKind: 'gewerbe' })
    expect(await service.tradeTax('u', YEAR, 'A')).toMatchObject({ status: 'offen', missing: ['hebesatz'] })
    await service.saveProfile('u', YEAR, 'A', { municipalityAgs: '09162000' })
    const table = await service.tradeTax('u', YEAR, 'A')
    expect(table).toMatchObject({ status: 'berechnet', multiplier: { percent: 490, source: 'tabelle' } })
    // 100.000 − 24.500 = 75.500 × 3,5 % = 2.642 € Messbetrag × 490 %
    expect(table.status === 'berechnet' ? table.result.tradeTaxEur : null).toBe(12_945.8)
    await service.saveProfile('u', YEAR, 'A', { multiplierOverride: 400 })
    expect(await service.tradeTax('u', YEAR, 'A')).toMatchObject({ status: 'berechnet', multiplier: { percent: 400, source: 'korrektur' } })
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
    await service.quickEntry('u', YEAR, 'A', [{ key: 'ausgaben_telekommunikation', amountCents: 120_000 }])
    const euer = await service.elsterHelp('u', YEAR, 'A', 'anlage-euer')
    expect(euer.status).toBe('published')
    const telecom = euer.lines.find((l) => l.id === 'euer.ausgaben.kz280')
    expect(telecom).toMatchObject({ value: 1200 })
    expect(telecom?.zeile).toBeTruthy()
    expect(euer.lineNumbersAvailable).toBe(true)
    const s = await service.elsterHelp('u', YEAR, 'A', 'anlage-s')
    expect(s.status).toBe('not_available')
    expect(s.lineNumbersAvailable).toBe(false)
    // The app says it once from `lineNumbersAvailable`; the API adds no second sentence.
    expect(s.note).toBeNull()
    expect(s.lineNumbersAvailable).toBe(false)
    // By meaning, with a stable id and the German field name, even without official line numbers.
    expect(s.lines).toEqual([{ id: 'anlage-s.gewinn', zeile: null, kennzahlen: [], label: 'Gewinn aus freiberuflicher Tätigkeit', column: null, value: -1200 }])

    const locked = setup('Selbstständig', false)
    await expect(locked.service.elsterHelp('u', YEAR, 'A', 'anlage-euer')).rejects.toMatchObject({ status: 402 })
    await expect(locked.service.gobdExport('u', YEAR, 'A')).rejects.toMatchObject({ status: 402 })
  })

  it('Anlage G and GewSt 1 A by meaning: Gewinn, § 35 figures and the GewSt fields of the catalogue, without Zeile', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, 'A', { confirmedKind: 'gewerbe', multiplierOverride: 400, tradeTaxInputs: { financing: { debtChargesEur: 3000 }, einheitswertEur: 20_000 } })
    await service.quickEntry('u', YEAR, 'A', [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 6_000_000 }])
    const g = await service.elsterHelp('u', YEAR, 'A', 'anlage-g')
    expect(g).toMatchObject({ status: 'not_available', lineNumbersAvailable: false })
    expect(g.lines.map((l) => [l.id, l.label, l.zeile])).toEqual([
      ['anlage-g.gewinn', 'Gewinn aus Gewerbebetrieb', null],
      ['anlage-g.messbetrag', 'Gewerbesteuer-Messbetrag (§ 35 EStG)', null],
      ['anlage-g.gewerbesteuer', 'Tatsächlich zu zahlende Gewerbesteuer (§ 35 EStG)', null],
    ])
    expect(g.lines[0]?.value).toBe(60_000)
    const gewst = await service.elsterHelp('u', YEAR, 'A', 'gewst-1-a')
    expect(gewst).toMatchObject({ status: 'published', lineNumbersAvailable: false })
    const byId = Object.fromEntries(gewst.lines.map((l) => [l.id, l.value]))
    expect(byId['gewst.gewinn']).toBe(60_000)
    expect(byId['gewst.hinzurechnung-entgelte-schulden']).toBe(3000)
    expect(byId['gewst.kuerzung-grundbesitz-einheitswert']).toBe(20_000)
    expect(gewst.lines.every((l) => l.zeile === null)).toBe(true)
  })

  it('GewSt 1 A names the Betriebsstätte by Gemeinde and AGS; the trade tax shows the profit and the § 10a loss used', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, 'A', { confirmedKind: 'gewerbe', municipalityAgs: '14713000', tradeTaxInputs: { lossCarriedForwardEur: 10_000 } })
    await service.quickEntry('u', YEAR, 'A', [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 8_200_000 }])
    const gewst = await service.elsterHelp('u', YEAR, 'A', 'gewst-1-a')
    expect(gewst.lines.find((l) => l.id === 'gewst.betriebsstaette')?.value).toBe('Leipzig (AGS 14713000)')
    const trade = await service.tradeTax('u', YEAR, 'A')
    expect(trade).toMatchObject({ status: 'berechnet', profitEur: 82_000, result: { lossUsedEur: 10_000, tradeIncomeBeforeLossEur: 82_000, roundedTradeIncomeEur: 72_000 } })
  })

  it('Anlage Sonstiges: the Feststellung line is a yes/no box („Ja“), the amount has no line of its own', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, 'A', { lossFacts: { carriedForwardEur: 10_000 } })
    const help = await service.elsterHelp('u', YEAR, 'A', 'anlage-sonstiges')
    expect(help.lines.find((l) => l.id === 'anlage-sonstiges.verlustvortrag-festgestellt')).toMatchObject({ zeile: '17', value: 'Ja' })
    expect(help.lines.some((l) => l.value === 10_000)).toBe(false)
  })

  it('the GoBD export is a zip with index.xml and the journal, and is itself logged in the chain', async () => {
    const { service, repository } = setup()
    await service.post('u', YEAR, 'A', sale)
    const zip = await service.gobdExport('u', YEAR, 'A')
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304')
    expect(zip.includes(Buffer.from('index.xml'))).toBe(true)
    const book = repository.books.get(`u|${YEAR}|A`)!
    expect(book.log.at(-1)?.kind).toBe('export')
    expect((await service.getBook('u', YEAR, 'A')).integrity.ok).toBe(true)
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
    const book = await service.getBook('u', YEAR, 'A')
    expect(book.entries.map((e) => [e.number, e.reversalOf, e.source])).toEqual([
      [1, null, 'eule:entwurf-1'],
      [2, 1, 'storno'],
    ])
  })

  it('the estimate input: the profit is Anlage S for a Freiberufler and Anlage G with § 35 for a Gewerbe', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, 'A', [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 6_000_000 }])
    await service.saveProfile('u', YEAR, 'A', { confirmedKind: 'freiberuf', lossFacts: { carriedForwardEur: 5000 } })
    expect(await service.estimateInput('u', YEAR, 'A')).toEqual({ business: { selfEmployedEur: 60_000, tradeEur: 0, tradeTax: [] }, losses: { carriedForwardEur: 5000 } })
    await service.saveProfile('u', YEAR, 'A', { confirmedKind: 'gewerbe', multiplierOverride: 400 })
    const trade = await service.estimateInput('u', YEAR, 'A')
    expect(trade?.business).toMatchObject({ selfEmployedEur: 0, tradeEur: 60_000, tradeTax: [{ baseAmountEur: 1242, tradeTaxEur: 4968 }] })
  })
})
