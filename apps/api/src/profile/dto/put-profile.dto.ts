// `type: String` is given explicitly on every @ApiProperty() below — see the comment
// in validation-error.dto.ts for why we don't rely on inferred design:type metadata.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { IsNotBlank, IsSteuerId, IsSteuernummer } from './steuer-id.validators.js'

export class PutProfileDto {
  @ApiProperty({ type: String, example: 'Anna', description: 'Non-empty first name.' })
  @IsString()
  @IsNotBlank()
  firstName!: string

  @ApiProperty({ type: String, example: 'Beispiel', description: 'Non-empty last name.' })
  @IsString()
  @IsNotBlank()
  lastName!: string

  @ApiProperty({
    type: String,
    example: '02476291358',
    description: 'Steuerliche Identifikationsnummer — exactly 11 digits.',
  })
  @IsString()
  @IsSteuerId()
  steuerId!: string

  @ApiPropertyOptional({
    type: String,
    example: '18181508155',
    description: 'Steuernummer — optional; 1-13 digits (no separators) if present.',
  })
  @IsOptional()
  @IsString()
  @IsSteuernummer()
  steuernummer?: string
}
