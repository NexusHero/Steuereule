import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'
import { RECEIPT_TYPES, type ReceiptType } from '@steuereule/core'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `type:` given explicitly on every. */
export class CreateReceiptDto {
  @ApiProperty({
    type: String,
    example: 'miete-januar.pdf',
    description: 'Original filename/storage key — field-encrypted at rest (ADR-0008).',
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string

  @ApiPropertyOptional({
    type: String,
    enum: RECEIPT_TYPES,
    example: 'Lohnausweis',
    description: 'Document type (ADR-029). Omitted = null (not classified); pass \'Sonstiges\' to classify a generic receipt explicitly.',
  })
  @IsOptional()
  @IsString()
  @IsIn([...RECEIPT_TYPES])
  kind?: ReceiptType

  @ApiPropertyOptional({
    type: String,
    example: '2025-12-20',
    description: 'Invoice date (Rechnungsdatum), ISO yyyy-mm-dd. Optional.',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  belegdatum?: string

  @ApiPropertyOptional({
    type: String,
    example: '2026-01-15',
    description: 'Payment date (Zahlungsdatum), ISO yyyy-mm-dd — § 11 Zufluss fixes the year. Optional.',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  zahlungsdatum?: string
}
