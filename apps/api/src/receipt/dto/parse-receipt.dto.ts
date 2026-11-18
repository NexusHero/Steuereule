import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { RECEIPT_READ_REASONS, SCREENS, type LstbFieldReason, type ReceiptReadReason, type Screen } from '@steuereule/core'
import { AdvisorActionProposalDto, AdvisorChatMessageDto, CalculationTermDto } from '../../advisor/dto/advisor.dto.js'
import { ReceiptDuplicateDto, ReceiptProcessingDto } from './receipt-response.dto.js'

export const RECEIPT_VENDOR_CATEGORIES = [
  'arbeitsmittel',
  'spende',
  'fortbildung',
  'kinderbetreuung',
  'handwerker',
  'krankheitskosten',
  'entfernung',
  'sonstiges',
] as const

export type ReceiptVendorCategory = (typeof RECEIPT_VENDOR_CATEGORIES)[number]

export const ALLOWED_RECEIPT_PARSE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

/** `A`, `B` or `kind:<child id>` — the same pattern as core's `isHolderRef`. */
export const HOLDER_REF_PATTERN = /^(?:A|B|kind:[A-Za-z0-9_-]{1,64})$/

/** Document kinds with a registered parse strategy (`auto` = generic receipt classifier). */
export const DOCUMENT_KINDS = ['auto', 'lstb', 'chLohnausweis', 'chPensionskasse', 'chPraemien', 'chKrankenkasse', 'steuerbescheid'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

/** Why the device could not produce text for a stored Beleg; the server records it as `nicht_lesbar`. */
export const DEVICE_READ_FAILURES = ['read_failed', 'empty_text', 'unsupported_file'] as const
export type DeviceReadFailure = (typeof DEVICE_READ_FAILURES)[number]

/**
 * `POST /v1/belege/parse` — the one ingest use case (ADR-0097 §4). Every entry point (Belege tab, chat, a
 * mask) calls it the same way after `POST /v1/belege/upload`: the device reads the file (PDF text layer or
 * OCR; the image never goes to a model), then sends the text here with the Beleg id and its entry context
 * (`expectedKind`, `mask`, `area`/`person`, `stageDraft`). When the device cannot read it, it still calls
 * this endpoint with `deviceReadFailure`, so the Beleg says „nicht lesbar“ instead of staying „neu“.
 */
export class ParseReceiptDto {
  @ApiProperty({ type: Number, example: 2025 })
  @IsInt()
  @Min(2020)
  @Max(2030)
  taxYear!: number

  @ApiProperty({ type: String, example: 'monitor-rechnung.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string

  @ApiPropertyOptional({
    type: String,
    example: 'Dell UltraSharp Monitor 480 EUR am 2025-05-10',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  rawText?: string

  @ApiPropertyOptional({
    type: String,
    enum: DOCUMENT_KINDS,
    example: 'lstb',
    description: 'Explicit document parser: "lstb" the German LStB, "chLohnausweis" the Swiss salary certificate, "chPensionskasse" a Swiss pension fund statement, "chPraemien" the employer letter on sickness-pay and NBU premiums, "chKrankenkasse" a Swiss health insurer statement for the tax return, "steuerbescheid" the Einkommensteuerbescheid (ADR-0098); "auto" routes a recognised document to its reader.',
  })
  @IsOptional()
  @IsString()
  @IsIn([...DOCUMENT_KINDS])
  kind?: DocumentKind

  @ApiPropertyOptional({
    type: String,
    enum: DOCUMENT_KINDS,
    example: 'chLohnausweis',
    description: 'Entry context: the document the entry point expects (a mask asks for its own). Unlike `kind` it does not force a reader: a text that is clearly another document goes to that one’s reader.',
  })
  @IsOptional()
  @IsString()
  @IsIn([...DOCUMENT_KINDS])
  expectedKind?: DocumentKind

  @ApiPropertyOptional({
    type: String,
    enum: SCREENS,
    example: 'lstb',
    description: 'Entry context: the mask the upload happened in; absent in the chat and the Belege tab. Without `kind`/`expectedKind`, the mask of the LStB or the Swiss Lohnausweis expects its document.',
  })
  @IsOptional()
  @IsString()
  @IsIn([...SCREENS])
  mask?: Screen

  @ApiPropertyOptional({
    type: String,
    enum: DEVICE_READ_FAILURES,
    example: 'empty_text',
    description: 'The device could not read the stored Beleg (`receiptId` required): nothing is parsed, the Beleg is recorded as `nicht_lesbar` with this reason.',
  })
  @IsOptional()
  @IsIn([...DEVICE_READ_FAILURES])
  deviceReadFailure?: DeviceReadFailure

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description: 'Stage drafts even though the Beleg is a duplicate of an older upload (`duplicateOf` on the upload). Without it a duplicate is read but stages nothing.',
  })
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean

  @ApiPropertyOptional({
    type: String,
    example: 'beleg-123',
    description: 'Optional existing Beleg id owned by the caller to link provenance.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptId?: string

  @ApiPropertyOptional({
    type: String,
    enum: ['A', 'B'],
    example: 'A',
    description: 'Taxpayer slot when parsing a partner LStB (ADR-0054).',
  })
  @IsOptional()
  @IsString()
  @IsIn(['A', 'B'])
  person?: 'A' | 'B'

  @ApiPropertyOptional({
    type: String,
    example: 'B',
    description: 'Where the document was uploaded (ADR-0092): `A`, `B` or `kind:<child id>` for a mask of that person. The place decides whose the document is; a name on it that is clearly someone else makes the app ask. Absent in the chat and the Belege tab.',
  })
  @IsOptional()
  @IsString()
  @Matches(HOLDER_REF_PATTERN)
  area?: string

  @ApiPropertyOptional({
    type: String,
    example: 'kind:3f2a',
    description: 'The user’s answer to „Für wen?“ (ADR-0092): `A`, `B` or `kind:<child id>`. Final; nothing is asked again.',
  })
  @IsOptional()
  @IsString()
  @Matches(HOLDER_REF_PATTERN)
  holder?: string

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description: 'Take a multi-person document over for `holder` too („auch für … übernehmen?“): links it to them as well, with their own lines.',
  })
  @IsOptional()
  @IsBoolean()
  alsoFor?: boolean

  @ApiPropertyOptional({
    type: String,
    enum: ['pdf_text', 'ocr'],
    example: 'pdf_text',
    description: 'How rawText was produced on the device: a PDF text layer, or OCR of a photo/scan (never green, ADR-0060).',
  })
  @IsOptional()
  @IsIn(['pdf_text', 'ocr'])
  textSource?: 'pdf_text' | 'ocr'

  @ApiPropertyOptional({
    type: String,
    enum: ALLOWED_RECEIPT_PARSE_MIME_TYPES,
    example: 'application/pdf',
  })
  @IsOptional()
  @IsString()
  @IsIn([...ALLOWED_RECEIPT_PARSE_MIME_TYPES])
  mimeType?: (typeof ALLOWED_RECEIPT_PARSE_MIME_TYPES)[number]

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description: 'Stages an unconfirmed pending draft in Eulen-Modus when true (default true).',
  })
  @IsOptional()
  @IsBoolean()
  stageDraft?: boolean
}

export class ParsedReceiptDataDto {
  @ApiProperty({ type: String, enum: RECEIPT_VENDOR_CATEGORIES, example: 'arbeitsmittel' })
  vendorCategory!: ReceiptVendorCategory

  @ApiProperty({ type: String, nullable: true, example: '2025-05-10' })
  receiptDate!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 480 })
  amountEur!: number | null

  @ApiProperty({ type: String, nullable: true, enum: SCREENS, example: 'interview' })
  suggestedScreen!: Screen | null

  @ApiProperty({ type: String, nullable: true, example: 'fortbildung' })
  suggestedField!: string | null

  @ApiProperty({ type: String, nullable: true, example: 'Ja' })
  suggestedValue!: string | null

  @ApiProperty({ type: String, example: 'Arbeitsmittel-Rechnung über 480 € erkannt.' })
  summary!: string

  @ApiProperty({ type: Number, nullable: true, example: 2025 })
  taxYear!: number | null
}

