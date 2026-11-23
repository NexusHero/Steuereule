import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import {
  ASSESSMENT_POSITION_IDS,
  assessmentPosition,
  parseAssessmentNotice,
  receiptFilingYear,
  scrubDocumentTextPii,
  type AssessmentPositionId,
} from '@steuereule/core'
import { AdvisorService } from '../advisor/advisor.service.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import type { ParseReceiptDto, ParseReceiptResponseDto, ParsedAssessmentNoticeResponseDto } from '../receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry, type DocumentParseStrategy } from '../receipt/parse/document-parse.registry.js'
import { DETERMINISTIC_ENGINE, NOTHING_STAGED, SCAN_CHECK_NOTE, isFromOcr, noTaxYearReason, stagedDraftsOf, type StagedDrafts } from '../receipt/parse/document-parse-steps.js'

/** The Erläuterungen are quoted text: a long one is kept, a page of it is not. */
const MAX_EXPLANATIONS_LENGTH = 4_000

/**
 * `kind: 'steuerbescheid'` (ADR-0098 §4): the Einkommensteuerbescheid through the one upload pipeline
 * (ADR-0097). The core reads its Besteuerungsgrundlagen deterministically; each read position becomes an
 * owl draft for the year the Bescheid is for (Zero-Write, year rule §5). What it could not read is named,
 * never staged as 0. Taking the drafts over for a year without a declaration makes it an Eckjahr.
 */
@Injectable()
export class AssessmentNoticeParseStrategy implements DocumentParseStrategy, OnModuleInit {
  readonly kind = 'steuerbescheid' as const

  constructor(
    @Inject(DocumentParseRegistry) private readonly registry: DocumentParseRegistry,
    @Inject(AdvisorService) private readonly advisorService: AdvisorService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ASSESSMENT_REPOSITORY) private readonly assessments: AssessmentRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    const read = parseAssessmentNotice(dto.rawText ?? '')
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg_analyse' })

    const filingYear = receiptFilingYear(read.taxYear, dto.taxYear)
    // Only a PDF text layer is read as is; a scan's figures are offered to be checked (ADR-0060).
    const status = isFromOcr(dto) ? ('pruefen' as const) : ('ok' as const)
    const readIds = ASSESSMENT_POSITION_IDS.filter((id) => read.positions[id] !== undefined)
    const explanations = await this.safeExplanations(userId, filingYear ?? dto.taxYear, read.explanations)
    const fields = assessmentDraftFields(read, readIds, explanations, status)
    const createsEckjahr = filingYear !== null && !(await this.assessments.hasDeclaration(userId, filingYear))

    const staged =
      (dto.stageDraft ?? true) && filingYear !== null && fields.length > 0
        ? await this.stageDrafts(userId, dto, filingYear, { fields, fromScan: status === 'pruefen', createsEckjahr })
        : NOTHING_STAGED

    const assessmentNotice: ParsedAssessmentNoticeResponseDto = {
      receiptId: dto.receiptId ?? null,
      taxYearOnDocument: read.taxYear,
      assessmentDate: read.assessmentDate,
      read: readIds,
      notRead: ASSESSMENT_POSITION_IDS.filter((id) => read.positions[id] === undefined),
      explanations: explanations?.count ?? 0,
      createsEckjahr,
      stagedActionIds: staged.stagedActionIds,
    }
    return {
      mode: 'deterministic_fallback',
      securityBlocked: explanations === null && read.explanations.length > 0,
      parsed: assessmentSummary(read, readIds, filingYear ?? dto.taxYear, dto.taxYear),
      stagedAction: staged.stagedAction,
      assistantMessage: staged.assistantMessage,
      assessmentNotice,
      draftsTaxYear: staged.stagedActionIds.length > 0 ? filingYear : null,
      noValuesReason: noTaxYearReason(dto, filingYear) ?? (readIds.length === 0 ? 'nichts_erkannt' : null),
    }
  }

  /** Each read position as an owl draft for the year the Bescheid is for (Zero-Write). */
  private async stageDrafts(userId: string, dto: ParseReceiptDto, filingYear: number, input: { fields: AssessmentDraftField[]; fromScan: boolean; createsEckjahr: boolean }): Promise<StagedDrafts> {
    const staged = await this.advisorService.stageDocumentDrafts(userId, filingYear, {
      screen: 'assessment',
      person: 'A',
      digestUserId: userId,
      receiptId: dto.receiptId ?? null,
      engine: DETERMINISTIC_ENGINE,
      summaryText: [
        `Ich habe den Steuerbescheid für ${filingYear} gelesen.`,
        ...(input.fromScan ? [SCAN_CHECK_NOTE] : []),
        ...(input.createsEckjahr ? [`Für ${filingYear} gibt es in der App keine Erklärung: Übernimmst du die Werte, steht ${filingYear} im Verlauf als extern erledigt.`] : []),
      ].join('\n'),
      sourceId: 'ao-355',
      fields: input.fields,
    })
    return stagedDraftsOf(staged)
  }

  /**
   * The explanations are the Finanzamt's own words and are stored as a quote. Names of the household
   * are taken out first; a text that still carries an identifier is not staged at all.
   */
  private async safeExplanations(userId: string, year: number, paragraphs: readonly string[]): Promise<{ text: string; count: number } | null> {
    if (paragraphs.length === 0) return null
    const knownNames = await this.advisorService.knownNamesForScrubbing(userId, year)
    const text = paragraphs
      .map((p) => scrubDocumentTextPii(p, knownNames))
      .join('\n')
      .slice(0, MAX_EXPLANATIONS_LENGTH)
    try {
      checkPiiFree({ text })
    } catch {
      return null
    }
    return { text, count: paragraphs.length }
  }
}

type AssessmentRead = ReturnType<typeof parseAssessmentNotice>

export interface AssessmentDraftField {
  readonly field: string
  readonly label: string
  readonly value: number | string
  readonly status: 'ok' | 'pruefen'
  readonly reason: null
}

/** The drafts: every position read, the date of the Bescheid and the Finanzamt's explanations as a quote. */
export function assessmentDraftFields(
  read: AssessmentRead,
  readIds: readonly AssessmentPositionId[],
  explanations: { text: string } | null,
  status: 'ok' | 'pruefen',
): AssessmentDraftField[] {
  return [
    ...readIds.map((id) => ({ field: id, label: assessmentPosition(id).label, value: read.positions[id]!, status, reason: null })),
    ...(read.assessmentDate ? [{ field: 'assessmentDate', label: 'Bescheiddatum', value: read.assessmentDate, status, reason: null }] : []),
    ...(explanations ? [{ field: 'erlaeuterungen', label: 'Erläuterungen des Finanzamts', value: explanations.text, status, reason: null }] : []),
  ]
}

/** The receipt-level summary every reader returns, pointing at the first position read. */
function assessmentSummary(read: AssessmentRead, readIds: readonly AssessmentPositionId[], year: number, activeYear: number): ParseReceiptResponseDto['parsed'] {
  const first: AssessmentPositionId | undefined = readIds[0]
  return {
    vendorCategory: 'sonstiges',
    receiptDate: read.assessmentDate,
    amountEur: read.positions.erstattung === undefined ? null : Math.abs(read.positions.erstattung),
    suggestedScreen: 'assessment',
    suggestedField: first ?? null,
    suggestedValue: first === undefined ? null : String(read.positions[first]),
    summary: `Steuerbescheid ${read.taxYear ?? year} gelesen.`,
    taxYear: read.taxYear ?? activeYear,
  }
}
