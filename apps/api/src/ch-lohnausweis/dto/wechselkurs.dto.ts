// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'

/**
 * The CHF→EUR Wechselkurs (ADR-012) — `modus` `amtlich` (BMF-Monatskurs) or `tatsaechlich`
 * (requires `belegId`). Wire shape of @steuereule/core's `Wechselkurs`.
 */
export class WechselkursDto {
  @ApiProperty({ type: String, example: '2026-01', description: 'yyyy-mm the rate applies to.' })
  monat!: string

  @ApiProperty({ type: Number, example: 0.9412, description: 'EUR per 1 CHF, strictly positive.' })
  kurs!: number

  @ApiProperty({ enum: ['amtlich', 'tatsaechlich'], description: 'The rate mode (ADR-012).' })
  modus!: 'amtlich' | 'tatsaechlich'

  @ApiPropertyOptional({ type: String, description: 'Beleg id — required iff modus === "tatsaechlich".' })
  belegId?: string
}

/** The PUT body for the Wechselkurs (validated in the service via @steuereule/core). */
export class PutWechselkursDto {
  @ApiProperty({ type: String, example: '2026-01', description: 'yyyy-mm the rate applies to.' })
  @IsString()
  monat!: string

  @ApiProperty({ type: Number, example: 0.9412, description: 'EUR per 1 CHF, strictly positive.' })
  @IsNumber()
  @Min(0)
  kurs!: number

  @ApiProperty({ enum: ['amtlich', 'tatsaechlich'], description: 'The rate mode (ADR-012).' })
  @IsIn(['amtlich', 'tatsaechlich'])
  modus!: 'amtlich' | 'tatsaechlich'

  @ApiPropertyOptional({ type: String, description: 'Beleg id — required iff modus === "tatsaechlich".' })
  @IsOptional()
  @IsString()
  belegId?: string
}
