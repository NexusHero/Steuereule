import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'

/** The CHF→EUR Wechselkurs — `amtlich` (BMF monthly), `jahresdurchschnitt` (annual average on Anlage N-Gre) or `tatsaechlich`. */
export class ExchangeRateDto {
  @ApiProperty({ type: String, example: '2026-01', description: 'yyyy-mm the rate applies to; yyyy for the Jahresdurchschnittskurs.' })
  month!: string

  @ApiProperty({ type: Number, example: 0.9412, description: 'EUR per 1 CHF, strictly positive.' })
  rate!: number

  @ApiProperty({ enum: ['amtlich', 'jahresdurchschnitt', 'tatsaechlich'], description: 'The rate mode (ADR-012, ADR-0072).' })
  mode!: 'amtlich' | 'jahresdurchschnitt' | 'tatsaechlich'

  @ApiPropertyOptional({ type: String, description: 'Beleg id — required iff modus === "tatsaechlich".' })
  receiptId?: string
}

/** The PUT body for the Wechselkurs. */
export class PutExchangeRateDto {
  @ApiProperty({ type: String, example: '2026-01', description: 'yyyy-mm the rate applies to; yyyy for the Jahresdurchschnittskurs.' })
  @IsString()
  month!: string

  @ApiProperty({ type: Number, example: 0.9412, description: 'EUR per 1 CHF, strictly positive.' })
  @IsNumber()
  @Min(0)
  rate!: number

  @ApiProperty({ enum: ['amtlich', 'jahresdurchschnitt', 'tatsaechlich'], description: 'The rate mode (ADR-012, ADR-0072).' })
  @IsIn(['amtlich', 'jahresdurchschnitt', 'tatsaechlich'])
  mode!: 'amtlich' | 'jahresdurchschnitt' | 'tatsaechlich'

  @ApiPropertyOptional({ type: String, description: 'Beleg id — required iff modus === "tatsaechlich".' })
  @IsOptional()
  @IsString()
  receiptId?: string
}
