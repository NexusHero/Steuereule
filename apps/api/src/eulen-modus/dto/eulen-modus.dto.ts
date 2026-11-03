import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNotEmpty } from 'class-validator'
import type { EulenEmpfehlungWeg, EulenKarte } from '@steuereule/core'

export class SetEulenEinstellungDto {
  @ApiProperty({ type: Boolean, example: true })
  @IsNotEmpty()
  @IsBoolean()
  aktiviert!: boolean
}

export class EulenEinstellungResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  aktiviert!: boolean

  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-11-03T10:00:00Z' })
  aktiviertAm?: string | null
}

export class EulenWegDto implements EulenEmpfehlungWeg {
  @ApiProperty({ type: String, example: 'Tagespauschale ansetzen' })
  name!: string

  @ApiProperty({ type: Number, example: 300 })
  betragEur!: number

  @ApiProperty({ type: String, example: 'Einfacher Nachweis ohne separates Arbeitszimmer' })
  beschreibung!: string

  @ApiProperty({ type: String, enum: ['sicher', 'risiko'], example: 'sicher' })
  risiko!: 'sicher' | 'risiko'
}

export class EulenKarteDto implements EulenKarte {
  @ApiProperty({ type: String, example: 'eule-ra-homeoffice-2025' })
  id!: string

  @ApiProperty({ type: String, example: '1234abcd5678efgh' })
  fingerprint!: string

  @ApiProperty({ type: String, enum: ['musterluecke', 'vorjahresvergleich', 'rechtsaenderung', 'lebenslage_hinweis'] })
  trigger!: 'musterluecke' | 'vorjahresvergleich' | 'rechtsaenderung' | 'lebenslage_hinweis'

  @ApiProperty({ type: String, enum: ['cockpit_proaktiv', 'abruf_frage', 'archiv_einspruch'] })
  kategorie!: 'cockpit_proaktiv' | 'abruf_frage' | 'archiv_einspruch'

  @ApiProperty({ type: String, example: 'Homeoffice-Tagespauschale 6 €' })
  titel!: string

  @ApiProperty({ type: String, example: 'Du hast 50 Tage im Homeoffice gearbeitet.' })
  botschaft!: string

  @ApiProperty({ type: String, example: 'weil der Gesetzgeber die Pauschale dauerhaft angehoben hat.' })
  begruendung!: string

  @ApiPropertyOptional({ type: Number, nullable: true, example: 300 })
  betragEur!: number | null

  @ApiProperty({ type: String, example: '01.01.2025' })
  rechtsstandDatum!: string

  @ApiProperty({ type: String, example: 'Jahressteuergesetz § 4 Abs. 5 Satz 1 Nr. 6b EStG' })
  quelleUebersetzt!: string

  @ApiPropertyOptional({ type: String, example: 'https://...' })
  quelleUrl?: string | undefined

  @ApiPropertyOptional({ type: [EulenWegDto] })
  wege?: readonly [EulenWegDto, EulenWegDto] | undefined

  @ApiPropertyOptional({ type: String, example: '01.10.2025' })
  einspruchFristBis?: string | undefined
}

export class EulenKartenResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  aktiviert!: boolean

  @ApiProperty({ type: [EulenKarteDto] })
  karten!: readonly EulenKarteDto[]

  @ApiProperty({ type: String, example: '01.01.2025' })
  rechtsstand!: string
}
