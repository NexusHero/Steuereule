import { ApiProperty } from '@nestjs/swagger'
import { AssignmentDto } from './assignment.dto.js'

/** Response shape for the Beleg endpoints. */
export class ReceiptResponseDto {
  @ApiProperty({ type: String, example: 'b1' })
  id!: string

  @ApiProperty({ type: String, example: 'miete-januar.pdf', description: 'Original filename (decrypted for the owner).' })
  fileName!: string

  @ApiProperty({ type: String, nullable: true, example: 'Lohnausweis', description: 'Document type (ADR-029) — null is the generic receipt.' })
  kind!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2025-12-20', description: 'Invoice date (ISO yyyy-mm-dd).' })
  belegdatum!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2026-01-15', description: 'Payment date (ISO yyyy-mm-dd).' })
  zahlungsdatum!: string | null

  @ApiProperty({ type: AssignmentDto, description: '@steuereule/core’s zuordnungAusDaten — never recomputed elsewhere.' })
  assignment!: AssignmentDto
}
