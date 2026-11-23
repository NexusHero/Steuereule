// ADR-0101: the public methods of the self-employment path that business.service.test.ts does not call
// directly, pinned as they behave today so that splitting the service cannot change them unnoticed.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BookingDraft } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { composeBusinessService } from '../src/business/business.composition.js'
import { HebesatzDirectory } from '../src/business/hebesatz.js'
import type { UnlockService } from '../src/unlock/unlock.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBusinessRepository } from './fakes/fake-business.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

const A1 = { person: 'A', business: 1 } as const
const YEAR = 2025
const SPARKASSE = readFileSync(new URL('../../../packages/core/src/domains/ledger/__fixtures__/sparkasse-csv-camt-v2.csv', import.meta.url), 'utf8')

const sale: BookingDraft = {
  date: '2025-03-01',
  documentNumber: 'RE-2025-001',
  text: 'Honorar Projekt A',
  lines: [
    { account: '1200', side: 'debit', amount: 119_000 },
    { account: '8400', side: 'credit', amount: 119_000, taxKey: 'ust19' },
  ],
}

function setup(job = 'Selbstständig', unlocked = true) {
  const repository = new FakeBusinessRepository()
  const interview = new FakeInterviewAnswerRepository()
  for (const year of [2024, 2025, 2026]) interview.seed('u', year, { job })
  const unlock = { status: async () => (unlocked ? 'freigeschaltet' : 'offen') } as unknown as UnlockService
  let tick = 0
  const clock = () => `2026-11-19T10:00:${String(tick++ % 60).padStart(2, '0')}.000Z`
  const service = composeBusinessService(repository, interview, new AuditService(new FakeAuditRepository()), new HebesatzDirectory(), unlock, clock)
  return { repository, interview, service }
}

