import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional } from 'class-validator'

/** One Lohnausweis CHF field's honest capture state. */
export class SalaryCertificateFieldDto {
  @ApiProperty({ type: String, description: 'The machine field id (LohnausweisFeldId).' })
  id!: string

  @ApiProperty({ type: String, description: 'The box number on the paper (1–15).' })
  digit!: string

  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 84000,
    description: 'The whole-CHF amount — present only when kind === "erfasst".',
  })
  value?: number
}

/** The PUT body for one CHF field. */
export class PutSalaryCertificateFieldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  @IsIn(['erfasst', 'offen', 'unklar'])
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 84000,
    description: 'The whole-CHF amount — present only when kind === "erfasst". Zero or more; only Ziffer 7 (`andere-leistungen`) may be negative (checked per field via @steuereule/core, ADR-0093).',
  })
  @IsOptional()
  @IsInt()
  value?: number
}
