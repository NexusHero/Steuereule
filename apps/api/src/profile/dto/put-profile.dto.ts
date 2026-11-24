import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { NoControlCharacters } from '../../common/no-control-characters.validator.js'
import { IsNotBlank, IsTaxId, IsTaxNumber } from './steuer-id.validators.js'

/** `type: String` is given explicitly on every. */
export class PutProfileDto {
  @ApiProperty({ type: String, example: 'Anna', description: 'Non-empty first name, at most 100 characters.' })
  @IsString()
  @IsNotBlank()
  @MaxLength(100)
  @NoControlCharacters()
  firstName!: string

  @ApiProperty({ type: String, example: 'Beispiel', description: 'Non-empty last name, at most 100 characters.' })
  @IsString()
  @IsNotBlank()
  @MaxLength(100)
  @NoControlCharacters()
  lastName!: string

  @ApiPropertyOptional({
    type: String,
    example: '02476291358',
    description: 'Steuerliche Identifikationsnummer — exactly 11 digits if present. Optional since ADR-0045 (value-first funnel): omitted = not given yet, stored as null.',
  })
  @IsOptional()
  @IsString()
  @IsTaxId()
  steuerId?: string

  @ApiPropertyOptional({
    type: String,
    example: '18181508155',
    description: 'Steuernummer — optional; 1-13 digits (no separators) if present.',
  })
  @IsOptional()
  @IsString()
  @IsTaxNumber()
  steuernummer?: string
}
