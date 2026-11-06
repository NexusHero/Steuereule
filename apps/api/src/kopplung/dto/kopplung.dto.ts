import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RELIGION_KEYS } from '@steuereule/core'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { IsTaxId } from '../../profile/dto/steuer-id.validators.js'

export class SetLinkDto {
  @ApiProperty({ type: String, enum: ['einzel', 'zusammen'], example: 'zusammen' })
  @IsIn(['einzel', 'zusammen'])
  veranlagungsart!: 'einzel' | 'zusammen'
}

export class LinkPersonBDto {
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
  @IsTaxId()
  steuerId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1985-04-12' })
  @IsOptional()
  @IsString()
  geburtsdatum?: string | null

  @ApiPropertyOptional({
    enum: RELIGION_KEYS,
    nullable: true,
    description: 'Art. 9 DSGVO: requires religionConsent = true, like the own Stammdaten.',
  })
  @IsOptional()
  @IsIn(RELIGION_KEYS)
  religion?: string | null

  @ApiPropertyOptional({ type: Boolean, description: 'Explicit consent to store the religion (Art. 9 Abs. 2 lit. a DSGVO).' })
  @IsOptional()
  @IsBoolean()
  religionConsent?: boolean

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Angestellte' })
  @IsOptional()
  @IsString()
  beruf?: string | null
}

export class LinkResponseDto {
  @ApiProperty({ type: String, enum: ['keine', 'einzel', 'zusammen'], example: 'zusammen' })
  veranlagungsart!: 'keine' | 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: String, nullable: true, example: 'person-b-user-id' })
  personBUserId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '9F3A0C71B2E4D658' })
  einladungsCode?: string | null

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'After this moment the code no longer links.' })
  einladungsCodeGueltigBis?: string | null

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Person B joined with an own account and maintains their data there — Person A cannot edit it.',
  })
  personBHasOwnAccount?: boolean

  @ApiPropertyOptional({ type: LinkPersonBDto, nullable: true })
  personB?: LinkPersonBDto | null
}