export class LstbExtractedFieldDto {
  @ApiProperty({ type: Number, nullable: true, example: 54320 })
  value!: number | null

  @ApiProperty({ type: String, enum: ['ok', 'pruefen'], example: 'ok' })
  status!: 'ok' | 'pruefen'

  @ApiProperty({ type: [String], example: ['3'] })
  sourceLines!: string[]

  @ApiProperty({ type: () => [CalculationTermDto], description: 'Summands of `value`; formatted by the client.' })
  calculation!: CalculationTermDto[]

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['missing', 'unreadable', 'plausibility_conflict', 'partial_sv_lines', 'llm_suggested', 'ocr_source'],
    example: null,
  })
  reason!: LstbFieldReason | null
}

export class LstbExtractedFieldsDto {
  @ApiProperty({ type: LstbExtractedFieldDto })
  bruttoarbeitslohn!: LstbExtractedFieldDto

  @ApiProperty({ type: LstbExtractedFieldDto })
  lohnsteuer!: LstbExtractedFieldDto

  @ApiProperty({ type: LstbExtractedFieldDto })
  sozialversicherung!: LstbExtractedFieldDto
}

export class LstbYearConflictDto {
  @ApiProperty({ type: Number, example: 2024 })
  documentYear!: number

  @ApiProperty({ type: Number, example: 2025 })
  activeYear!: number
}

