import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { SCREENS, type LstbFieldReason, type Screen } from '@steuereule/core'
import { AdvisorActionProposalDto, AdvisorChatMessageDto, CalculationTermDto } from '../../advisor/dto/advisor.dto.js'

export const RECEIPT_VENDOR_CATEGORIES = [
  'arbeitsmittel',
  'spende',
  'fortbildung',
  'kinderbetreuung',
  'handwerker',
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

/** Document kinds with a registered parse strategy (`auto` = generic receipt classifier). */
export const DOCUMENT_KINDS = ['auto', 'lstb', 'chLohnausweis', 'chPensionskasse', 'chPraemien'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

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
    description: 'Explicit document parser: "lstb" the German LStB, "chLohnausweis" the Swiss salary certificate, "chPensionskasse" a Swiss pension fund statement, "chPraemien" the employer letter on sickness-pay and NBU premiums; "auto" routes a recognised document to its reader.',
  })
  @IsOptional()
  @IsString()
  @IsIn([...DOCUMENT_KINDS])
  kind?: DocumentKind

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
}
