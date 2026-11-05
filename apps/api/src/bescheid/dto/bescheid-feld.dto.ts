import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional } from 'class-validator'

/** One Bescheid figure's honest capture state. */
export class BescheidFeldDto {
  @ApiProperty({ type: String, description: 'The machine field id (BescheidFeld).' })
  id!: string

  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 50000,
    description: 'The whole-euro amount — present only when kind === "erfasst" (erstattung may be negative).',
  })
  wert?: number
}

/** The PUT body for one figure. */
export class PutBescheidFeldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  @IsIn(['erfasst', 'offen', 'unklar'])
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 50000,
    description: 'The whole-euro amount — present only when kind === "erfasst". Sign/validity per field is validated via @steuereule/core (erstattung may be negative).',
  })
  @IsOptional()
  @IsInt()
  wert?: number
}

export type AssessmentFieldDto = BescheidFeldDto
export type PutAssessmentFieldDto = PutBescheidFeldDto