export class LstbExistingValuesDto {
  @ApiProperty({ type: Number, nullable: true, example: 50000 })
  bruttoarbeitslohn!: number | null

  @ApiProperty({ type: Number, nullable: true, example: 9000 })
  lohnsteuer!: number | null

  @ApiProperty({ type: Number, nullable: true, example: 10000 })
  sozialversicherung!: number | null
}

export class LstbExistingConflictDto {
  @ApiProperty({ type: Boolean, example: false })
  hasExisting!: boolean

  @ApiProperty({ type: LstbExistingValuesDto })
  existing!: LstbExistingValuesDto
}

export class ParsedLstbResponseDto {
  @ApiProperty({ type: String, enum: ['deterministic', 'llm_text_fallback'], example: 'deterministic' })
  stage!: 'deterministic' | 'llm_text_fallback'

  @ApiProperty({ type: String, nullable: true, example: 'beleg-123' })
  receiptId!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 2025 })
  taxYearOnDocument!: number | null

  @ApiProperty({ type: LstbYearConflictDto, nullable: true })
  yearConflict!: LstbYearConflictDto | null

  @ApiProperty({ type: LstbExistingConflictDto })
  existingLstbConflict!: LstbExistingConflictDto

  @ApiProperty({ type: LstbExtractedFieldsDto })
  fields!: LstbExtractedFieldsDto

  @ApiProperty({ type: [String], example: ['act-1', 'act-2', 'act-3'] })
  stagedActionIds!: string[]

  @ApiProperty({ type: Boolean, example: false })
  securityBlocked!: boolean

  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true, description: 'Whose LStB it is; null when the name fits neither person.' })
  person!: 'A' | 'B' | null

  @ApiProperty({ type: Boolean, description: 'The name fits neither person: ask whose it is and parse again with `person`.' })
  personUnclear!: boolean

  @ApiProperty({ type: Boolean, description: 'Person B keeps an own account: B uploads it there.' })
  personNotRecordable!: boolean
}

export class ChCertificateFieldDto {
  @ApiProperty({ type: String, example: 'bruttolohn-total' })
  field!: string

  @ApiProperty({ type: String, example: '8' })
  digit!: string

  @ApiProperty({ type: Number, example: 121022, description: 'CHF as printed; negative where the certificate prints one.' })
  value!: number

  @ApiProperty({ type: String, enum: ['ok', 'pruefen'] })
  status!: 'ok' | 'pruefen'

  @ApiProperty({ type: String, nullable: true, enum: ['negative', 'plausibility_conflict', 'llm_suggested', 'ocr_source'] })
  reason!: 'negative' | 'plausibility_conflict' | 'llm_suggested' | 'ocr_source' | null
}

export class ChCertificateChecksDto {
  @ApiProperty({ type: String, enum: ['ok', 'conflict', 'unknown'], description: 'Ziffer 8 = Ziffern 1 to 7.' })
  gross!: 'ok' | 'conflict' | 'unknown'

  @ApiProperty({ type: String, enum: ['ok', 'conflict', 'unknown'], description: 'Ziffer 11 = 8 − 9 − 10.' })
  net!: 'ok' | 'conflict' | 'unknown'
}

export class ParsedChCertificateResponseDto {
  @ApiProperty({ type: String, enum: ['deterministic', 'llm_text_fallback'] })
  stage!: 'deterministic' | 'llm_text_fallback'

  @ApiProperty({ type: String, nullable: true })
  receiptId!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 2025 })
  taxYearOnDocument!: number | null

  @ApiProperty({ type: LstbYearConflictDto, nullable: true })
  yearConflict!: LstbYearConflictDto | null

  @ApiProperty({ type: String, nullable: true, enum: ['A', 'B'], description: 'Whose certificate it is, by the name on it or the choice sent; null when unclear.' })
  person!: 'A' | 'B' | null

  @ApiProperty({ type: Boolean, description: 'The name fits neither person: ask whose it is and parse again with `person`.' })
  personUnclear!: boolean

  @ApiProperty({ type: Boolean, description: 'Person B keeps an own account: B uploads it there.' })
  personNotRecordable!: boolean

  @ApiProperty({ type: [ChCertificateFieldDto] })
  fields!: ChCertificateFieldDto[]

  @ApiProperty({ type: ChCertificateChecksDto })
  checks!: ChCertificateChecksDto

  @ApiProperty({ type: Boolean, description: 'Box G: canteen or lunch cheques.' })
  canteen!: boolean

  @ApiProperty({ type: Boolean, description: 'Box F: free transport between home and work.' })
  freeTransport!: boolean

  @ApiProperty({ type: [String], description: 'Ziffern every certificate carries that could not be read.' })
  missing!: string[]

  @ApiProperty({ type: [String] })
  stagedActionIds!: string[]

  @ApiProperty({ type: Boolean })
  securityBlocked!: boolean
}

