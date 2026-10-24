// `type:` given explicitly on every @ApiProperty() — see PutProfileDto's comment for why.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional } from 'class-validator'

/**
 * One Bescheid figure's honest capture state (ADR-036) — the wire shape of @steuereule/core's
 * BescheidFeld state. `erfasst` carries a whole-euro `wert`; `offen` is "not reached yet";
 * `unklar` is "I looked and could not read it" (never a silent guess). `id` is carried on the
 * read (re-entry) side so the mask renders in paper order.
 */
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

/** The PUT body for one figure (no id — that comes from the path + the field registry). */
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
