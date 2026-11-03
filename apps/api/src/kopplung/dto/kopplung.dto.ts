import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RELIGIONSSCHLUESSEL } from '@steuereule/core'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { IsSteuerId } from '../../profile/dto/steuer-id.validators.js'

export class SetKopplungDto {
  @ApiProperty({ type: String, enum: ['einzel', 'zusammen'], example: 'zusammen' })
  @IsIn(['einzel', 'zusammen'])
  veranlagungsart!: 'einzel' | 'zusammen'
}

export class KopplungPersonBDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Erika' })
  @IsOptional()
  @IsString()
  firstName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Muster' })
  @IsOptional()
  @IsString()
  lastName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '12345678901' })
  @IsOptional()
  @IsSteuerId()
  steuerId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1985-04-12' })
  @IsOptional()
  @IsString()
  geburtsdatum?: string | null

  @ApiPropertyOptional({
    enum: RELIGIONSSCHLUESSEL,
    nullable: true,
    description: 'Art. 9 DSGVO: requires religionEinwilligung = true, like the own Stammdaten.',
  })
  @IsOptional()
  @IsIn(RELIGIONSSCHLUESSEL)
  religion?: string | null

  @ApiPropertyOptional({ type: Boolean, description: 'Explicit consent to store the religion (Art. 9 Abs. 2 lit. a DSGVO).' })
  @IsOptional()
  @IsBoolean()
  religionEinwilligung?: boolean

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Angestellte' })
  @IsOptional()
  @IsString()
  beruf?: string | null
}

export class KopplungResponseDto {
  @ApiProperty({ type: String, enum: ['keine', 'einzel', 'zusammen'], example: 'zusammen' })
  veranlagungsart!: 'keine' | 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: String, nullable: true, example: 'person-b-user-id' })
  personBUserId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '9F3A0C71B2E4D658' })
  einladungsCode?: string | null

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Person B joined with an own account and maintains their data there — Person A cannot edit it.',
  })
  personBHatEigenesKonto?: boolean

  @ApiPropertyOptional({ type: KopplungPersonBDto, nullable: true })
  personB?: KopplungPersonBDto | null
}
