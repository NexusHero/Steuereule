import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import {
  ASSESSMENT_POSITION_IDS,
  assessmentPosition,
  parseAssessmentNotice,
  receiptFilingYear,
  scrubDocumentTextPii,
  type AssessmentPositionId,
} from '@steuereule/core'
import { AdvisorDocumentStaging } from '../advisor/advisor-document-staging.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import type { ParseReceiptDto, ParseReceiptResponseDto, ParsedAssessmentNoticeResponseDto } from '../receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry, type DocumentParseStrategy } from '../receipt/parse/document-parse.registry.js'

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
    @Inject(AdvisorDocumentStaging) private readonly staging: AdvisorDocumentStaging,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ASSESSMENT_REPOSITORY) private readonly assessments: AssessmentRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    const rawText = dto.rawText ?? ''
    const read = parseAssessmentNotice(rawText)
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg_analyse' })

    const filingYear = receiptFilingYear(read.taxYear, dto.taxYear)
    const year = filingYear ?? dto.taxYear
    // Only a PDF text layer is read as is; a scan's figures are offered to be checked (ADR-0060).
    const status = dto.textSource === 'pdf_text' ? ('ok' as const) : ('pruefen' as const)
    const readIds = ASSESSMENT_POSITION_IDS.filter((id) => read.positions[id] !== undefined)
    const explanations = await this.safeExplanations(userId, year, read.explanations)

    const fields = [
      ...readIds.map((id) => ({ field: id, label: assessmentPosition(id).label, value: read.positions[id]!, status, reason: null })),
      ...(read.assessmentDate ? [{ field: 'assessmentDate', label: 'Bescheiddatum', value: read.assessmentDate, status, reason: null }] : []),
      ...(explanations ? [{ field: 'erlaeuterungen', label: 'Erläuterungen des Finanzamts', value: explanations.text, status, reason: null }] : []),
    ]
    const createsEckjahr = filingYear !== null && !(await this.assessments.hasDeclaration(userId, filingYear))
    const summary = `Steuerbescheid ${read.taxYear ?? year} gelesen.`

    let stagedActionIds: string[] = []
    let stagedAction: ParseReceiptResponseDto['stagedAction'] = null
    let assistantMessage: ParseReceiptResponseDto['assistantMessage'] = null
    if ((dto.stageDraft ?? true) && filingYear !== null && fields.length > 0) {
      const staged = await this.staging.stageDocumentDrafts(userId, filingYear, {
        screen: 'assessment',
        person: 'A',
        digestUserId: userId,
        receiptId: dto.receiptId ?? null,
        engine: { mode: 'deterministic_fallback', provider: 'deterministic' },
        summaryText: [
          `Ich habe den Steuerbescheid für ${filingYear} gelesen.`,
          ...(status === 'pruefen' ? ['Der Text stammt aus einem Scan; prüfe die Beträge, bevor du sie übernimmst.'] : []),
          ...(createsEckjahr ? [`Für ${filingYear} gibt es in der App keine Erklärung: Übernimmst du die Werte, steht ${filingYear} im Verlauf als extern erledigt.`] : []),
        ].join('\n'),
        sourceId: 'ao-355',
        fields,
      })
      stagedActionIds = staged.actions.map((a) => a.actionId)
      stagedAction = staged.actions[0] ?? null
      assistantMessage = staged.assistantMessage
    }

    const assessmentNotice: ParsedAssessmentNoticeResponseDto = {
      receiptId: dto.receiptId ?? null,
      taxYearOnDocument: read.taxYear,
      assessmentDate: read.assessmentDate,
      read: readIds,
      notRead: ASSESSMENT_POSITION_IDS.filter((id) => read.positions[id] === undefined),
      explanations: explanations?.count ?? 0,
      createsEckjahr,
      stagedActionIds,
    }
    const first: AssessmentPositionId | undefined = readIds[0]
    return {
      mode: 'deterministic_fallback',
      securityBlocked: explanations === null && read.explanations.length > 0,
      parsed: {
        vendorCategory: 'sonstiges',
        receiptDate: read.assessmentDate,
        amountEur: read.positions.erstattung === undefined ? null : Math.abs(read.positions.erstattung),
        suggestedScreen: 'assessment',
        suggestedField: first ?? null,
        suggestedValue: first === undefined ? null : String(read.positions[first]),
        summary,
        taxYear: read.taxYear ?? dto.taxYear,
      },
      stagedAction,
      assistantMessage,
      assessmentNotice,
      draftsTaxYear: stagedActionIds.length > 0 ? filingYear : null,
      noValuesReason: (dto.stageDraft ?? true) && filingYear === null ? 'kein_steuerjahr' : readIds.length === 0 ? 'nichts_erkannt' : null,
    }
  }

  /**
   * The explanations are the Finanzamt's own words and are stored as a quote. Names of the household
   * are taken out first; a text that still carries an identifier is not staged at all.
   */
  private async safeExplanations(userId: string, year: number, paragraphs: readonly string[]): Promise<{ text: string; count: number } | null> {
    if (paragraphs.length === 0) return null
    const knownNames = await this.staging.knownNamesForScrubbing(userId, year)
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
