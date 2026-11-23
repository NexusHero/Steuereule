import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common'
import { holderWithoutPartner } from './document-holder.js'
import {
  certificateHolderPerson,
  parseChPensionStatement,
  parseChPremiumLetter,
  formatChf,
  receiptFilingYear,
  type ChInsuranceLetterKind,
} from '@steuereule/core'
import { AdvisorService } from '../advisor/advisor.service.js'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { LinkService } from '../link/link.service.js'
import type { ChLetterFieldDto, ParseReceiptDto, ParseReceiptResponseDto, ParsedChLetterResponseDto } from '../receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry, type DocumentParseStrategy } from '../receipt/parse/document-parse.registry.js'
import {
  DETERMINISTIC_ENGINE,
  NOTHING_STAGED,
  SCAN_CHECK_NOTE,
  isFromOcr,
  noTaxYearReason,
  stagedDraftsOf,
  yearConflictOf,
  type StagedDrafts,
} from '../receipt/parse/document-parse-steps.js'

const LABELS: Readonly<Record<string, string>> = {
  pkArbeitnehmerChf: 'Pensionskasse Arbeitnehmer, obligatorisch (N-Gre Zeile 84)',
  pkArbeitgeberChf: 'Pensionskasse Arbeitgeber, obligatorisch (N-Gre Zeile 87)',
  pkArbeitgeberGesamtChf: 'Pensionskasse Arbeitgeber gesamt (daraus Zeile 20)',
  krankentaggeldArbeitgeberChf: 'Krankentaggeld-Prämie des Arbeitgebers (N-Gre Zeile 18)',
  krankentaggeldArbeitgeberProzent: 'Arbeitgeber zahlt die Krankentaggeld-Prämie zu (%)',
  nbuvArbeitgeberChf: 'NBU-Prämie des Arbeitgebers (N-Gre Zeile 19)',
  nbuvArbeitgeberProzent: 'Arbeitgeber zahlt die NBU-Prämie zu (%)',
}

/** What the mask already holds for this person, as far as a letter needs it. */
interface StoredFacts {
  readonly krankentaggeldChf: string | null
}

interface LetterRead {
  readonly taxYear: number | null
  readonly fields: ChLetterFieldDto[]
  readonly missing: string[]
  readonly notes: string[]
}

/**
 * The Swiss letters beside the Lohnausweis (ADR-0075): the pension fund's statement and the
 * employer's premium letter. A fixed rule reads them; no model is involved, because the letters
 * differ by sender and a gap is better asked than guessed. Whose letter it is comes from the name on
 * it; the figures become drafts for that person's Lohnausweis mask (N-Gre part).
 */
abstract class ChLetterParseStrategy implements DocumentParseStrategy, OnModuleInit {
  abstract readonly kind: ChInsuranceLetterKind

  constructor(
    protected readonly registry: DocumentParseRegistry,
    protected readonly advisorService: AdvisorService,
    protected readonly auditService: AuditService,
    protected readonly linkService: LinkService,
    protected readonly chRepo?: CrossBorderSalaryStatementRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  protected abstract read(rawText: string, ziffer10: number | null, fromOcr: boolean, stored?: StoredFacts): LetterRead

  async parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    const rawText = dto.rawText ?? ''
    const fromOcr = isFromOcr(dto)
    // One year rule (ADR-0097 §5): the letter's year decides the household, the record and where its drafts go.
    // The year printed is only known after reading, so the letter is read first without the stored Ziffer 10.
    const filingYear = receiptFilingYear(this.read(rawText, null, fromOcr).taxYear, dto.taxYear)
    const holder = await this.resolveHolder(userId, dto, rawText, filingYear ?? dto.taxYear)
    const letter = this.read(rawText, holder.ziffer10, fromOcr, holder.stored)
    checkPiiFree({ fields: letter.fields, missing: letter.missing })
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg_analyse' })

    // Another year no longer blocks (`yearConflict` only reports it); a year the app does not keep stages nothing.
    const { person, dataUser } = holder
    const staged =
      (dto.stageDraft ?? true) && person !== null && dataUser !== null && filingYear !== null && letter.fields.length > 0
        ? await this.stageDrafts(userId, dto, filingYear, { person, dataUser, letter, fromOcr })
        : NOTHING_STAGED

    const chLetter: ParsedChLetterResponseDto = {
      kind: this.kind,
      receiptId: dto.receiptId ?? null,
      taxYearOnDocument: letter.taxYear,
      yearConflict: yearConflictOf(letter.taxYear, dto.taxYear),
      person,
      personUnclear: person === null,
      personNotRecordable: holder.personNotRecordable,
      fields: letter.fields,
      missing: letter.missing,
      stagedActionIds: staged.stagedActionIds,
    }
    return {
      mode: 'deterministic_fallback',
      securityBlocked: false,
      parsed: letterSummary(this.kind, letter, dto.taxYear),
      stagedAction: staged.stagedAction,
      assistantMessage: staged.assistantMessage,
      chLetter,
      draftsTaxYear: staged.stagedActionIds.length > 0 ? filingYear : null,
      noValuesReason: noTaxYearReason(dto, filingYear),
    }
  }

