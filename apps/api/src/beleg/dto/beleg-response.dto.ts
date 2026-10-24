import { ApiProperty } from '@nestjs/swagger'
import { ZuordnungDto } from './zuordnung.dto.js'

/**
 * Response shape for the Beleg endpoints (ADR-007/008). Carries the persisted FACTS
 * (id, dateiname, dates) plus the DERIVED `zuordnung` state — the state is never stored,
 * it is recomputed from the facts on every read via @steuereule/core (ADR-014/048).
 */
export class BelegResponseDto {
  @ApiProperty({ type: String, example: 'b1' })
  id!: string

  @ApiProperty({ type: String, example: 'miete-januar.pdf', description: 'Original filename (decrypted for the owner).' })
  dateiname!: string

  @ApiProperty({ type: String, nullable: true, example: 'Lohnausweis', description: 'Document type (ADR-029) — null is the generic receipt.' })
  art!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2025-12-20', description: 'Invoice date (ISO yyyy-mm-dd).' })
  belegdatum!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2026-01-15', description: 'Payment date (ISO yyyy-mm-dd).' })
  zahlungsdatum!: string | null

  @ApiProperty({ type: ZuordnungDto, description: '@steuereule/core’s zuordnungAusDaten — never recomputed elsewhere.' })
  zuordnung!: ZuordnungDto
}
