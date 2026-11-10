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
export const DOCUMENT_KINDS = ['auto', 'lstb'] as const
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
    enum: ['auto', 'lstb'],
    example: 'lstb',
    description: 'Explicit document parser cascade: "lstb" uses deterministic two-stage German LStB extraction.',
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
    enum: ['missing', 'unreadable', 'plausibility_conflict', 'partial_sv_lines', 'llm_suggested'],
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
}
