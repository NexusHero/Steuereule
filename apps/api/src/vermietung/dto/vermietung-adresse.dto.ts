import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

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
  ort?: string

  @ApiPropertyOptional({ type: String, example: '85' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  wohnflaeche?: string

  @ApiPropertyOptional({ type: Boolean, description: 'Anlage V Zeile 33: the building AfA is unchanged from last year.' })
  @IsOptional()
  @IsBoolean()
  afaWieVorjahr?: boolean

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
}
