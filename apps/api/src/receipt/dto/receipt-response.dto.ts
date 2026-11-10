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

  @ApiProperty({ type: Boolean, example: true, description: 'Whether an encrypted original document binary is attached.' })
  hasFile!: boolean

  @ApiProperty({ type: String, nullable: true, example: 'application/pdf', description: 'Sniffed MIME type when a binary file is attached.' })
  mimeType!: string | null

  @ApiProperty({ type: Number, nullable: true, example: 142850, description: 'Original file size in bytes when attached.' })
  byteLength!: number | null

  @ApiProperty({ type: AssignmentDto, description: '@steuereule/core’s zuordnungAusDaten — never recomputed elsewhere.' })
  assignment!: AssignmentDto
}

export class DeleteReceiptResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  deleted!: boolean
}
