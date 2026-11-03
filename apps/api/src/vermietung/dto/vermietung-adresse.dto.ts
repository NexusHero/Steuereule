import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class PutVermietungAdresseDto {
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
}
