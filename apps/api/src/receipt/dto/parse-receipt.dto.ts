import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { SCREENS, type Screen } from '@steuereule/core'
import { AdvisorActionProposalDto, AdvisorChatMessageDto } from '../../advisor/dto/advisor.dto.js'

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
  @MaxLength(16_000)
  rawText?: string

  @ApiPropertyOptional({
    type: String,
    description: 'Base64-encoded image/PDF content for vision_ocr extraction (max ~5 MB).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7_000_000)
  imageBase64?: string

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
}
