import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ExchangeRateDto } from './exchange-rate.dto.js'

/** One CH line item with full provenance. */
export class ChItemDto {
  @ApiProperty({ type: String, description: 'Stable line-item id.' })
  id!: string

  @ApiProperty({ enum: ['Bruttolohn', 'Quellensteuer', 'Pensionskasse', 'Saeule3a', 'Krankenkasse'], description: 'The CH line-item kind.' })
  kind!: string

  @ApiPropertyOptional({ type: String, description: 'The Lohnausweis Ziffer (when from the Lohnausweis).' })
  digit?: string

  @ApiProperty({ type: Number, description: 'CHF amount as entered (ADR-036: CHF führt).' })
  amountChf!: number

  @ApiProperty({ type: Number, description: 'EUR amount = chfNachEur(betragChf, kurs), rounded to cents.' })
  amountEur!: number

  @ApiProperty({ enum: ['einnahme', 'vorsorgeaufwand', 'anrechnung'], description: 'The fold bucket (Rolle).' })
  role!: string

  @ApiProperty({ type: ExchangeRateDto, description: 'The Kurs the conversion was made with.' })
  exchangeRate!: ExchangeRateDto
}

/** The PUT body for the optional Säule 3a / Krankenkasse amounts. */
export class PutProvisionDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Säule 3a whole-CHF amount, or null to clear.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  saeule3aChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Krankenkasse whole-CHF amount, or null to clear.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  krankenkasseChf?: number | null
}

/** The PUT body for Ziffer 15 Bemerkungen. */
export class PutRemarksDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'The free-text remark, or null to clear.' })
  @IsOptional()
  @IsString()
  text?: string | null
}

/** The PUT body for the Anlage-N-Gre facts beyond the Lohnausweis. */
export class PutNGreDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Arbeitgeber, Zeile 89.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  arbeitgeberName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Arbeitgeber, Zeile 90.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  arbeitgeberStrasse?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Arbeitgeber, Zeile 91.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  arbeitgeberPlzOrt?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Whole CHF — Kinder-/Ausbildungszulagen in Ziffer 8 (Zeilen 8/76).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  familienzulagenChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Whole CHF — employee Krankentaggeld contributions (Zeile 80).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  krankentaggeldChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Whole CHF — Säule 2a Obligatorium, employee (Zeile 84).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  pkArbeitnehmerChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Whole CHF — Säule 2a Obligatorium, employer (Zeile 87).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  pkArbeitgeberChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Employer share of the Krankentaggeld premium in percent, 0–100 (Zeilen 18, 95, 96).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  krankentaggeldArbeitgeberProzent?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Whole CHF — employer Krankentaggeld contribution; only needed when the employer pays 100 %.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  krankentaggeldArbeitgeberChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Employer share of the NBUV premium in percent, 0–100 (Zeilen 19, 97, 98).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  nbuvArbeitgeberProzent?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Whole CHF — employer NBUV contribution; only needed when the employer pays 100 %.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  nbuvArbeitgeberChf?: number | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'Any of N-Gre Zeilen 7, 9–14, 16, 17 or 20–22 applies.' })
  @IsOptional()
  @IsBoolean()
  specialCases?: boolean | null
}

/** The stored Anlage-N-Gre facts. */
export class NGreDetailsDto {
  @ApiProperty({ type: String, nullable: true })
  arbeitgeberName!: string | null

  @ApiProperty({ type: String, nullable: true })
  arbeitgeberStrasse!: string | null

  @ApiProperty({ type: String, nullable: true })
  arbeitgeberPlzOrt!: string | null

  @ApiProperty({ type: Number, nullable: true })
  familienzulagenChf!: number | null

  @ApiProperty({ type: Number, nullable: true })
  krankentaggeldChf!: number | null

  @ApiProperty({ type: Number, nullable: true })
  pkArbeitnehmerChf!: number | null

  @ApiProperty({ type: Number, nullable: true })
  pkArbeitgeberChf!: number | null

  @ApiProperty({ type: Number, nullable: true })
  krankentaggeldArbeitgeberProzent!: number | null

  @ApiProperty({ type: Number, nullable: true })
  krankentaggeldArbeitgeberChf!: number | null

  @ApiProperty({ type: Number, nullable: true })
  nbuvArbeitgeberProzent!: number | null

  @ApiProperty({ type: Number, nullable: true })
  nbuvArbeitgeberChf!: number | null

  @ApiProperty({ type: Boolean, nullable: true })
  specialCases!: boolean | null
}
