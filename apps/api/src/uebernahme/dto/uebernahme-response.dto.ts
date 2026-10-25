// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'

/** Eine Kennzeichnung: welcher Fakt aus welchem Vorjahr kopiert wurde, und ob er bestätigt ist. */
export class UebernahmeKennzeichnungDto {
  @ApiProperty({ type: String, example: 'lstb', description: 'Der stabile Schlüssel des kopierten Fakts (M1: lstb).' })
  postenKey!: string

  @ApiProperty({ type: Number, example: 2025, description: 'Das Quelljahr der Kopie — der Jahresbezug der Herkunft (ADR-022).' })
  vorjahr!: number

  @ApiProperty({ type: Boolean, example: false, description: 'false = UNBESTÄTIGT (kopiert, noch nicht angetippt), true = bestätigt (ADR-021).' })
  bestaetigt!: boolean
}

/** Die Antwort aller Übernahme-Endpoints: die Kennzeichnungen des Zieljahres. */
export class UebernahmeResponseDto {
  @ApiProperty({ type: [UebernahmeKennzeichnungDto], description: 'Die Übernahme-Kennzeichnungen, älteste zuerst.' })
  kennzeichnungen!: UebernahmeKennzeichnungDto[]
}
