import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

/**
 * One field's honest capture state (ADR-036) — the wire shape of @steuereule/core's
 * `LstbFeldZustand`. `erfasst` carries a whole-euro `wert`; `offen` is "not reached yet";
 * `unklar` is "I looked and could not read it" (the honest fallback, never a silent guess).
 * Used as both the PUT body and each field of the GET response.
 */
export class LstbFeldDto {
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
  wert?: number
}
