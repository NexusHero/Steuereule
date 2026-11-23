import { Inject, Injectable } from '@nestjs/common'
import {
  looksLikeCraftsmanInvoice,
  looksLikeDonationReceipt,
  looksLikeMedicalInvoice,
  parseMedicalInvoice,
  parseCraftsmanInvoice,
  childcarePeriod,
  childcarePaidInYear,
  holderChildId,
  isHolderRef,
  sectionForMember,
  looksLikeChildcareNotice,
  parseDonationReceipt,
  receiptFilingYear,
  scrubDocumentTextPii,
  uncountedDonations,
  type AdvisorCountedItem,
  type CraftsmanInvoiceRead,
  type ReceiptReadReason,
} from '@steuereule/core'
import { AdvisorDocumentStaging } from '../../advisor/advisor-document-staging.js'
import { AuditService } from '../../audit/audit.service.js'
import { AI_RUNTIME_CONFIG_SERVICE, type AiRuntimeConfigService, type ResolvedAiSlotConfig } from '../../ki/ai-runtime-config.service.js'
import { SINGLE_SHOT_MODEL_FACTORY, type SingleShotModelFactory } from '../../ki/single-shot-model.js'
import { checkPiiFree } from '../../ki/ki.adapter.js'
import type { ParseReceiptDto, ParseReceiptResponseDto, ParsedReceiptDataDto } from '../dto/parse-receipt.dto.js'
import {
  COSMETIC_TREATMENT_SUMMARY,
  STAGE1_EXTRACTION_SCHEMA,
  STAGE1_ISOLATED_SYSTEM_PROMPT,
  applyCraftsmanInvoice,
  childcareSummary,
  craftsmanProposal,
  extractDeterministically,
  hashDonation,
  hashMedical,
  proposalDetailsFor,
  repeatedDonationsNote,
  sanitizeExtractedTarget,
} from './auto-receipt-steps.js'
import { DETERMINISTIC_ENGINE, extractWithModel, resolveVisionModel, stagingEngine } from './document-parse-steps.js'
import type { DocumentParseStrategy } from './document-parse.registry.js'

/** What the read knows so far; each rule below refines it. */
interface ReceiptReading {
  readonly parsed: ParsedReceiptDataDto
  /** The slot whose model read the text; null when the deterministic read stands. */
  readonly slot: ResolvedAiSlotConfig | null
  readonly securityBlocked: boolean
  readonly invoice: CraftsmanInvoiceRead | null
  /** A donation certificate was recognised; the medical and childcare rules then do not apply. */
  readonly donationRecognised: boolean
  readonly countedItems?: AdvisorCountedItem[] | undefined
  /** A certificate without the donation's date or period: the year it was paid is asked (real-data run). */
  readonly donationUndated: boolean
  /** Why nothing is proposed, when a rule knows (ADR-0097): the Beleg says it instead of „nichts erkannt“. */
  readonly noValuesReason: ReceiptReadReason | null
}

/** A childcare notice for one known child, to be staged for its Anlage Kind. */
interface ChildcareDraft {
  readonly period: { from: string; to: string }
  readonly childId: string
  readonly careText: string | undefined
}

/**
 * Default `kind: 'auto'` strategy for chat/inbox receipts (donations, work equipment, training …):
 * deterministic pre-extraction, then an isolated single-shot model call on scrubbed text only, then the
 * fixed rules for craftsman invoices, donation certificates, medical invoices and childcare notices.
 */
@Injectable()
export class AutoReceiptParseStrategy implements DocumentParseStrategy {
  readonly kind = 'auto' as const

