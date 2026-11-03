// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ANLAGEN, MASKEN } from '@steuereule/core'
import { IsIn } from 'class-validator'

export class HerkunftDto {
  @ApiProperty({ type: String, enum: ['nutzer', 'uebernahme', 'assistent', 'beleg'], example: 'assistent' })
  art!: 'nutzer' | 'uebernahme' | 'assistent' | 'beleg'

  @ApiPropertyOptional({ type: String, example: 'Claude', description: 'Name des Assistenten (art = assistent).' })
  name?: string

  @ApiPropertyOptional({ type: String, description: 'Der Beleg, aus dem der Wert stammt.' })
  belegId?: string

  @ApiPropertyOptional({ type: Number, example: 2024, description: 'Quelljahr der Jahresübernahme (art = uebernahme).' })
  vorjahr?: number
}

export class VorschlagDto {
  @ApiProperty({ type: String, nullable: true, example: '4800', description: 'Der vorgeschlagene Feld-Wert (null = leeren).' })
  wert!: string | null

  @ApiProperty({ type: HerkunftDto })
  herkunft!: HerkunftDto
}

export class KennzeichnungWertDto {
  @ApiProperty({ type: String, example: 'lstb.bruttoarbeitslohn' })
  key!: string

  @ApiProperty({ type: String, enum: MASKEN, example: 'lstb' })
  maske!: (typeof MASKEN)[number]

  @ApiProperty({ type: String, nullable: true, description: 'Instanz (Vermietungsobjekt, Kind) oder null.' })
  instanz!: string | null

  @ApiProperty({ type: String, example: 'bruttoarbeitslohn' })
  feld!: string

  @ApiProperty({ type: String, nullable: true, example: '4750', description: 'Der aktuell gespeicherte Feld-Wert (null = offen, "unklar").' })
  wert!: string | null

  @ApiProperty({ type: HerkunftDto })
  herkunft!: HerkunftDto

  @ApiProperty({ type: Boolean })
  bestaetigt!: boolean

  @ApiProperty({ type: VorschlagDto, nullable: true })
  vorschlag!: VorschlagDto | null
}

export class AnlageBestaetigungDto {
  @ApiProperty({ type: String, enum: ANLAGEN, example: 'anlageN' })
  anlage!: (typeof ANLAGEN)[number]

  @ApiProperty({ type: Number, description: 'Wie viele Werte dieser Anlage noch unbestätigt sind.' })
  unbestaetigt!: number

  @ApiProperty({ type: [KennzeichnungWertDto] })
  werte!: KennzeichnungWertDto[]
}

/** Was der Nutzer noch prüfen muss: je Anlage die unbestätigten Werte und offenen Vorschläge. */
export class BestaetigungResponseDto {
  @ApiProperty({ type: [AnlageBestaetigungDto] })
  anlagen!: AnlageBestaetigungDto[]
}

export class VorschlagEntscheidungDto {
  @ApiProperty({ type: String, enum: ['annehmen', 'verwerfen'] })
  @IsIn(['annehmen', 'verwerfen'])
  entscheidung!: 'annehmen' | 'verwerfen'
}
