import { ApiProperty } from '@nestjs/swagger'

export class RangeDto {
  @ApiProperty({ type: Number }) from!: number
  @ApiProperty({ type: Number }) to!: number
}

/** One shape for all three states; only the fields of the given `kind` are set. */
export class TaxEstimateDto {
  @ApiProperty({ enum: ['spanne', 'offen', 'nicht-moeglich'] })
  kind!: 'spanne' | 'offen' | 'nicht-moeglich'

  @ApiProperty({ type: () => RangeDto, required: false, description: 'Positive = Erstattung, negative = Nachzahlung.' })
  result?: RangeDto

  @ApiProperty({ type: () => RangeDto, required: false })
  incomeTax?: RangeDto

  @ApiProperty({ type: () => RangeDto, required: false })
  taxableIncome?: RangeDto

  @ApiProperty({ type: () => RangeDto, required: false })
  provision?: RangeDto

  @ApiProperty({ type: Number, required: false })
  werbungskosten?: number

  @ApiProperty({ type: Number, required: false })
  specialExpenses?: number

  @ApiProperty({ type: Number, required: false, description: 'Lohnsteuer or creditable Swiss Quellensteuer already paid.' })
  anrechnung?: number

  @ApiProperty({ type: Boolean, required: false, description: 'True when church tax applies but is not part of the estimate.' })
  churchTaxOpen?: boolean

  @ApiProperty({ type: [String], required: false })
  fehlt?: string[]

  @ApiProperty({ type: String, required: false, enum: ['nur-angestellte', 'verheiratet', 'besondere-lebenslage', 'jahr-ohne-tarif'] })
  reason?: string
}
