// `type:` given explicitly on every @ApiProperty() — see PutProfileDto's comment for why
// (esbuild/tsx emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Mirrors @steuereule/core's `LstbWiderspruch` union — a structural contradiction between
 * two `erfasst` figures (ADR-008: named, never silently fixed). The two variants carry
 * different numbers, so every field is optional except `art`; which one is present is fixed
 * by `art` (same "flat discriminated union on the wire" shape as StepDto).
 */
export class LstbWiderspruchDto {
  @ApiProperty({
    type: String,
    enum: ['lohnsteuer-uebersteigt-brutto', 'sozialversicherung-uebersteigt-brutto'],
    example: 'lohnsteuer-uebersteigt-brutto',
  })
  art!: 'lohnsteuer-uebersteigt-brutto' | 'sozialversicherung-uebersteigt-brutto'

  @ApiPropertyOptional({ type: Number, description: 'The einbehaltene Lohnsteuer (only when art is lohnsteuer-uebersteigt-brutto).' })
  lohnsteuer?: number

  @ApiPropertyOptional({ type: Number, description: 'The Bruttoarbeitslohn (both arts).' })
  bruttoarbeitslohn?: number

  @ApiPropertyOptional({ type: Number, description: 'The SV-Arbeitnehmeranteil (only when art is sozialversicherung-uebersteigt-brutto).' })
  sozialversicherung?: number
}
