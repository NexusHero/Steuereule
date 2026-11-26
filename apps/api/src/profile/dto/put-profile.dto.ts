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
    nullable: true,
    description:
      'Steuerliche Identifikationsnummer — exactly 11 digits if present. Omitted = keep the stored value; null = clear it (ADR-0045: a profile may have none yet).',
  })
  @IsOptional()
  @IsString()
  @IsTaxId()
  steuerId?: string | null

  @ApiPropertyOptional({
    type: String,
    example: '18181508155',
    nullable: true,
    description: 'Steuernummer — 1-13 digits (no separators) if present. Omitted = keep the stored value; null = clear it.',
  })
  @IsOptional()
  @IsString()
  @IsTaxNumber()
  steuernummer?: string | null
}