describe('BusinessService, methods without a direct test (characterisation)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  beforeEach(() => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('pathOpen answers instead of throwing: open with a declared business, closed without one or with the switch off', async () => {
    expect(await setup().service.pathOpen('u', YEAR)).toBe(true)
    expect(await setup('Angestellt').service.pathOpen('u', YEAR)).toBe(false)
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    expect(await setup().service.pathOpen('u', YEAR)).toBe(false)
  })

  it('ignoreBank marks a bank line as ignored, without a booking or a suggestion; an unknown line is a 404', async () => {
    const { service, repository } = setup()
    await service.importBank('u', YEAR, A1, { format: 'csv', content: SPARKASSE, preset: 'sparkasse' })
    const [first] = await service.listBank('u', YEAR, A1)
    await service.ignoreBank('u', YEAR, A1, first!.id)
    const after = (await service.listBank('u', YEAR, A1)).find((t) => t.id === first!.id)!
    expect(after).toMatchObject({ status: 'ignoriert', entryNumber: null, suggestion: null })
    expect((await service.getBook('u', YEAR, A1)).entries).toHaveLength(0)
    expect(repository.books.get(`u|${YEAR}|A|1`)!.bank.filter((t) => t.status === 'ignoriert')).toHaveLength(1)
    await expect(service.ignoreBank('u', YEAR, A1, 'nope')).rejects.toMatchObject({ code: 'BANK_TRANSACTION_NOT_FOUND' })
  })

  it('disposeAsset stores the disposal on the asset; bookDepreciation books AfA and disposal once per asset and year', async () => {
    const { service } = setup()
    const machine = await service.createAsset('u', YEAR, A1, { label: 'Maschine', account: '0440', acquisitionDate: '2025-01-10', acquisitionCostCents: 1_200_000, method: 'linear', usefulLifeYears: 5 })
    const laptop = await service.createAsset('u', YEAR, A1, { label: 'Laptop', account: '0440', acquisitionDate: '2025-01-10', acquisitionCostCents: 600_000, method: 'linear', usefulLifeYears: 3 })
    const disposed = await service.disposeAsset('u', YEAR, A1, laptop.id, { date: '2025-06-30', proceedsCents: 400_000 })
    expect(disposed).toMatchObject({ id: laptop.id, disposal: JSON.stringify({ date: '2025-06-30', proceedsCents: 400_000 }) })
    await expect(service.disposeAsset('u', YEAR, A1, 'nope', { date: '2025-06-30' })).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })

    const posted = await service.bookDepreciation('u', YEAR, A1)
    expect(posted.map((e) => [e.number, e.documentNumber, e.lines.map((l) => [l.account, l.side, l.amount])])).toMatchInlineSnapshot(`
      [
        [
          1,
          "AfA-2025-a1",
          [
            [
              "4830",
              "debit",
              240000,
            ],
            [
              "0440",
              "credit",
              240000,
            ],
          ],
        ],
        [
          2,
          "AfA-2025-a2",
          [
            [
              "4830",
              "debit",
              100000,
            ],
            [
              "0440",
              "credit",
              100000,
            ],
          ],
        ],
        [
          3,
          "Abgang-a2",
          [
            [
              "2310",
              "debit",
              500000,
            ],
            [
              "0440",
              "credit",
              500000,
            ],
          ],
        ],
        [
          4,
          "Verkauf-a2",
          [
            [
              "1200",
              "debit",
              476000,
            ],
            [
              "8820",
              "credit",
              400000,
            ],
            [
              "1776",
              "credit",
              76000,
            ],
          ],
        ],
      ]
    `)
    const book = await service.getBook('u', YEAR, A1)
    expect(book.entries.map((e) => e.source)).toMatchInlineSnapshot(`
      [
        "afa:AfA-2025-a1",
        "afa:AfA-2025-a2",
        "abgang:Abgang-a2",
        "abgang:Verkauf-a2",
      ]
    `)
    expect(book.integrity.ok).toBe(true)
    // A second run finds every draft booked already.
    expect(await service.bookDepreciation('u', YEAR, A1)).toEqual([])
    expect((await service.assets('u', YEAR, A1)).register.rows.find((r) => r.id === machine.id)!.depreciation).toBe(240_000)
  })

  it('carryForward books the closing balances as the next year’s opening entry, once, and only for a Bilanz', async () => {
    const euer = setup()
    await euer.service.post('u', YEAR, A1, sale)
    await expect(euer.service.carryForward('u', YEAR, A1)).rejects.toMatchObject({ code: 'CARRY_FORWARD_BILANZ_ONLY' })

    const { service, repository } = setup()
    await service.saveProfile('u', YEAR, A1, { mode: 'bilanz' })
    await service.post('u', YEAR, A1, sale)
    const opening = await service.carryForward('u', YEAR, A1)
    expect([opening.number, opening.date, opening.lines.map((l) => [l.account, l.side, l.amount])]).toMatchInlineSnapshot(`
      [
        1,
        "2026-01-01",
        [
          [
            "0880",
            "credit",
            100000,
          ],
          [
            "9000",
            "debit",
            100000,
          ],
          [
            "1200",
            "debit",
            119000,
          ],
          [
            "9000",
            "credit",
            119000,
          ],
          [
            "1776",
            "credit",
            19000,
          ],
          [
            "9000",
            "debit",
            19000,
          ],
        ],
      ]
    `)
    const next = repository.books.get(`u|${YEAR + 1}|A|1`)!
    expect([next.chart, next.mode, next.entries.map((e) => e.source)]).toEqual(['SKR03', 'bilanz', ['eb']])
    await expect(service.carryForward('u', YEAR, A1)).rejects.toMatchObject({ code: 'OPENING_ENTRY_EXISTS' })
  })

  it('losses: the year’s loss with the § 10d facts of the profile, the carry-back into the room of the years before', async () => {
    const { service } = setup()
    await service.quickEntry('u', YEAR, A1, [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 1_000_000 }])
    const profit = await service.losses('u', YEAR, A1)
    expect({ facts: profit.facts, businessProfitEur: profit.businessProfitEur, year: profit.year, carryBack: profit.carryBack }).toMatchInlineSnapshot(`
      {
        "businessProfitEur": 10000,
        "carryBack": null,
        "facts": {},
        "year": {
          "carryBackDeductedEur": 0,
          "carryForwardDeductedEur": 0,
          "gdeAfterLossesEur": 10000,
          "newLossEur": 0,
          "remainingCarryForwardEur": 0,
        },
      }
    `)

    await service.saveProfile('u', 2026, A1, { lossFacts: { carriedForwardEur: 3_000, roomEur: [20_000, 0] } })
    await service.post('u', 2026, A1, { date: '2026-02-01', documentNumber: 'Q-1', text: 'Miete', lines: [{ account: '4210', side: 'debit', amount: 5_000_000 }, { account: '1200', side: 'credit', amount: 5_000_000 }] })
    const loss = await service.losses('u', 2026, A1)
    expect({ facts: loss.facts, businessProfitEur: loss.businessProfitEur, year: loss.year, carryBack: loss.carryBack }).toMatchInlineSnapshot(`
      {
        "businessProfitEur": -50000,
        "carryBack": {
          "intoSecondYearBeforeEur": 0,
          "intoYearBeforeEur": 20000,
          "remainingEur": 30000,
        },
        "facts": {
          "carriedForwardEur": 3000,
          "roomEur": [
            20000,
            0,
          ],
        },
        "year": {
          "carryBackDeductedEur": 0,
          "carryForwardDeductedEur": 0,
          "gdeAfterLossesEur": 0,
          "newLossEur": 50000,
          "remainingCarryForwardEur": 53000,
        },
      }
    `)
    expect(loss.rules).toEqual(expect.any(Object))
  })

  it('digest: null without a business; with one, the profit so far, the VAT balance, open bank lines, mode and kind', async () => {
    const { service } = setup()
    expect(await service.digest('u', YEAR)).toBeNull()
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'freiberuf' })
    await service.post('u', YEAR, A1, sale)
    await service.importBank('u', YEAR, A1, { format: 'csv', content: SPARKASSE, preset: 'sparkasse' })
    const open = (await service.listBank('u', YEAR, A1)).filter((t) => t.status === 'offen').length
    expect(open).toBeGreaterThan(0)
    expect(await service.digest('u', YEAR)).toEqual({ profitSoFarEur: 1_190, vatBalanceEur: 190, openBankItems: open, mode: 'euer', kind: 'freiberuf' })
    await service.saveProfile('u', YEAR, A1, { smallBusiness: true })
    expect((await service.digest('u', YEAR))!.vatBalanceEur).toBeNull()
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    expect(await service.digest('u', YEAR)).toBeNull()
  })

  it('eBilanz: a preview for a Bilanz, never transmitted; refused for the EÜR; the download needs the tier', async () => {
    const euer = setup()
    await expect(euer.service.eBilanz('u', YEAR, A1, false)).rejects.toMatchObject({ code: 'E_BILANZ_BILANZ_ONLY' })

    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { mode: 'bilanz', name: 'Atelier Nord' })
    await service.saveProcedureDoc('u', YEAR, A1, { steuernummer: '5133081508159' })
    await service.post('u', YEAR, A1, sale)
    const preview = await service.eBilanz('u', YEAR, A1, false)
    expect(preview).toMatchObject({ transmitted: false, transmissionReady: false })
    expect(preview.note).toContain('noch nicht eingerichtet')
    expect(preview.xbrl).toContain('Atelier Nord')
    expect(preview.xbrl).toContain('5133081508159')
    expect((await service.eBilanz('u', YEAR, A1, true)).xbrl).toBe(preview.xbrl)

    const locked = setup('Selbstständig', false)
    await locked.service.saveProfile('u', YEAR, A1, { mode: 'bilanz' })
    await locked.service.saveProcedureDoc('u', YEAR, A1, { steuernummer: '5133081508159' })
    await expect(locked.service.eBilanz('u', YEAR, A1, true)).rejects.toMatchObject({ status: 402 })
    await expect(locked.service.eBilanz('u', YEAR, A1, false)).resolves.toMatchObject({ transmitted: false })
  })

  it('procedureDoc: the app’s own facts fill the document, the user’s values win and come back as stored', async () => {
    const { service } = setup()
    await service.saveProfile('u', YEAR, A1, { name: 'Atelier Nord', startDate: '2020-04-01' })
    const fresh = await service.procedureDoc('u', YEAR, A1)
    expect(fresh.values).toEqual({})
    expect(Object.keys(fresh).sort((a, b) => a.localeCompare(b))).toMatchInlineSnapshot(`
      [
        "missing",
        "text",
        "values",
      ]
    `)
    const saved = await service.saveProcedureDoc('u', YEAR, A1, { unternehmen: 'Atelier Nord GbR' })
    expect(saved.values).toEqual({ unternehmen: 'Atelier Nord GbR' })
    expect(JSON.stringify(saved)).toContain('Atelier Nord GbR')
    expect(JSON.stringify(saved)).toContain('SKR03')
  })

  it('the fill-in help gate: an unknown year is a 404, a year without the tier a 402; forms with values are listed', async () => {
    const { service, interview } = setup()
    interview.seed('u', 2019, { job: 'Selbstständig' })
    await expect(service.assertElsterOpen('u', 2019)).rejects.toMatchObject({ code: 'ELSTER_YEAR_UNKNOWN' })
    await expect(service.assertElsterOpen('u', YEAR)).resolves.toBeUndefined()
    await expect(setup('Selbstständig', false).service.assertElsterOpen('u', YEAR)).rejects.toMatchObject({ status: 402 })
    await service.saveProfile('u', YEAR, A1, { confirmedKind: 'gewerbe', multiplierOverride: 400 })
    await service.post('u', YEAR, A1, sale)
    expect(await service.elsterFormsWithValues('u', YEAR, A1)).toMatchInlineSnapshot(`
      [
        "anlage-euer",
        "anlage-g",
        "ust-2-a",
        "gewst-1-a",
      ]
    `)
  })
})
