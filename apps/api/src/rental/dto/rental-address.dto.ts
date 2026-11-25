import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'

/** One repair of the year (ADR-0099 §8): its net amount and, if known, when the work was done. */
export class RentalRepairDto {
  @ApiProperty({ type: Number, example: 4300, description: 'Erhaltungsaufwand net of VAT, whole euros.' })
  @IsInt()
  betrag!: number

  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-05-02', description: 'When the work was done (ISO yyyy-mm-dd), within the tax year; absent or null when not known.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  datum?: string | null
}

export class PutRentalAddressDto {
  @ApiPropertyOptional({ type: String, example: 'Musterstraße' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  strasse?: string

  @ApiPropertyOptional({ type: String, example: '12a' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hausnummer?: string

  @ApiPropertyOptional({ type: String, example: '10115' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  plz?: string

  @ApiPropertyOptional({ type: String, example: 'Berlin' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ type: String, example: '85' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  livingArea?: string

  @ApiPropertyOptional({ type: Boolean, description: 'Anlage V Zeile 33: the building AfA is unchanged from last year.' })
  @IsOptional()
  @IsBoolean()
  depreciationAsLastYear?: boolean

  @ApiPropertyOptional({ type: String, example: '2400', description: 'Anlage V Zeile 20: laufende Umlagen / Nebenkosten received, whole euros.' })
  @IsOptional()
  @Matches(/^\d{1,7}$/)
  umlagen?: string

  @ApiPropertyOptional({ type: String, example: '3100', description: 'Anlage V Zeilen 46/48: Schuldzinsen (without repayment), whole euros.' })
  @IsOptional()
  @Matches(/^\d{1,7}$/)
  schuldzinsen?: string

  @ApiPropertyOptional({ type: String, example: '3', description: 'Number of flats let in this building (Anlage V Zeile 13).' })
  @IsOptional()
  @Matches(/^[1-9]\d{0,2}$/)
  einheiten?: string

  @ApiPropertyOptional({ type: String, example: '50', description: "Person A's share in percent, the rest is Person B's (Anlage V Zeile 86, ADR-0054)." })
  @IsOptional()
  @Matches(/^(\d{1,2}|100)$/)
  anteilA?: string

  @ApiPropertyOptional({ type: String, nullable: true, example: '2024-04-01', description: 'Date of purchase (ISO yyyy-mm-dd), not after the tax year; null clears it (ADR-0099 §8).' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  anschaffungsdatum?: string | null

  @ApiPropertyOptional({ type: [RentalRepairDto], description: 'The Erhaltungsaufwand of this year, replacing the stored list; [] clears it (§ 6 Abs. 1 Nr. 1a EStG, ADR-0099 §8).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RentalRepairDto)
  erhaltungsaufwand?: RentalRepairDto[]
}
