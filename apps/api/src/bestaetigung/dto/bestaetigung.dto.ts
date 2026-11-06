import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ANNEXES, SCREENS } from '@steuereule/core'
import { IsIn } from 'class-validator'

export class ProvenanceDto {
  @ApiProperty({ type: String, enum: ['nutzer', 'uebernahme', 'assistent', 'beleg'], example: 'assistent' })
  art!: 'nutzer' | 'uebernahme' | 'assistent' | 'beleg'

  @ApiPropertyOptional({ type: String, example: 'Claude', description: 'Name des Assistenten (art = assistent).' })
  name?: string

  @ApiPropertyOptional({ type: String, description: 'Der Beleg, aus dem der Wert stammt.' })
  receiptId?: string

  @ApiPropertyOptional({ type: Number, example: 2024, description: 'Quelljahr der Jahresübernahme (art = uebernahme).' })
  vorjahr?: number
}

export class ProposalDto {
  @ApiProperty({ type: String, nullable: true, example: '4800', description: 'Der vorgeschlagene Feld-Wert (null = leeren).' })
  value!: string | null

  @ApiProperty({ type: ProvenanceDto })
  provenance!: ProvenanceDto
}

export class FieldProvenanceDto {
  @ApiProperty({ type: String, example: 'lstb.bruttoarbeitslohn' })
  key!: string

  @ApiProperty({ type: String, enum: SCREENS, example: 'lstb' })
  screen!: (typeof SCREENS)[number]

  @ApiProperty({ type: String, nullable: true, description: 'Instanz (Vermietungsobjekt, Kind) oder null.' })
  instance!: string | null

  @ApiProperty({ type: String, example: 'bruttoarbeitslohn' })
  field!: string

  @ApiProperty({ type: String, nullable: true, example: '4750', description: 'Der aktuell gespeicherte Feld-Wert (null = offen, "unklar").' })
  value!: string | null

  @ApiProperty({ type: ProvenanceDto })
  provenance!: ProvenanceDto

  @ApiProperty({ type: Boolean })
  bestaetigt!: boolean

  @ApiProperty({ type: ProposalDto, nullable: true })
  proposal!: ProposalDto | null
}

export class AnnexConfirmationDto {
  @ApiProperty({ type: String, enum: ANNEXES, example: 'anlageN' })
  anlage!: (typeof ANNEXES)[number]

  @ApiProperty({ type: Number, description: 'Wie viele Werte dieser Anlage noch unbestätigt sind.' })
  unconfirmed!: number

  @ApiProperty({ type: [FieldProvenanceDto] })
  values!: FieldProvenanceDto[]
}

/** Was der Nutzer noch prüfen muss: je Anlage die unbestätigten Werte und offenen Vorschläge. */
export class ConfirmationResponseDto {
  @ApiProperty({ type: [AnnexConfirmationDto] })
  annexes!: AnnexConfirmationDto[]
}

export class ProposalDecisionDto {
  @ApiProperty({ type: String, enum: ['annehmen', 'verwerfen'] })
  @IsIn(['annehmen', 'verwerfen'])
  decision!: 'annehmen' | 'verwerfen'
}
