// `type:` given explicitly on every @ApiProperty() — see PutProfileDto's comment for why
// (esbuild/tsx emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

/**
 * One Kapital field's honest capture state (product ADR-032, ADR-036 Scan-Fallback) — the wire
 * shape of @steuereule/core's `KapitalFeldZustand`. `erfasst` carries a non-negative integer
 * (whole euros); `offen` is "not reached yet"; `unklar` is "I looked and could not read it"
 * (never a silent guess).
 */
export class KapitalFeldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 2500,
    description: 'The value — present only when kind === "erfasst" (validated via @steuereule/core).',
  })
  wert?: number
}

/** The PUT body for the Kapitalerträge field. */
export class PutKapitalFeldDto {
  @ApiProperty({ enum: ['erfasst', 'offen', 'unklar'], description: 'The field’s capture state.' })
  @IsIn(['erfasst', 'offen', 'unklar'])
  kind!: 'erfasst' | 'offen' | 'unklar'

  @ApiPropertyOptional({
    type: Number,
    example: 2500,
    description: 'The value — present only when kind === "erfasst" (validated via @steuereule/core).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  wert?: number
}
