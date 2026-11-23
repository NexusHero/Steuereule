// ADR-0101 §6 + ADR-0097: a business receipt goes through the one Beleg upload. The upload records whether it
// is an expense or an income (`direction`), the parse routes the Beleg to the business reader and carries the
// direction into `bookingDraftFromReceipt`.
import { afterEach, describe, expect, it } from 'vitest'
import { businessOfInstance, instanceForBusiness } from '../src/business/booking-field-access.js'
import { AuditService } from '../src/audit/audit.service.js'
import { BusinessReceiptParseStrategy } from '../src/business/business-receipt.parse-strategy.js'
import type { BusinessService } from '../src/business/business.service.js'
import type { AdvisorDocumentStaging } from '../src/advisor/advisor-document-staging.js'
import type { ParseReceiptDto, ParseReceiptResponseDto } from '../src/receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { ReceiptParseService } from '../src/receipt/receipt-parse.service.js'
import { ReceiptService } from '../src/receipt/receipt.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { InMemoryStorageAdapter } from './fakes/in-memory-storage.adapter.js'

const PDF = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n')
const INVOICE = 'Übersetzungsbüro Muster\nRechnung Nr. RE-2025-7\nRechnungsdatum: 02.04.2025\nÜbersetzung Vertrag\nGesamtbetrag 1.190,00 EUR\nUSt 19 %'

const nothing = (): ParseReceiptResponseDto => ({ mode: 'deterministic_fallback', securityBlocked: false, parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: null }, stagedAction: null, assistantMessage: null })

describe('business receipts through the one Beleg upload (ADR-0101 §6)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('the upload stores the direction and files the Beleg as a Geschäftsbeleg', async () => {
    const repository = new FakeReceiptRepository()
    const service = new ReceiptService(repository, new AuditService(new FakeAuditRepository()), new InMemoryStorageAdapter())
    const uploaded = await service.upload('u', { fileName: 'rechnung.pdf', buffer: PDF, direction: 'einnahme' })
    expect(uploaded).toMatchObject({ kind: 'Geschaeftsbeleg', direction: 'einnahme' })
    await expect(service.upload('u', { fileName: 'x.pdf', buffer: PDF, direction: 'seitwaerts' })).rejects.toMatchObject({ code: 'RECEIPT_DIRECTION_INVALID' })
  })

  it('the parse of a stored Geschäftsbeleg goes to the business reader with the stored direction', async () => {
    const repository = new FakeReceiptRepository()
    const service = new ReceiptService(repository, new AuditService(new FakeAuditRepository()), new InMemoryStorageAdapter())
    const uploaded = await service.upload('u', { fileName: 'rechnung.pdf', buffer: PDF, direction: 'einnahme' })
    const registry = new DocumentParseRegistry()
    const seen: ParseReceiptDto[] = []
    registry.register({ kind: 'geschaeftsbeleg', parse: async (_u: string, dto: ParseReceiptDto) => (seen.push(dto), nothing()) })
    const auto = { kind: 'auto', parse: async () => nothing() }
    const parser = new ReceiptParseService(registry, auto as never, repository)
    parser.onModuleInit()
    await parser.parseReceipt('u', { taxYear: 2025, fileName: 'rechnung.pdf', rawText: INVOICE, receiptId: uploaded.id })
    expect(seen[0]).toMatchObject({ direction: 'einnahme' })
  })

  it('the reader drafts an income booking for direction einnahme', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const staged: { entry: string }[] = []
    const advisor = { stageBookingProposal: async (_u: string, _y: number, input: { entry: string }) => (staged.push(input), { action: null, assistantMessage: null }) } as unknown as AdvisorDocumentStaging
    const business = { pathOpen: async () => true, bookingTarget: async () => ({ chart: 'SKR03', mode: 'euer', year: 2025, lockedThrough: null, smallBusiness: false }) } as unknown as BusinessService
    const strategy = new BusinessReceiptParseStrategy(new DocumentParseRegistry(), advisor, new AuditService(new FakeAuditRepository()), business)
    await strategy.parse('u', { taxYear: 2025, fileName: 'r.pdf', rawText: INVOICE, direction: 'einnahme' })
    const draft = JSON.parse(staged[0]!.entry) as { lines: { account: string; side: string; taxKey?: string }[] }
    expect(draft.lines).toEqual([
      expect.objectContaining({ account: '1200', side: 'debit' }),
      expect.objectContaining({ account: '8400', side: 'credit', taxKey: 'ust19' }),
    ])
  })

  it('books into the chosen business: its frame is asked, the draft names it (ADR-0101 §22)', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const staged: { business?: number }[] = []
    const asked: unknown[] = []
    const advisor = { stageBookingProposal: async (_u: string, _y: number, input: { business?: number }) => (staged.push(input), { action: null, assistantMessage: null }) } as unknown as AdvisorDocumentStaging
    const business = { pathOpen: async () => true, bookingTarget: async (_u: string, _y: number, ref: unknown) => (asked.push(ref), { chart: 'SKR03', mode: 'euer', year: 2025, lockedThrough: null, smallBusiness: false }) } as unknown as BusinessService
    const strategy = new BusinessReceiptParseStrategy(new DocumentParseRegistry(), advisor, new AuditService(new FakeAuditRepository()), business)
    await strategy.parse('u', { taxYear: 2025, fileName: 'r.pdf', rawText: INVOICE, business: 2 })
    expect(asked).toEqual([{ person: 'A', business: 2 }])
    expect(staged[0]?.business).toBe(2)
  })

  it('reads the business of a draft from its instance, the first without a prefix', () => {
    expect(businessOfInstance('beleg-abc')).toEqual({ person: 'A', business: 1 })
    expect(businessOfInstance(instanceForBusiness(3, 'beleg-abc'))).toEqual({ person: 'A', business: 3 })
    expect(instanceForBusiness(1, 'beleg-abc')).toBe('beleg-abc')
  })
})
