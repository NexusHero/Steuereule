import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ZuordnungDto {
  @ApiProperty({ type: String, enum: ['ungebunden', 'vorgeschlagen', 'zugeordnet', 'konflikt'] })
  kind!: 'ungebunden' | 'vorgeschlagen' | 'zugeordnet' | 'konflikt'

  @ApiPropertyOptional({
    type: Number,
    example: 2026,
    description: 'vorgeschlagen: the suggested year; zugeordnet/konflikt: the confirmed year.',
  })
  steuerjahr?: number

  @ApiPropertyOptional({
    type: Number,
    example: 2025,
    description: 'konflikt only: the contradicting date-derived suggestion.',
  })
  vorschlagsJahr?: number

  @ApiPropertyOptional({
    type: String,
    enum: ['zahlungsdatum', 'belegdatum'],
    description: 'vorgeschlagen/konflikt: which date the rule used ("Regel: Zahlungsdatum" chip).',
  })
  herkunft?: 'zahlungsdatum' | 'belegdatum'
}

export type AssignmentDto = ZuordnungDto

