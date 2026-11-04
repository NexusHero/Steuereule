import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

/** One Lohnausweis CHF field's honest capture state. */
export class LohnausweisFeldDto {
  @ApiProperty({ type: String, description: 'The machine field id (LohnausweisFeldId).' })
  id!: string

  @ApiProperty({ type: String, description: 'The box number on the paper (1–15).' })
  ziffer!: string

  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 84000,
    description: 'The whole-CHF amount — present only when kind === "erfasst".',
  })
  wert?: number
}

/** The PUT body for one CHF field. */
export class PutLohnausweisFeldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  @IsIn(['erfasst', 'offen', 'unklar'])
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 84000,
    description: 'The whole-CHF amount — present only when kind === "erfasst" (validated via @steuereule/core).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  wert?: number
}
