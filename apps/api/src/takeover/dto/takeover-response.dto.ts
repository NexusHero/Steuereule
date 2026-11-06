import { ApiProperty } from '@nestjs/swagger'

/** Eine Kennzeichnung: welches Feld aus welchem Vorjahr kopiert wurde, und ob es bestätigt ist. */
export class RolloverProvenanceDto {
  @ApiProperty({ type: String, example: 'lstb.bruttoarbeitslohn', description: 'Der Kennzeichnungs-Key des kopierten Felds (ADR-0052 §6).' })
  itemKey!: string

  @ApiProperty({ type: Number, example: 2025, description: 'Das Quelljahr der Kopie — der Jahresbezug der Herkunft (ADR-022).' })
  lastYear!: number

  @ApiProperty({ type: Boolean, example: false, description: 'false = UNBESTÄTIGT (kopiert, Anlage noch nicht bestätigt), true = bestätigt (ADR-021).' })
  confirmed!: boolean
}

/** Die Antwort aller Übernahme-Endpoints: die Kennzeichnungen des Zieljahres. */
export class RolloverResponseDto {
  @ApiProperty({ type: [RolloverProvenanceDto], description: 'Die Übernahme-Kennzeichnungen, älteste zuerst.' })
  markings!: RolloverProvenanceDto[]
}
