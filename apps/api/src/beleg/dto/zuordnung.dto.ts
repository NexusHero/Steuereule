import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Mirrors @steuereule/core's `BelegZuordnung` discriminated union, flattened for the
 * wire (same instinct as StepDto — a union with a `kind` discriminator and optional
 * members). Never re-derived here: every value came straight from `zuordnungAusDaten`.
 *
 * kind semantics (ADR-007/008):
 *  - `ungebunden` — no year, no suggestion (no dates).
 *  - `vorgeschlagen` — a date yields a suggestion; `steuerjahr` is the SUGGESTED year.
 *  - `zugeordnet` — confirmed; `steuerjahr` is the CONFIRMED year.
 *  - `konflikt` — the confirmed year and the date-derived suggestion disagree; `steuerjahr`
 *    is the confirmed year, `vorschlagsJahr` the contradicting suggestion. Both visible.
 */
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
