import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'

/** The CHF→EUR Wechselkurs — `modus` `amtlich` or `tatsaechlich`. */
export class ExchangeRateDto {
  @ApiProperty({ type: String, example: '2026-01', description: 'yyyy-mm the rate applies to.' })
  month!: string

  @ApiProperty({ type: Number, example: 0.9412, description: 'EUR per 1 CHF, strictly positive.' })
  rate!: number

  @ApiProperty({ enum: ['amtlich', 'tatsaechlich'], description: 'The rate mode (ADR-012).' })
  mode!: 'amtlich' | 'tatsaechlich'

  @ApiPropertyOptional({ type: String, description: 'Beleg id — required iff modus === "tatsaechlich".' })
  receiptId?: string
}

/** The PUT body for the Wechselkurs. */
export class PutExchangeRateDto {
  @ApiProperty({ type: String, example: '2026-01', description: 'yyyy-mm the rate applies to.' })
  @IsString()
  month!: string

  @ApiProperty({ type: Number, example: 0.9412, description: 'EUR per 1 CHF, strictly positive.' })
  @IsNumber()
  @Min(0)
  rate!: number

  @ApiProperty({ enum: ['amtlich', 'tatsaechlich'], description: 'The rate mode (ADR-012).' })
  @IsIn(['amtlich', 'tatsaechlich'])
  mode!: 'amtlich' | 'tatsaechlich'

  @ApiPropertyOptional({ type: String, description: 'Beleg id — required iff modus === "tatsaechlich".' })
  @IsOptional()
  @IsString()
  receiptId?: string
}
