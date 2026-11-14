import { ApiProperty } from '@nestjs/swagger'

export class RangeDto {
  @ApiProperty({ type: Number }) from!: number
  @ApiProperty({ type: Number }) to!: number
}

/** Kirchensteuer in the estimate (ADR-0063): none, honest "offen" with the reason, or a range. */
export class ChurchTaxEstimateDto {
  @ApiProperty({ enum: ['none', 'offen', 'spanne'] })
  kind!: 'none' | 'offen' | 'spanne'

  @ApiProperty({
    type: String,
    required: false,
    enum: ['konfession-fehlt', 'kappung-unbekannt', 'kirchgeld-unbekannt', 'einbehalt-fehlt'],
    description: 'Why the church tax is open (kind "offen").',
  })
  reason?: 'konfession-fehlt' | 'kappung-unbekannt' | 'kirchgeld-unbekannt' | 'einbehalt-fehlt'

  @ApiProperty({ type: () => RangeDto, required: false, description: 'Church tax due for the year (kind "spanne").' })
  due?: RangeDto

  @ApiProperty({ type: Number, required: false, description: 'Church tax withheld per LStB (Zeilen 6 und 7).' })
  withheld?: number

  @ApiProperty({ type: Boolean, required: false, description: 'The church would cap the tax on application (Kappung auf Antrag).' })
  capOnApplication?: boolean
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

  @ApiProperty({ type: () => ChurchTaxEstimateDto, required: false })
  churchTax?: ChurchTaxEstimateDto

  @ApiProperty({ type: [String], required: false })
  missing?: string[]

  @ApiProperty({ type: String, required: false, enum: ['nur-angestellte', 'verheiratet', 'besondere-lebenslage', 'jahr-ohne-tarif'] })
  reason?: string

  @ApiProperty({ type: Number, required: false, description: 'Number of deferred catalog deduction amounts.' })
  laterAmounts?: number

  @ApiProperty({ type: Number, required: false, description: 'Income tax prepayments of the year (§ 37 EStG), already included in the result (ADR-0081).' })
  prepayments?: number
}