export class ChLetterFieldDto {
  @ApiProperty({ type: String, example: 'pkArbeitgeberGesamtChf' })
  field!: string

  @ApiProperty({ type: Number, example: 7362 })
  value!: number

  @ApiProperty({ type: String, enum: ['ok', 'pruefen'] })
  status!: 'ok' | 'pruefen'

  @ApiProperty({ type: String, nullable: true, enum: ['plausibility_conflict', 'ocr_source'] })
  reason!: 'plausibility_conflict' | 'ocr_source' | null
}

export class ParsedChLetterResponseDto {
  @ApiProperty({ type: String, enum: ['chPensionskasse', 'chPraemien'] })
  kind!: 'chPensionskasse' | 'chPraemien'

  @ApiProperty({ type: String, nullable: true })
  receiptId!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 2025 })
  taxYearOnDocument!: number | null

  @ApiProperty({ type: LstbYearConflictDto, nullable: true })
  yearConflict!: LstbYearConflictDto | null

  @ApiProperty({ type: String, nullable: true, enum: ['A', 'B'] })
  person!: 'A' | 'B' | null

  @ApiProperty({ type: Boolean })
  personUnclear!: boolean

  @ApiProperty({ type: Boolean })
  personNotRecordable!: boolean

  @ApiProperty({ type: [ChLetterFieldDto] })
  fields!: ChLetterFieldDto[]

  @ApiProperty({ type: [String], description: 'Fields the letter did not give; the owl asks for them.' })
  missing!: string[]

  @ApiProperty({ type: [String] })
  stagedActionIds!: string[]
}

/** What the Bescheid reader found (ADR-0098 §4): the year and date it read, and which positions it could not. */
export class ParsedAssessmentNoticeResponseDto {
  @ApiProperty({ type: String, nullable: true })
  receiptId!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 2024, description: 'The year the Bescheid is for; its drafts go there (ADR-0097 §5).' })
  taxYearOnDocument!: number | null

  @ApiProperty({ type: String, nullable: true, example: '2026-11-02', description: 'The Bescheiddatum read (ISO), the Einspruchsfrist runs from it.' })
  assessmentDate!: string | null

  @ApiProperty({ type: [String], example: ['festgesetzteSteuer', 'erstattung'], description: 'Positions read and staged as drafts.' })
  read!: string[]

  @ApiProperty({ type: [String], example: ['sonderausgaben'], description: 'Positions the Bescheid did not give: they stay „nicht gelesen“, never 0.' })
  notRead!: string[]

  @ApiProperty({ type: Number, description: 'Explanations (Erläuterungen) read and staged as one draft.' })
  explanations!: number

  @ApiProperty({ type: Boolean, description: 'The year has no declaration in the app: taking the drafts over creates it as an Eckjahr (`extern-erledigt`).' })
  createsEckjahr!: boolean

  @ApiProperty({ type: [String] })
  stagedActionIds!: string[]
}

export class AssignmentPersonDto {
  @ApiProperty({ type: String, example: 'B', description: '`A`, `B` or `kind:<child id>`.' })
  holder!: string

  @ApiProperty({ type: String, nullable: true, example: 'Nora', description: 'The first name on record, for the button; null while none is entered.' })
  name!: string | null
}

export class AssignmentQuestionDto {
  @ApiProperty({ type: String, enum: ['which', 'contradiction', 'unknown', 'confirmSelf'], example: 'which', description: '`which`: „Für wen?“ in a household of several; `contradiction`: the name on it is someone else than the person of the upload area; `unknown`: it names nobody of the household; `confirmSelf`: A has no name yet — „Bist du …?“.' })
  reason!: 'which' | 'contradiction' | 'unknown' | 'confirmSelf'

  @ApiProperty({ type: [AssignmentPersonDto] })
  options!: AssignmentPersonDto[]

