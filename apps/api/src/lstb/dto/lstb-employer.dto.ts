import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

/** The employer named on the Lohnsteuerbescheinigung (ADR-0099 §8): optional, null = not entered. */
export class LstbEmployerDto {
  @ApiProperty({ type: String, nullable: true, example: 'Muster GmbH', description: 'Name of the employer as printed on the certificate; empty or null clears it.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  arbeitgeber!: string | null
}
