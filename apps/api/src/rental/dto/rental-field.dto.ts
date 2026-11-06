import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

/** One Vermietung field's honest capture state. */
export class RentalFieldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 12000,
    description: 'The value — present only when kind === "erfasst" (validated via @steuereule/core).',
  })
  value?: number
}

/** The PUT body for one Vermietung field. */
export class PutRentalFieldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  @IsIn(['erfasst', 'offen', 'unklar'])
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 12000,
    description: 'The value — present only when kind === "erfasst" (validated via @steuereule/core).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number
}
