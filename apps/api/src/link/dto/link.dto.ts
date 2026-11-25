import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RELIGION_KEYS } from '@steuereule/core'
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { NoControlCharacters } from '../../common/no-control-characters.validator.js'
import { IsTaxId } from '../../profile/dto/steuer-id.validators.js'

export class SetLinkDto {
  @ApiProperty({ type: String, enum: ['einzel', 'zusammen'], example: 'zusammen' })
  @IsIn(['einzel', 'zusammen'])
  filingType!: 'einzel' | 'zusammen'
}

export class LinkPersonBDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Erika' })
  @IsOptional()
  @IsString()
  @NoControlCharacters()
  @MaxLength(100)
  firstName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Muster' })
  @IsOptional()
  @IsString()
  @NoControlCharacters()
  @MaxLength(100)
  lastName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '12345678901' })
  @IsOptional()
  @IsTaxId()
  steuerId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1985-04-12' })
  @IsOptional()
  @IsString()
  // A date (YYYY-MM-DD) as the master data stores it; the bound keeps free text out (H2-13).
  @MaxLength(10)
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
  @NoControlCharacters()
  @MaxLength(100)
  beruf?: string | null
}

export class LinkResponseDto {
  @ApiProperty({ type: String, enum: ['keine', 'einzel', 'zusammen'], example: 'zusammen' })
  filingType!: 'keine' | 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: String, nullable: true, example: 'person-b-user-id' })
  personBUserId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '9F3A0C71B2E4D658' })
  invitationCode?: string | null

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'After this moment the code no longer links.' })
  invitationCodeValidUntil?: string | null

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Person B joined with an own account and maintains their data there — Person A cannot edit it.',
  })
  personBHasOwnAccount?: boolean

  @ApiPropertyOptional({ type: LinkPersonBDto, nullable: true })
  personB?: LinkPersonBDto | null

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Person B (own account) has not yet agreed to share this year; until then Person A sees nothing of B for it (decision 3).',
  })
  personBConsentPending?: boolean

  @ApiPropertyOptional({
    type: Boolean,
    description: 'The caller is Person B and is asked to agree to share this year with Person A (decision 3).',
  })
  consentRequestedFromMe?: boolean

  @ApiPropertyOptional({
    type: Boolean,
    description: 'The caller is Person B and has agreed to share this year; B can take it back (DELETE …/kopplung/zustimmung).',
  })
  consentGivenByMe?: boolean
}
