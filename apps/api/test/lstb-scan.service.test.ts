// Unit tier (ADR-0004): „Werte übernehmen“ of a scanned LStB runs as one unit of work —
// values + Beleg provenance + staged advisor actions marked applied, or nothing at all.
import { beforeEach, describe, expect, it } from 'vitest'
import type { AdvisorDocumentStaging } from '../src/advisor/advisor-document-staging.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConflictError } from '../src/common/domain-error.js'
import { LstbScanService } from '../src/lstb-scan/lstb-scan.service.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { passThroughTransactionRunner, type TransactionRunner } from '../src/common/transaction-runner.js'
import { ReceiptService } from '../src/receipt/receipt.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { InMemoryStorageAdapter } from './fakes/in-memory-storage.adapter.js'

const USER_ID = 'user-scan'
const TAX_YEAR = 2025
const VALUES = { bruttoarbeitslohn: 54320, lohnsteuer: 9840, sozialversicherung: 10912 }

describe('LstbScanService.confirm (#444)', () => {
  let lstbRepository: FakeLstbRepository
  let receiptRepository: FakeReceiptRepository
  let appliedCalls: { userId: string; taxYear: number; actionIds: readonly string[] }[]
  let transactionRuns: number
  let service: LstbScanService

  beforeEach(() => {
    lstbRepository = new FakeLstbRepository()
    receiptRepository = new FakeReceiptRepository()
    appliedCalls = []
    transactionRuns = 0
    const audit = new AuditService(new FakeAuditRepository())
    const advisor = {
      markLstbActionsApplied: async (userId: string, taxYear: number, actionIds: readonly string[]) => {
        appliedCalls.push({ userId, taxYear, actionIds })
      },
    } as unknown as AdvisorDocumentStaging
    const transactions: TransactionRunner = {
      rollsBack: false,
      isActive: () => false,
      run: async (work) => {
        transactionRuns += 1
        return work()
      },
    }
    service = new LstbScanService(
      new LstbService(lstbRepository, audit, new FakeMarkingRepository()),
      advisor,
      new ReceiptService(receiptRepository, audit, new InMemoryStorageAdapter()),
      transactions,
    )
  })

  it('writes the values and marks the staged actions applied inside one transaction', async () => {
    const receipt = await receiptRepository.create(USER_ID, { fileName: 'lstb.pdf' })

    const result = await service.confirm(USER_ID, USER_ID, TAX_YEAR, {
      ...VALUES,
      receiptId: receipt.id,
      actionIds: ['act-1', 'act-2'],
    })

    expect(result.state).toEqual({ kind: 'vollstaendig', ...VALUES })
    expect(transactionRuns).toBe(1)
    expect(appliedCalls).toEqual([{ userId: USER_ID, taxYear: TAX_YEAR, actionIds: ['act-1', 'act-2'] }])
  })

  it('rejects a foreign receiptId without leaking existence and writes nothing', async () => {
    const foreign = await receiptRepository.create('other-user', { fileName: 'other.pdf' })

    await expect(service.confirm(USER_ID, USER_ID, TAX_YEAR, { ...VALUES, receiptId: foreign.id })).rejects.toThrow(
      /does not exist/,
    )
    expect(await lstbRepository.findForUserAndYear(USER_ID, TAX_YEAR)).toBeNull()
    expect(appliedCalls).toHaveLength(0)
  })

  it('does not mark proposals applied when the existing-values conflict blocks the write (ADR-0008)', async () => {
    lstbRepository.seed({ userId: USER_ID, taxYear: TAX_YEAR, bruttoarbeitslohn: '40000', lohnsteuer: null, sozialversicherung: null })

    await expect(service.confirm(USER_ID, USER_ID, TAX_YEAR, { ...VALUES, actionIds: ['act-1'] })).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(appliedCalls).toHaveLength(0)
  })
})

