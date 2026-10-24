// `type:` given explicitly on every @ApiProperty() — see PutProfileDto's comment for
// why (esbuild/tsx emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

// The exact date shape @steuereule/core's `jahrAusDatum` parses (`^\d{4}-\d{2}-\d{2}$`) —
// a date-only ISO yyyy-mm-dd, no time component, no other separator. Keeping the DTO and
// the core parser on the same regex means a value that reaches the core can only be one
// the core can actually read the year from (ADR-0033's "one rule, not two copies").
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export class CreateBelegDto {
  @ApiProperty({
    type: String,
    example: 'miete-januar.pdf',
    description: 'Original filename/storage key — field-encrypted at rest (ADR-0008).',
  })
  @IsString()
  @IsNotEmpty()
  dateiname!: string

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