  constructor(
    @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig: AiRuntimeConfigService,
    @Inject(AdvisorDocumentStaging) private readonly staging: AdvisorDocumentStaging,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SINGLE_SHOT_MODEL_FACTORY) private readonly resolveModel: SingleShotModelFactory,
  ) {}

  async parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    let reading = await this.readText(userId, dto)
    reading = this.applyCraftsmanRule(dto, reading)
    reading = await this.applyDonationRule(userId, dto, reading)
    reading = await this.applyMedicalRule(userId, dto, reading)
    const childcare = await this.readChildcareNotice(userId, dto, reading)
    if (childcare.draft) return this.stageChildcare(userId, dto, childcare.reading, childcare.draft)
    await this.passFirewall(userId, childcare.reading.parsed)
    return this.stageProposal(userId, dto, childcare.reading)
  }

  /** The deterministic read, replaced by the model's when a model is configured and answers in the schema. */
  private async readText(userId: string, dto: ParseReceiptDto): Promise<ReceiptReading> {
    const deterministic: ReceiptReading = {
      parsed: extractDeterministically(dto),
      slot: null,
      securityBlocked: false,
      invoice: null,
      donationRecognised: false,
      donationUndated: false,
      noValuesReason: null,
    }
    const vision = await resolveVisionModel(this.runtimeConfig, this.resolveModel)
    const knownNames = await this.staging.knownNamesForScrubbing(userId, dto.taxYear)
    // Uploaded documents carry address blocks, employer lines and IDs that chat text does not.
    const safeText = dto.rawText ? scrubDocumentTextPii(dto.rawText, knownNames) : ''
    // Text only (ADR-0051): document pixels never reach a model. Without text there is nothing to send.
    if (!vision || safeText.length === 0) return deterministic
    try {
      // Single-shot and isolated: no chat history, no profile, no tools, and no file name
      // (users name files after themselves).
      const context = `Steuerjahr-Kontext: ${dto.taxYear}`
      const validated = await extractWithModel(vision.model, { system: STAGE1_ISOLATED_SYSTEM_PROMPT, user: `${context}\nBelegtext:\n${safeText}` }, STAGE1_EXTRACTION_SCHEMA)
      const sanitized = sanitizeExtractedTarget(validated, knownNames)
      return { ...deterministic, parsed: sanitized.parsed, securityBlocked: sanitized.securityBlocked, slot: vision.slot }
    } catch {
      return deterministic
    }
  }

  /** A craftsman's invoice: its labour share replaces whatever the read proposed (§ 35a, ADR-0078). */
  private applyCraftsmanRule(dto: ParseReceiptDto, reading: ReceiptReading): ReceiptReading {
    const invoice = !reading.securityBlocked && dto.rawText && looksLikeCraftsmanInvoice(dto.rawText) ? parseCraftsmanInvoice(dto.rawText) : null
    if (!invoice) return reading
    return { ...reading, invoice, parsed: applyCraftsmanInvoice(reading.parsed, invoice), noValuesReason: invoice.notAnInvoice ? 'keine_rechnung' : reading.noValuesReason }
  }

  /**
   * A Zuwendungsbestätigung: the donations it lists that are not counted yet (ADR-0080). A partner's own
   * receipt repeating a joint booking, or a copy („Doppel“), adds nothing; the year is the year donated.
   */
  private async applyDonationRule(userId: string, dto: ParseReceiptDto, reading: ReceiptReading): Promise<ReceiptReading> {
    const donation = !reading.securityBlocked && !reading.invoice && dto.rawText && looksLikeDonationReceipt(dto.rawText) ? parseDonationReceipt(dto.rawText) : null
    if (!donation) return reading
    const recognised = { ...reading, donationRecognised: true }
    // Without a readable amount the model's reading stands.
    if (donation.items.length === 0) return recognised
    const { parsed } = reading
    const year = donation.taxYear ?? parsed.taxYear ?? dto.taxYear
    const counted = await this.staging.countedReceiptItems(userId, year, { screen: 'interview', field: 'spenden-betrag' })
    const { fresh, repeated } = uncountedDonations(donation.items.map(hashDonation), counted)
    const freshEur = Math.round(fresh.reduce((sum, item) => sum + item.amountCents, 0) / 100)
    const note = repeatedDonationsNote(fresh.length, repeated.length, donation.isCopy, freshEur)
    return {
      ...recognised,
      parsed: {
        ...parsed,
        vendorCategory: 'spende',
        amountEur: donation.totalEur ?? parsed.amountEur,
        taxYear: year,
        suggestedScreen: freshEur > 0 ? 'interview' : null,
        suggestedField: freshEur > 0 ? 'spenden-betrag' : null,
        suggestedValue: freshEur > 0 ? String(freshEur) : null,
        summary: note ? `${parsed.summary} ${note}`.trim() : parsed.summary,
      },
      countedItems: fresh.map(({ ref, amountKey }) => ({ ref, amountKey })),
      donationUndated: donation.taxYear === null,
      noValuesReason: freshEur === 0 && repeated.length > 0 ? 'schon_gezaehlt' : reading.noValuesReason,
    }
  }

  /**
   * A doctor's or dentist's invoice adds to the year's Krankheitskosten (§ 33 EStG); the same invoice
   * counts once. A cosmetic operation without a medical reason is no extraordinary burden: nothing is drafted.
   */
  private async applyMedicalRule(userId: string, dto: ParseReceiptDto, reading: ReceiptReading): Promise<ReceiptReading> {
    const medical =
      !reading.securityBlocked && !reading.invoice && !reading.donationRecognised && dto.rawText && looksLikeMedicalInvoice(dto.rawText) && !looksLikeChildcareNotice(dto.rawText)
        ? parseMedicalInvoice(dto.rawText)
        : null
    const { parsed } = reading
    if (medical?.cosmetic) {
      const blank = { suggestedScreen: null, suggestedField: null, suggestedValue: null }
      return { ...reading, noValuesReason: 'nicht_absetzbar', parsed: { ...parsed, ...blank, vendorCategory: 'krankheitskosten', amountEur: medical.totalEur ?? parsed.amountEur, summary: COSMETIC_TREATMENT_SUMMARY } }
    }
    if (!medical || medical.totalEur === null || medical.totalEur <= 0) return reading
    const year = medical.taxYear ?? parsed.taxYear ?? dto.taxYear
    const hashed = hashMedical(medical.ref)
    const counted = await this.staging.countedReceiptItems(userId, year, { screen: 'interview', field: 'gesundheit-betrag' })
    const repeated = counted.some((c) => c.ref === hashed)
    return {
      ...reading,
      parsed: {
        ...parsed,
        vendorCategory: 'krankheitskosten',
        amountEur: medical.totalEur,
        taxYear: year,
        suggestedScreen: repeated ? null : 'interview',
        suggestedField: repeated ? null : 'gesundheit-betrag',
        suggestedValue: repeated ? null : String(medical.totalEur),
        summary: repeated ? 'Diese Rechnung ist schon bei den Krankheitskosten gezählt; sie kommt nicht noch einmal dazu.' : parsed.summary,
      },
      ...(repeated ? { noValuesReason: 'schon_gezaehlt' as const } : { countedItems: [{ ref: hashed, amountKey: hashed }] }),
    }
  }

  /**
   * A childcare notice: the care period for Anlage Kind Zeile 67, for the year's only child (ADR-0086). The
   * amount stays with the user: a notice states a monthly contribution, not what was paid. A notice for one
   * child of several, chosen by the user (ADR-0092): only that child's lines are read.
   */
  private async readChildcareNotice(userId: string, dto: ParseReceiptDto, reading: ReceiptReading): Promise<{ reading: ReceiptReading; draft: ChildcareDraft | null }> {
    const chosenChild = dto.holder !== undefined && isHolderRef(dto.holder) ? holderChildId(dto.holder) : null
    const careText = chosenChild !== null && dto.rawText ? await this.childSection(userId, dto.taxYear, dto.rawText, chosenChild) : dto.rawText
    const period = !reading.securityBlocked && !reading.invoice && !reading.donationRecognised && careText ? childcarePeriod(careText, dto.taxYear) : null
    const child = period && (dto.stageDraft ?? true) ? (chosenChild !== null ? { id: chosenChild, children: 1 } : await this.staging.childForReceipt(userId, dto.taxYear, dto.rawText ?? '')) : null
    const childId = child?.id ?? null
    if (period && childId) return { reading, draft: { period, childId, careText } }
    if (period && child && child.children > 1) {
      // Several children and the notice names none of them: no guess, the user assigns it.
      const summary = `Betreuungsbescheid gelesen: Betreuung vom ${period.from} bis ${period.to}. Für welches eurer Kinder er gilt, steht nicht eindeutig darin; trag den Zeitraum bitte beim Kind ein (Anlage Kind Zeile 67).`
      return { reading: { ...reading, parsed: { ...reading.parsed, vendorCategory: 'kinderbetreuung', summary } }, draft: null }
    }
    return { reading, draft: null }
  }

  /** The lines of a childcare notice about one child, when it lists several (ADR-0092 §5). */
  private async childSection(userId: string, taxYear: number, rawText: string, childId: string): Promise<string> {
    const members = await this.staging.householdMembers(userId, taxYear)
    const child = members.find((m) => m.ref === `kind:${childId}`)
    return child === undefined ? rawText : sectionForMember(rawText, child, members.filter((m) => m.ref.startsWith('kind:')))
  }

  /** The childcare notice's drafts for the child's Anlage Kind: the period, and what was paid when it says so. */
  private async stageChildcare(userId: string, dto: ParseReceiptDto, reading: ReceiptReading, draft: ChildcareDraft): Promise<ParseReceiptResponseDto> {
    const { period, childId } = draft
    const ocr = dto.textSource !== 'pdf_text'
    // A Kita's annual statement says what was paid; a plain notice only the monthly contribution.
    const paid = childcarePaidInYear(draft.careText ?? '', dto.taxYear)
    const staged = await this.staging.stageDocumentDrafts(userId, dto.taxYear, {
      screen: 'kind',
      person: 'A',
      digestUserId: userId,
      receiptId: dto.receiptId ?? null,
      engine: DETERMINISTIC_ENGINE,
      summaryText: childcareSummary(period, dto.taxYear, paid),
      sourceId: 'estg-10-1-5',
      fields: [
        { field: 'childcareFrom', label: 'Kinderbetreuung von', value: period.from, status: ocr ? 'pruefen' : 'ok', reason: ocr ? 'ocr_source' : null, instance: childId },
        { field: 'childcareTo', label: 'Kinderbetreuung bis', value: period.to, status: 'pruefen', reason: null, instance: childId },
        ...(paid !== null
          ? [{ field: 'childcareEur', label: 'Kinderbetreuung gezahlt (Jahr)', value: paid, status: 'pruefen' as const, reason: ocr ? ('ocr_source' as const) : null, instance: childId }]
          : []),
      ],
    })
    await this.passFirewall(userId, reading.parsed)
    const mode = reading.slot ? 'vision_ocr' : 'deterministic_fallback'
    return { mode, securityBlocked: reading.securityBlocked, parsed: { ...reading.parsed, vendorCategory: 'kinderbetreuung' }, stagedAction: staged.actions[0] ?? null, assistantMessage: staged.assistantMessage, draftsTaxYear: dto.taxYear }
  }

  /**
   * Security Firewall Bridge between Stage 1 (untrusted doc OCR) and Stage 2 (advisor staging):
   * throws synchronously if IBAN, 11-digit Steuer-ID, or forbidden personal keys slipped into the extracted
   * payload. Then the read is audited.
   */
  private async passFirewall(userId: string, parsed: ParsedReceiptDataDto): Promise<void> {
    checkPiiFree(parsed)
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg_analyse' })
  }

  /** The one proposal of the read, staged for the document's own year (ADR-0097 §5), or why there is none. */
  private async stageProposal(userId: string, dto: ParseReceiptDto, reading: ReceiptReading): Promise<ParseReceiptResponseDto> {
    const { parsed, securityBlocked, invoice } = reading
    const mode = reading.slot ? 'vision_ocr' : 'deterministic_fallback'
    // One year rule (ADR-0097 §5): the drafts go to the document's own year; a year the app does not keep gets none.
    const targetTaxYear = receiptFilingYear(parsed.taxYear, dto.taxYear)
    if (securityBlocked || !(dto.stageDraft ?? true) || targetTaxYear === null || parsed.suggestedScreen === null || parsed.suggestedField === null || parsed.suggestedValue === null) {
      const noValuesReason = targetTaxYear === null && parsed.suggestedValue !== null ? 'kein_steuerjahr' : reading.noValuesReason
      return { mode, securityBlocked, parsed, stagedAction: null, assistantMessage: null, draftsTaxYear: null, noValuesReason }
    }
    const proposalMeta = invoice?.labourEur ? craftsmanProposal(invoice) : proposalDetailsFor(parsed, reading.donationUndated)
    const staged = await this.staging.stageReceiptProposal(userId, targetTaxYear, {
      screen: parsed.suggestedScreen,
      field: parsed.suggestedField,
      newValue: parsed.suggestedValue,
      companionFields: proposalMeta.companionFields,
      label: proposalMeta.label,
      reason: proposalMeta.reason,
      sourceId: proposalMeta.sourceId,
      summaryText: proposalMeta.summaryText,
      receiptId: dto.receiptId ?? null,
      ...(reading.countedItems ? { countedItems: reading.countedItems } : {}),
      fromOcr: dto.textSource !== undefined && dto.textSource !== 'pdf_text',
      engine: stagingEngine(reading.slot),
    })
    return { mode, securityBlocked, parsed, stagedAction: staged.action, assistantMessage: staged.assistantMessage, draftsTaxYear: targetTaxYear }
  }
}
