// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { WechselkursDto } from './wechselkurs.dto.js'

/**
 * One CH line item with full provenance (ADR-029 "Herkunft pro Wert 'Lohnausweis Ziffer n ×
 * Kurs'") — the wire shape of @steuereule/core's `ChPosten`, plus the fold `rolle` the core's
 * `chPostenAlsKernposten` assigns (einnahme / vorsorgeaufwand / anrechnung).
 */
export class ChPostenDto {
  @ApiProperty({ type: String, description: 'Stable line-item id.' })
  id!: string

  @ApiProperty({ enum: ['Bruttolohn', 'Quellensteuer', 'Pensionskasse', 'Saeule3a', 'Krankenkasse'], description: 'The CH line-item kind.' })
  art!: string

  @ApiPropertyOptional({ type: String, description: 'The Lohnausweis Ziffer (when from the Lohnausweis).' })
  ziffer?: string

  @ApiProperty({ type: Number, description: 'CHF amount as entered (ADR-036: CHF führt).' })
  betragChf!: number

  @ApiProperty({ type: Number, description: 'EUR amount = chfNachEur(betragChf, kurs), rounded to cents.' })
  betragEur!: number

  @ApiProperty({ enum: ['einnahme', 'vorsorgeaufwand', 'anrechnung'], description: 'The fold bucket (Rolle).' })
  rolle!: string

  @ApiProperty({ type: WechselkursDto, description: 'The Kurs the conversion was made with.' })
  wechselkurs!: WechselkursDto
}

/** The PUT body for the optional Säule 3a / Krankenkasse amounts (null = clear / not entered). */
export class PutVorsorgeDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Säule 3a whole-CHF amount, or null to clear.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  saeule3aChf?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Krankenkasse whole-CHF amount, or null to clear.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  krankenkasseChf?: number | null
}

/** The PUT body for Ziffer 15 Bemerkungen (Freitext, null to clear). */
export class PutBemerkungenDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'The free-text remark, or null to clear.' })
  @IsOptional()
  @IsString()
  text?: string | null
}
