// Export DTOs for GET /v1/account/export (ADR-0013 §4, REQ-011).
// The JSON representation ships the full DSGVO Art. 15/20 export document;
// the PDF-Bericht renders the same data in human-readable German.
// Secrets (password hash, session/verification tokens, other users' data)
// are never included — this is a structural invariant, not just a filter step.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ExportAccountDto {
  @ApiProperty({ type: String, example: 'anna@example.com' })
  email!: string

  @ApiProperty({ type: String, example: 'Anna Beispiel' })
  name!: string

  @ApiProperty({ type: Boolean, example: true })
  emailVerified!: boolean

  @ApiProperty({ type: String, example: '2026-07-23T12:00:00.000Z' })
  createdAt!: string

  @ApiProperty({ type: [String], example: ['credential'] })
  authProviders!: string[]
}

export class ExportProfileDto {
  @ApiProperty({ type: String, example: 'Anna' })
  firstName!: string

  @ApiProperty({ type: String, example: 'Beispiel' })
  lastName!: string

  @ApiProperty({ type: String, example: '02476291358' })
  steuerId!: string

  @ApiPropertyOptional({ type: String, nullable: true, example: '18181508155' })
  steuernummer!: string | null

  @ApiProperty({ type: String, example: '2026-07-23T12:00:00.000Z' })
  createdAt!: string

  @ApiProperty({ type: String, example: '2026-07-23T12:00:00.000Z' })
  updatedAt!: string
}

export class ExportAccessLogEntryDto {
  @ApiProperty({ type: String, example: 'READ', enum: ['READ', 'WRITE'] })
  action!: string

  @ApiProperty({ type: String, example: 'profile' })
  resource!: string

  @ApiProperty({ type: String, example: '2026-07-23T12:00:00.000Z' })
  createdAt!: string
}

/**
 * The one JSON response shape for `GET /v1/account/export?format=json`.
 * Matches the ADR-0013 §4 frozen contract exactly:
 * - schemaVersion: "1.0"
 * - account: better-auth identity (no secrets)
 * - profile: decrypted profile or null
 * - taxData: honest empty array (no tax-year model yet)
 * - accessLog: the subject's own audit rows
 */
export class ExportJsonResponseDto {
  @ApiProperty({ type: String, example: '1.0' })
  schemaVersion!: string

  @ApiProperty({ type: String, example: '2026-07-24T10:00:00.000Z' })
  exportedAt!: string

  @ApiProperty({ type: ExportAccountDto })
  account!: ExportAccountDto

  @ApiProperty({ type: ExportProfileDto, nullable: true })
  profile!: ExportProfileDto | null

  @ApiProperty({ type: Array, example: [] })
  taxData!: unknown[]

  @ApiProperty({ type: [ExportAccessLogEntryDto] })
  accessLog!: ExportAccessLogEntryDto[]
}