  /**
   * Whose letter it is, and what that person's mask already holds. The name is looked for in the whole
   * letter, on the server only; only one person's name may fit.
   */
  private async resolveHolder(userId: string, dto: ParseReceiptDto, rawText: string, year: number): Promise<LetterHolder> {
    const household = await this.advisorService.householdNames(userId, year)
    const person: 'A' | 'B' | null = dto.person ?? (household.B === null ? holderWithoutPartner(rawText, household.A) : certificateHolderPerson(rawText, household))
    const personNotRecordable = person === 'B' && household.B?.recordable !== true
    const dataUser = person !== null && !personNotRecordable ? await this.linkService.dataUser(userId, year, person) : null
    const stored = dataUser ? await this.chRepo?.findForUserAndYear(dataUser, year) : null
    const ziffer10 = stored?.fields['berufliche-vorsorge'] ? Number(stored.fields['berufliche-vorsorge']) : null
    return {
      person,
      personNotRecordable,
      dataUser,
      ziffer10: Number.isFinite(ziffer10) ? ziffer10 : null,
      stored: { krankentaggeldChf: stored?.nGre.krankentaggeldChf ?? null },
    }
  }

  /** The figures as drafts for that person's Lohnausweis mask (N-Gre part). */
  private async stageDrafts(userId: string, dto: ParseReceiptDto, filingYear: number, input: { person: 'A' | 'B'; dataUser: string; letter: LetterRead; fromOcr: boolean }): Promise<StagedDrafts> {
    const { person, letter } = input
    const whose = person === 'B' ? 'von Person B' : 'von dir'
    const title = this.kind === 'chPensionskasse' ? 'den Nachweis der Pensionskasse' : 'die Bestätigung des Arbeitgebers zu Krankentaggeld und NBU'
    const staged = await this.advisorService.stageDocumentDrafts(userId, filingYear, {
      screen: 'chLohnausweis',
      person,
      digestUserId: input.dataUser,
      receiptId: dto.receiptId ?? null,
      engine: DETERMINISTIC_ENGINE,
      summaryText: [`Ich habe ${title} ${whose} für ${letter.taxYear ?? dto.taxYear} gelesen.`, ...(input.fromOcr ? [SCAN_CHECK_NOTE] : []), ...letter.notes].join('\n'),
      sourceId: 'estg-9-1',
      fields: letter.fields.map((f) => ({ field: f.field, label: LABELS[f.field] ?? f.field, value: f.value, status: f.status, reason: f.reason })),
    })
    return stagedDraftsOf(staged)
  }
}

interface LetterHolder {
  readonly person: 'A' | 'B' | null
  readonly personNotRecordable: boolean
  /** The record the drafts go to; null when the person is unclear or not recordable. */
  readonly dataUser: string | null
  /** Ziffer 10 of that person's Lohnausweis, when recorded. */
  readonly ziffer10: number | null
  readonly stored: StoredFacts
}

/** The receipt-level summary every reader returns, pointing at the letter's first figure. */
function letterSummary(kind: ChInsuranceLetterKind, letter: LetterRead, activeYear: number): ParseReceiptResponseDto['parsed'] {
  return {
    vendorCategory: 'sonstiges',
    receiptDate: null,
    amountEur: null,
    suggestedScreen: 'chLohnausweis',
    suggestedField: letter.fields[0]?.field ?? null,
    suggestedValue: letter.fields[0] ? String(letter.fields[0].value) : null,
    summary: kind === 'chPensionskasse' ? 'Nachweis der Pensionskasse gelesen.' : 'Prämienbestätigung gelesen.',
    taxYear: letter.taxYear ?? activeYear,
  }
}

const field = (name: string, value: number, fromOcr: boolean, conflict = false): ChLetterFieldDto => ({
  field: name,
  value: Math.round(value),
  status: conflict || fromOcr ? 'pruefen' : 'ok',
  reason: conflict ? 'plausibility_conflict' : fromOcr ? 'ocr_source' : null,
})

@Injectable()
export class ChPensionStatementParseStrategy extends ChLetterParseStrategy {
  readonly kind = 'chPensionskasse' as const

