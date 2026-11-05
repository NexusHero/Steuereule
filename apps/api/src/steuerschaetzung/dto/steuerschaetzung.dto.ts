import { ApiProperty } from '@nestjs/swagger'

export class SpanneDto {
  @ApiProperty({ type: Number }) von!: number
  @ApiProperty({ type: Number }) bis!: number
}

/** One shape for all three states; only the fields of the given `kind` are set. */
export class SteuerschaetzungDto {
  @ApiProperty({ enum: ['spanne', 'offen', 'nicht-moeglich'] })
  kind!: 'spanne' | 'offen' | 'nicht-moeglich'

  @ApiProperty({ type: () => SpanneDto, required: false, description: 'Positive = Erstattung, negative = Nachzahlung.' })
  ergebnis?: SpanneDto

  @ApiProperty({ type: () => SpanneDto, required: false })
  einkommensteuer?: SpanneDto

  @ApiProperty({ type: () => SpanneDto, required: false })
  zuVersteuerndesEinkommen?: SpanneDto

  @ApiProperty({ type: () => SpanneDto, required: false })
  vorsorge?: SpanneDto

  @ApiProperty({ type: Number, required: false })
  werbungskosten?: number

  @ApiProperty({ type: Number, required: false })
  sonderausgaben?: number

  @ApiProperty({ type: Number, required: false, description: 'Lohnsteuer or creditable Swiss Quellensteuer already paid.' })
  anrechnung?: number

  @ApiProperty({ type: Boolean, required: false, description: 'True when church tax applies but is not part of the estimate.' })
  kirchensteuerOffen?: boolean

  @ApiProperty({ type: [String], required: false })
  fehlt?: string[]

  @ApiProperty({ type: String, required: false, enum: ['nur-angestellte', 'verheiratet', 'besondere-lebenslage', 'jahr-ohne-tarif'] })
  grund?: string
}
