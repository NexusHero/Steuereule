import { ApiProperty } from '@nestjs/swagger'

/** Die § 152 Abs. 2 AO-Fakten, die das Banner nüchtern nennt. */
export class LateFilingFeeDto {
  @ApiProperty({ type: Number, example: 25, description: '§ 152 Abs. 2 Satz 2 AO — der Mindestzuschlag je angefangenem Monat, in Euro.' })
  mindestsatzEur!: number

  @ApiProperty({ type: Number, example: 0.25, description: '§ 152 Abs. 2 Satz 1 AO — 0,25 % der festgesetzten Steuer je angefangenem Monat.' })
  prozentProMonat!: number
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/fristen`. */
export class DeadlinesResponseDto {
  @ApiProperty({ type: String, example: '2027-07-31', description: 'Die Abgabefrist (§ 149 Abs. 2 AO), ISO yyyy-mm-dd.' })
  abgabefrist!: string

  @ApiProperty({ type: String, example: '2027-06-01', description: 'Der Server-Stichtag in Europe/Berlin, ISO yyyy-mm-dd.' })
  heute!: string

  @ApiProperty({ type: String, enum: ['keine', 'warnung', 'abgelaufen'], description: 'keine | warnung (ab 60 Tage vor der Frist) | abgelaufen.' })
  stufe!: 'keine' | 'warnung' | 'abgelaufen'

  @ApiProperty({ type: Number, example: 60, description: 'Whole days from heute (exclusive) to the frist; negative = abgelaufen.' })
  verbleibendeTage!: number

  @ApiProperty({ type: LateFilingFeeDto })
  verspaetungszuschlag!: LateFilingFeeDto
}
