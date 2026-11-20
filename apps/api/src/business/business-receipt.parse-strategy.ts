import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import { bookingDraftFromReceipt, checkBookingDraft, readBusinessReceipt, serializeBookingDraft } from '@steuereule/core'
import { AdvisorService } from '../advisor/advisor.service.js'
import { AuditService } from '../audit/audit.service.js'
import type { ParseReceiptDto, ParseReceiptResponseDto } from '../receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry, type DocumentParseStrategy } from '../receipt/parse/document-parse.registry.js'
import { BusinessService } from './business.service.js'

/**
 * `kind: 'geschaeftsbeleg'` (ADR-0101 §6, §18): a Rechnung or Quittung of the business through the one
 * receipt pipeline (ADR-0097). The core reads total, VAT rate, date and number and proposes the entry
 * (account, tax key, depreciation for an asset); the book checks it; it becomes a booking draft. Nothing
 * is booked until the user takes the draft (Zero-Write, ADR-0066).
 */
@Injectable()
export class BusinessReceiptParseStrategy implements DocumentParseStrategy, OnModuleInit {
  readonly kind = 'geschaeftsbeleg' as const

  constructor(
    @Inject(DocumentParseRegistry) private readonly registry: DocumentParseRegistry,
    @Inject(AdvisorService) private readonly advisor: AdvisorService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessService) private readonly business: BusinessService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    const read = readBusinessReceipt(dto.rawText ?? '')
    await this.audit.append({ userId, action: 'READ', resource: 'beleg_analyse' })
    if (!(await this.business.pathOpen(userId, dto.taxYear))) {
      const summary = 'Geschäftsbelege bucht SteuerEule nur für Selbstständige; dafür ist die Selbstständigkeit im Interview anzugeben.'
      return { mode: 'deterministic_fallback', securityBlocked: false, parsed: { vendorCategory: 'sonstiges', receiptDate: read.date, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary, taxYear: null }, stagedAction: null, assistantMessage: null, draftsTaxYear: null }
    }
    const target = await this.business.bookingTarget(userId, dto.taxYear, 'A')
    const proposal = bookingDraftFromReceipt(read, {
      chart: target.chart,
      smallBusiness: target.smallBusiness,
      year: dto.taxYear,
      direction: dto.direction ?? 'ausgabe',
      receiptRef: dto.receiptId,
    })
    const amountEur = read.grossCents === null ? null : Math.round(read.grossCents / 100)
    const parsed = {
      vendorCategory: 'sonstiges' as const,
      receiptDate: read.date,
      amountEur,
      suggestedScreen: proposal.ok ? ('buchung' as const) : null,
      suggestedField: proposal.ok ? 'entry' : null,
      suggestedValue: null,
      summary: proposal.ok ? `Geschäftsbeleg über ${amountEur} € gelesen.` : proposal.reason,
      taxYear: read.date ? Number(read.date.slice(0, 4)) : null,
    }
    const nothing = { mode: 'deterministic_fallback' as const, securityBlocked: false, parsed, stagedAction: null, assistantMessage: null, draftsTaxYear: null }
    if (!proposal.ok || dto.stageDraft === false) return nothing
    const check = checkBookingDraft(proposal.draft, target)
    if (!check.ok) return { ...nothing, parsed: { ...parsed, summary: check.reason } }
    const staged = await this.advisor.stageBookingProposal(userId, dto.taxYear, {
      entry: serializeBookingDraft(proposal.draft),
      label: `Buchung: ${proposal.draft.text}`,
      reason: ['Aus dem Geschäftsbeleg gelesen.', ...proposal.notes].join(' '),
      summaryText: ['Ich habe den Geschäftsbeleg als Buchung vorbereitet. Prüf Konto, Steuersatz und Datum, bevor du sie übernimmst.', ...proposal.notes].join('\n'),
      receiptId: dto.receiptId ?? null,
      fromOcr: dto.textSource !== undefined && dto.textSource !== 'pdf_text',
      engine: { mode: 'deterministic_fallback', provider: 'deterministic' },
    })
    return { ...nothing, stagedAction: staged.action, assistantMessage: staged.assistantMessage, draftsTaxYear: dto.taxYear }
  }
}
