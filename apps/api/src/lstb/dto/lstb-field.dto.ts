import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

/** One field's honest capture state. */
export class LstbFieldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  @IsIn(['erfasst', 'offen', 'unklar'])
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 50000,
    description: 'The whole-euro amount — present only when kind === "erfasst" (validated in the service via @steuereule/core).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number
}
