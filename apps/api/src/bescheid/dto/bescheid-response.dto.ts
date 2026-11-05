import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { BescheidFeldDto } from './bescheid-feld.dto.js'

/** One Abgleich deviation. */
export class BescheidAbweichungDto {
  @ApiProperty({ type: String, enum: ['einnahmen', 'vorsorgeaufwand', 'anrechnung'] })
  feld!: string

  @ApiProperty({ type: Number, description: 'The Bescheid figure (whole euros).' })
  bescheid!: number

  @ApiProperty({ type: Number, description: 'The computed figure (whole euros).' })
  berechnet!: number

  @ApiProperty({ type: Number, description: 'bescheid − berechnet.' })
  differenz!: number
}

/** The Abgleich result. */
export class BescheidAbgleichDto {
  @ApiProperty({ type: [BescheidAbweichungDto], description: 'The deviations (empty = alles stimmt überein).' })
  abweichungen!: BescheidAbweichungDto[]

  @ApiProperty({ type: Boolean, description: 'The computed side is incomplete (berechne returned "offen").' })
  berechnungUnvollstaendig!: boolean
}

/** The § 355 AO Einspruchsfrist, derived. */
export class BescheidFristDto {
  @ApiProperty({ type: String, nullable: true, description: 'Bescheiddatum (ISO yyyy-mm-dd), null until set.' })
  bescheiddatum!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Einspruchsfrist-Ende (Bescheiddatum + 1 Monat), null until the datum is set.' })
  fristEnde!: string | null

  @ApiProperty({ type: Number, nullable: true, description: 'Whole days left (negative = abgelaufen), null until the datum is set.' })
  verbleibendeTage!: number | null
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/bescheid` and every PUT. */
export class BescheidResponseDto {
  @ApiProperty({ type: String, enum: ['eingegangen', 'geprüft', 'einspruch-eingelegt'], description: 'The bescheid-phase sub-state.' })
  status!: string

  @ApiProperty({ type: String, nullable: true, description: 'Bescheiddatum (ISO yyyy-mm-dd).' })
  bescheiddatum!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Einspruch-Grund (closed set), null until filed.' })
  einspruchGrund!: string | null

  @ApiProperty({ type: [BescheidFeldDto], description: 'The five figures, in paper order.' })
  felder!: BescheidFeldDto[]

  @ApiProperty({ type: BescheidAbgleichDto, description: 'The Abgleich (Bescheid vs. berechnet).' })
  abgleich!: BescheidAbgleichDto

  @ApiProperty({ type: BescheidFristDto, description: 'The § 355 AO Einspruchsfrist.' })
  frist!: BescheidFristDto

  @ApiProperty({ type: [String], description: 'The legal next sub-states (for the UI to offer only what is legal).' })
  naechsteZustaende!: string[]
}

/** The PUT body for a status transition. */
export class SetBescheidStatusDto {
  @ApiProperty({ type: String, enum: ['eingegangen', 'geprüft', 'einspruch-eingelegt'], description: 'The target sub-state.' })
  @IsIn(['eingegangen', 'geprüft', 'einspruch-eingelegt'])
  status!: string
}

/** The PUT body for the Bescheiddatum. */
export class SetBescheidDatumDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-04-15', description: 'Bescheiddatum (ISO yyyy-mm-dd).' })
  @IsOptional()
  @IsString()
  datum?: string | null
}

/** The PUT body for filing an Einspruch. */
export class SetEinspruchDto {
  @ApiProperty({ type: String, enum: ['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'], description: 'The Einspruch-Grund (closed set).' })
  @IsIn(['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'])
  grund!: string
}

export type AssessmentResponseDto = BescheidResponseDto
export type SetAssessmentDateDto = SetBescheidDatumDto
export type SetAppealDto = SetEinspruchDto
export type AssessmentComparisonDto = BescheidAbgleichDto
export type AssessmentDeadlineDto = BescheidFristDto

