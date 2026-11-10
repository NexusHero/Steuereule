// Unit tier (ADR-0004): „Werte übernehmen“ of a scanned LStB runs as one unit of work —
// values + Beleg provenance + staged advisor actions marked applied, or nothing at all.
import { beforeEach, describe, expect, it } from 'vitest'
import type { AdvisorService } from '../src/advisor/advisor.service.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConflictError } from '../src/common/domain-error.js'
import { LstbScanService } from '../src/lstb-scan/lstb-scan.service.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import type { TransactionRunner } from '../src/prisma/transaction.js'
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
    } as unknown as AdvisorService
    const transactions: TransactionRunner = {
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
