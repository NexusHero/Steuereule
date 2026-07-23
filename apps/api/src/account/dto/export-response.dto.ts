// `type: String`/`type: Boolean`/`type: [X]` is given explicitly on every @ApiProperty()
// below — see the comment in profile/dto/put-profile.dto.ts for why we don't rely on
// inferred design:type metadata (esbuild/tsx emit none). Documents the ADR-0013 frozen
// JSON export shape exactly — this is what orval regenerates the FE typed client from.
import { ApiProperty } from '@nestjs/swagger'

export class ExportAccountDto {
  @ApiProperty({ type: String, example: 'anna@example.com' })
  email!: string

  @ApiProperty({ type: String, example: 'Anna Beispiel' })
  name!: string

  @ApiProperty({ type: Boolean, example: true })
  emailVerified!: boolean

  @ApiProperty({ type: String, example: '2026-01-15T09:30:00.000Z' })
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

  @ApiProperty({ type: String, nullable: true, example: '18181508155' })
  steuernummer!: string | null

  @ApiProperty({ type: String, example: '2026-01-15T09:30:00.000Z' })
  createdAt!: string

  @ApiProperty({ type: String, example: '2026-02-01T09:30:00.000Z' })
  updatedAt!: string
}

export class ExportAccessLogEntryDto {
  @ApiProperty({ type: String, example: 'READ' })
  action!: string

  @ApiProperty({ type: String, example: 'export' })
  resource!: string

  @ApiProperty({ type: String, example: '2026-02-01T09:30:00.000Z' })
  createdAt!: string
}

export class ExportDocumentDto {
  @ApiProperty({ type: String, example: '1.0' })
  schemaVersion!: string

  @ApiProperty({ type: String, example: '2026-02-01T09:30:00.000Z' })
  exportedAt!: string

  @ApiProperty({ type: ExportAccountDto })
  account!: ExportAccountDto

  @ApiProperty({ type: ExportProfileDto, nullable: true })
  profile!: ExportProfileDto | null

  // Honest empty set until a tax-year model exists (ADR-0013 §4) — documented as an
  // always-empty array rather than a generic `type: [Object]`, so the generated FE
  // client's type is exactly what the server ever actually sends.
  @ApiProperty({ type: [String], example: [], description: 'Always empty until a tax-year model exists.' })
  taxData!: []

  @ApiProperty({ type: [ExportAccessLogEntryDto] })
  accessLog!: ExportAccessLogEntryDto[]
}