describe('LstbScanService.confirm — the further lines of the scan', () => {
  let lstbRepository: FakeLstbRepository
  let lstbService: LstbService
  let service: LstbScanService

  beforeEach(() => {
    lstbRepository = new FakeLstbRepository()
    const audit = new AuditService(new FakeAuditRepository())
    lstbService = new LstbService(lstbRepository, audit, new FakeMarkingRepository())
    const advisor = { markLstbActionsApplied: async () => {} } as unknown as AdvisorDocumentStaging
    service = new LstbScanService(lstbService, advisor, new ReceiptService(new FakeReceiptRepository(), audit, new InMemoryStorageAdapter()), passThroughTransactionRunner)
  })

  const LINES = {
    solidaritaetszuschlag: 12.34,
    kirchensteuer: 576,
    kirchensteuerEhegatte: 121,
    rvArbeitgeber: 4474,
    rvArbeitnehmer: 4464,
    zuschuesseKvPv: 0,
    kvArbeitnehmer: 3651,
    pvArbeitnehmer: 816,
    avArbeitnehmer: 624,
  }

  it('writes every confirmed line and the employer in the same step as the three values', async () => {
    await service.confirm(USER_ID, USER_ID, TAX_YEAR, { bruttoarbeitslohn: 48000, lohnsteuer: 7200, sozialversicherung: 9555, lines: LINES, arbeitgeber: 'Beispielwerke GmbH' })

    const lines = await lstbService.getLines(USER_ID, TAX_YEAR)
    expect(lines).toMatchObject({ rvArbeitgeber: 4474, rvArbeitnehmer: 4464, kvArbeitnehmer: 3651, pvArbeitnehmer: 816, avArbeitnehmer: 624, solidaritaetszuschlag: 12.34, zuschuesseKvPv: 0, sozialversicherung: 9555 })
    expect(await lstbService.getChurchTax(USER_ID, TAX_YEAR)).toEqual({ kirchensteuer: 576, kirchensteuerEhegatte: 121 })
    expect(await lstbService.getEmployer(USER_ID, TAX_YEAR)).toEqual({ arbeitgeber: 'Beispielwerke GmbH' })
    expect((await lstbService.getState(USER_ID, TAX_YEAR)).state).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 48000, lohnsteuer: 7200, sozialversicherung: 9555 })
  })

  it('adds the lines of a further certificate to those recorded and keeps the employer named first', async () => {
    await service.confirm(USER_ID, USER_ID, TAX_YEAR, { bruttoarbeitslohn: 48000, lohnsteuer: 7200, sozialversicherung: 9555, lines: LINES, arbeitgeber: 'Beispielwerke GmbH' })
    await service.confirm(USER_ID, USER_ID, TAX_YEAR, {
      bruttoarbeitslohn: 2000,
      lohnsteuer: 100,
      sozialversicherung: 400,
      lines: { kirchensteuer: 9, rvArbeitnehmer: 186, kvArbeitnehmer: 160, pvArbeitnehmer: 34, avArbeitnehmer: 20 },
      arbeitgeber: 'Zweitfirma AG',
      addToExisting: true,
    })
    const lines = await lstbService.getLines(USER_ID, TAX_YEAR)
    expect(lines).toMatchObject({ rvArbeitnehmer: 4650, kvArbeitnehmer: 3811, pvArbeitnehmer: 850, avArbeitnehmer: 644, rvArbeitgeber: 4474, sozialversicherung: 9955 })
    expect(await lstbService.getChurchTax(USER_ID, TAX_YEAR)).toEqual({ kirchensteuer: 585, kirchensteuerEhegatte: 121 })
    expect(await lstbService.getEmployer(USER_ID, TAX_YEAR)).toEqual({ arbeitgeber: 'Beispielwerke GmbH' })
  })

  it('leaves the lines alone when the scan confirmed none', async () => {
    lstbRepository.seed({ userId: USER_ID, taxYear: TAX_YEAR, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, kirchensteuer: '300' })
    await service.confirm(USER_ID, USER_ID, TAX_YEAR, { bruttoarbeitslohn: 48000, lohnsteuer: 7200, overwriteExisting: true })
    expect(await lstbService.getChurchTax(USER_ID, TAX_YEAR)).toEqual({ kirchensteuer: 300, kirchensteuerEhegatte: null })
  })
})