  constructor(
    @Inject(DocumentParseRegistry) registry: DocumentParseRegistry,
    @Inject(AdvisorService) advisorService: AdvisorService,
    @Inject(AuditService) auditService: AuditService,
    @Inject(LinkService) linkService: LinkService,
    @Optional() @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) chRepo?: CrossBorderSalaryStatementRepository,
  ) {
    super(registry, advisorService, auditService, linkService, chRepo)
  }

  protected read(rawText: string, ziffer10: number | null, fromOcr: boolean): LetterRead {
    const statement = parseChPensionStatement(rawText)
    const { employee, employer } = statement
    const splitConflict = statement.checks.split === 'conflict'
    // The employee total is Ziffer 10 of the Lohnausweis: the strongest check there is.
    const ziffer10Conflict = employee.total !== null && ziffer10 !== null && Math.abs(employee.total - ziffer10) > 1
    const fields: ChLetterFieldDto[] = []
    if (employee.mandatory !== null) fields.push(field('pkArbeitnehmerChf', employee.mandatory, fromOcr, splitConflict))
    if (employer.mandatory !== null) fields.push(field('pkArbeitgeberChf', employer.mandatory, fromOcr, splitConflict))
    // A yearly certificate states a figure at its key date, not what was paid: never offered as read.
    const certificate = statement.source === 'certificate'
    if (employer.total !== null) {
      const total = field('pkArbeitgeberGesamtChf', employer.total, fromOcr, splitConflict || ziffer10Conflict)
      fields.push(certificate ? { ...total, status: 'pruefen' } : total)
    }
    const missing = [
      ...(employee.mandatory === null ? ['pkArbeitnehmerChf'] : []),
      ...(employer.mandatory === null ? ['pkArbeitgeberChf'] : []),
      ...(employer.total === null ? ['pkArbeitgeberGesamtChf'] : []),
    ]
    const notes = [
      ...(statement.checks.split === 'ok' ? ['Obligatorisch und überobligatorisch ergeben auf beiden Seiten die Summe.'] : []),
      ...(splitConflict ? ['Obligatorisch und überobligatorisch ergeben nicht die Summe; bitte mit dem Nachweis vergleichen.'] : []),
      ...(employee.total !== null && ziffer10 !== null && !ziffer10Conflict ? [`Die Arbeitnehmerbeiträge gesamt (${formatChf(employee.total)}) passen zu Ziffer 10 des Lohnausweises.`] : []),
      ...(ziffer10Conflict ? [`Die Beiträge des Arbeitnehmers (${formatChf(employee.total ?? 0)}) weichen von Ziffer 10 des Lohnausweises (${formatChf(ziffer10 ?? 0)}) ab. Gehört der Nachweis zum richtigen Jahr?`] : []),
      ...(employer.total === null ? ['Die Arbeitgeberbeiträge gesamt konnte ich nicht lesen (im Scan fehlt eine Zeile). Ohne sie rechnet die App keine Zeile 20; trag sie bitte aus dem Nachweis ein.'] : []),
      ...(certificate
        ? ['Das ist ein Vorsorgeausweis: Er nennt die Beiträge als Jahreswert zum Stichtag und nicht den obligatorischen Anteil (Zeilen 84 und 87). Den „Nachweis obligatorischer und überobligatorischer Beiträge“ stellt die Pensionskasse auf Anfrage aus.']
        : []),
    ]
    return { taxYear: statement.taxYear, fields, missing, notes }
  }
}

@Injectable()
export class ChPremiumLetterParseStrategy extends ChLetterParseStrategy {
  readonly kind = 'chPraemien' as const

  constructor(
    @Inject(DocumentParseRegistry) registry: DocumentParseRegistry,
    @Inject(AdvisorService) advisorService: AdvisorService,
    @Inject(AuditService) auditService: AuditService,
    @Inject(LinkService) linkService: LinkService,
    @Optional() @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) chRepo?: CrossBorderSalaryStatementRepository,
  ) {
    super(registry, advisorService, auditService, linkService, chRepo)
  }

  protected read(rawText: string, _ziffer10: number | null, fromOcr: boolean, stored?: StoredFacts): LetterRead {
    const letter = parseChPremiumLetter(rawText)
    // The employee's own sickness-pay premium is 0 in the mask: the employer pays it all.
    const ownSicknessPremiumZero = stored?.krankentaggeldChf === '0'
    const fields: ChLetterFieldDto[] = []
    if (letter.sicknessPayChf !== null) fields.push(field('krankentaggeldArbeitgeberChf', letter.sicknessPayChf, fromOcr))
    if (letter.accidentChf !== null) fields.push(field('nbuvArbeitgeberChf', letter.accidentChf, fromOcr))
    if ((letter.employerPaysFull || ownSicknessPremiumZero) && letter.sicknessPayChf !== null) fields.push(field('krankentaggeldArbeitgeberProzent', 100, fromOcr))
    if (letter.employerPaysFull && letter.accidentChf !== null) fields.push(field('nbuvArbeitgeberProzent', 100, fromOcr))
    const missing = [...(letter.sicknessPayChf === null ? ['krankentaggeldArbeitgeberChf'] : []), ...(letter.accidentChf === null ? ['nbuvArbeitgeberChf'] : [])]
    const notes = letter.employerPaysFull
      ? ['Laut Bestätigung zahlt der Arbeitgeber die vollen Prämien; einen Arbeitnehmeranteil gibt es dann nicht.']
      : [
          ...(ownSicknessPremiumZero ? ['Beim Krankentaggeld zahlst du laut deinen Angaben nichts selbst; also trägt der Arbeitgeber 100 %.'] : []),
          `Die Bestätigung nennt, was der Arbeitgeber gezahlt hat, aber nicht, ob das die ganze Prämie ist. Zahlt dein Arbeitgeber ${ownSicknessPremiumZero ? 'die NBU-Prämie' : 'sie'} ganz? Dann trag dort 100 % ein; sonst den Anteil laut Lohnabrechnung.`,
        ]
    return { taxYear: letter.taxYear, fields, missing, notes }
  }
}