  @ApiProperty({ type: String, nullable: true, example: 'B', description: 'The person the document names, preselected.' })
  preselected!: string | null

  @ApiProperty({ type: String, nullable: true, example: 'Nora Sommer', description: 'The name printed on the document, for the question; never stored.' })
  printedName!: string | null

  @ApiProperty({ type: AssignmentPersonDto, nullable: true, description: 'The person of the upload area („du bist bei …“).' })
  area!: AssignmentPersonDto | null

  @ApiProperty({ type: [String], enum: ['B', 'kind'], example: ['B'], description: 'Who can be created from the document: „als Person B anlegen?“, „als Kind anlegen?“.' })
  offerCreate!: ('B' | 'kind')[]
}

/** Whose the document is (ADR-0092), or the question the app asks before it reads it for anyone. */
export class DocumentAssignmentDto {
  @ApiProperty({ type: AssignmentPersonDto, nullable: true, description: 'The person it was read for; null while the question is open.' })
  holder!: AssignmentPersonDto | null

  @ApiProperty({ type: AssignmentQuestionDto, nullable: true })
  question!: AssignmentQuestionDto | null

  @ApiProperty({ type: [AssignmentPersonDto], description: 'Others of the household a multi-person document names: „auch für … übernehmen?“.' })
  alsoFor!: AssignmentPersonDto[]
}

/**
 * The same shapes as on `GET /v1/belege`, under their own names: the parse endpoint is generated into the
 * owl's client and the inbox into the Belege client, and one schema name in both would clash there.
 */
export class ParsedReceiptProcessingDto extends ReceiptProcessingDto {}
export class ParsedReceiptDuplicateDto extends ReceiptDuplicateDto {}

export class ParseReceiptResponseDto {
  @ApiProperty({ type: String, enum: ['vision_ocr', 'deterministic_fallback'], example: 'vision_ocr' })
  mode!: 'vision_ocr' | 'deterministic_fallback'

  @ApiProperty({ type: Boolean, example: false })
  securityBlocked!: boolean

  @ApiProperty({ type: ParsedReceiptDataDto })
  parsed!: ParsedReceiptDataDto

  @ApiPropertyOptional({ type: AdvisorActionProposalDto, nullable: true })
  stagedAction!: AdvisorActionProposalDto | null

  @ApiPropertyOptional({ type: AdvisorChatMessageDto, nullable: true })
  assistantMessage!: AdvisorChatMessageDto | null

  @ApiPropertyOptional({ type: ParsedLstbResponseDto, nullable: true })
  lstb?: ParsedLstbResponseDto | null

  @ApiPropertyOptional({ type: ParsedChCertificateResponseDto, nullable: true })
  chLohnausweis?: ParsedChCertificateResponseDto | null

  @ApiPropertyOptional({ type: ParsedChLetterResponseDto, nullable: true })
  chLetter?: ParsedChLetterResponseDto | null

  @ApiPropertyOptional({ type: ParsedAssessmentNoticeResponseDto, nullable: true })
  assessmentNotice?: ParsedAssessmentNoticeResponseDto | null

  @ApiPropertyOptional({ type: DocumentAssignmentDto, nullable: true, description: 'Whose the document is (ADR-0092); absent for a receipt of the joint return.' })
  assignment?: DocumentAssignmentDto | null

  @ApiPropertyOptional({ type: Number, nullable: true, example: 2024, description: 'The tax year this read staged its drafts in; null when it staged none.' })
  draftsTaxYear?: number | null

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 2024,
    description: 'Set when the drafts went to another tax year than the requested `taxYear` (ADR-0097 §5: the document’s own year, for every reader): say „liegt im Steuerjahr 2024“ with a link to switch. Null otherwise.',
  })
  filedInTaxYear?: number | null

  @ApiPropertyOptional({ type: String, enum: RECEIPT_READ_REASONS, nullable: true, example: 'keine_rechnung', description: 'Why nothing was proposed, when a reader knows (e.g. `keine_rechnung`, `nicht_absetzbar`, `schon_gezaehlt`).' })
  noValuesReason?: ReceiptReadReason | null

  @ApiPropertyOptional({ type: ParsedReceiptDuplicateDto, nullable: true, description: 'The Beleg is a duplicate of this older upload: no drafts were staged unless `allowDuplicate` was sent.' })
  duplicateOf?: ReceiptDuplicateDto | null

  @ApiPropertyOptional({ type: ParsedReceiptProcessingDto, nullable: true, description: 'The Beleg’s processing state after this read (the same as `GET /v1/belege` shows); null without `receiptId`.' })
  processing?: ReceiptProcessingDto | null
}
