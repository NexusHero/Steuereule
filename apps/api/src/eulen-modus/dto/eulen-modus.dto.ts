import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNotEmpty } from 'class-validator'
import type { OwlRecommendationPath, OwlCardsDisplay } from '@steuereule/core'

export class SetOwlSettingDto {
  @ApiProperty({ type: Boolean, example: true })
  @IsNotEmpty()
  @IsBoolean()
  aktiviert!: boolean
}

export class OwlSettingResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  aktiviert!: boolean

  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-11-03T10:00:00Z' })
  aktiviertAm?: string | null
}

export class OwlPathDto implements OwlRecommendationPath {
  @ApiProperty({ type: String, example: 'Tagespauschale ansetzen' })
  name!: string

  @ApiProperty({ type: Number, example: 300 })
  amountEur!: number

  @ApiProperty({ type: String, example: 'Einfacher Nachweis ohne separates Arbeitszimmer' })
  description!: string

  @ApiProperty({ type: String, enum: ['sicher', 'risiko'], example: 'sicher' })
  risk!: 'sicher' | 'risiko'
}

export class OwlCardDto implements OwlCardsDisplay {
  @ApiProperty({ type: String, example: 'eule-ra-homeoffice-2025' })
  id!: string

  @ApiProperty({ type: String, example: '1234abcd5678efgh' })
  fingerprint!: string

  @ApiProperty({ type: String, enum: ['musterluecke', 'vorjahresvergleich', 'rechtsaenderung', 'lebenslage_hinweis'] })
  trigger!: 'musterluecke' | 'vorjahresvergleich' | 'rechtsaenderung' | 'lebenslage_hinweis'

  @ApiProperty({ type: String, enum: ['cockpit_proaktiv', 'abruf_frage', 'archiv_einspruch'] })
  category!: 'cockpit_proaktiv' | 'abruf_frage' | 'archiv_einspruch'

  @ApiProperty({ type: String, example: 'Homeoffice-Tagespauschale 6 €' })
  title!: string

  @ApiProperty({ type: String, example: 'Du hast 50 Tage im Homeoffice gearbeitet.' })
  message!: string

  @ApiProperty({ type: String, example: 'weil der Gesetzgeber die Pauschale dauerhaft angehoben hat.' })
  reason!: string

  @ApiPropertyOptional({ type: Number, nullable: true, example: 300 })
  amountEur!: number | null

  @ApiProperty({ type: String, example: '01.01.2025' })
  legalStatusDate!: string

  @ApiProperty({ type: String, example: 'Jahressteuergesetz § 4 Abs. 5 Satz 1 Nr. 6b EStG' })
  sourceTranslated!: string

  @ApiPropertyOptional({ type: String, example: 'https://...' })
  sourceUrl?: string | undefined

  @ApiPropertyOptional({ type: [OwlPathDto] })
  paths?: readonly [OwlPathDto, OwlPathDto] | undefined

  @ApiPropertyOptional({ type: String, example: '01.10.2025' })
  appealDeadline?: string | undefined
}

export class OwlCardsResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  aktiviert!: boolean

  @ApiProperty({ type: [OwlCardDto] })
  cards!: readonly OwlCardDto[]

  @ApiProperty({ type: String, example: '01.01.2025' })
  legalStatus!: string
}
