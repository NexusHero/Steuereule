import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { AssessmentFieldDto } from './assessment-field.dto.js'

/** One Abgleich deviation. */
export class AssessmentDeviationDto {
  @ApiProperty({ type: String, enum: ['einnahmen', 'vorsorgeaufwand', 'anrechnung'] })
  field!: string

  @ApiProperty({ type: Number, description: 'The Bescheid figure (whole euros).' })
  assessment!: number

  @ApiProperty({ type: Number, description: 'The computed figure (whole euros).' })
  calculated!: number

  @ApiProperty({ type: Number, description: 'bescheid − berechnet.' })
  difference!: number
}

/** The Abgleich result. */
export class AssessmentComparisonDto {
  @ApiProperty({ type: [AssessmentDeviationDto], description: 'The deviations (empty = alles stimmt überein).' })
  deviations!: AssessmentDeviationDto[]

  @ApiProperty({ type: Boolean, description: 'The computed side is incomplete (berechne returned "offen").' })
  calculationIncomplete!: boolean
}

/** The § 355 AO Einspruchsfrist, derived. */
export class AssessmentDeadlineDto {
  @ApiProperty({ type: String, nullable: true, description: 'Bescheiddatum (ISO yyyy-mm-dd), null until set.' })
  assessmentDate!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Einspruchsfrist-Ende (Bescheiddatum + 1 Monat), null until the datum is set.' })
  deadlineEnd!: string | null

  @ApiProperty({ type: Number, nullable: true, description: 'Whole days left (negative = abgelaufen), null until the datum is set.' })
  remainingDays!: number | null
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/bescheid` and every PUT. */
export class AssessmentResponseDto {
  @ApiProperty({ type: String, enum: ['eingegangen', 'geprüft', 'einspruch-eingelegt'], description: 'The bescheid-phase sub-state.' })
  status!: string

  @ApiProperty({ type: String, nullable: true, description: 'Bescheiddatum (ISO yyyy-mm-dd).' })
  assessmentDate!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Einspruch-Grund (closed set), null until filed.' })
  appealReason!: string | null

  @ApiProperty({ type: [AssessmentFieldDto], description: 'The five figures, in paper order.' })
  fields!: AssessmentFieldDto[]

  @ApiProperty({ type: AssessmentComparisonDto, description: 'The Abgleich (Bescheid vs. berechnet).' })
  reconciliation!: AssessmentComparisonDto

  @ApiProperty({ type: AssessmentDeadlineDto, description: 'The § 355 AO Einspruchsfrist.' })
  frist!: AssessmentDeadlineDto

  @ApiProperty({ type: [String], description: 'The legal next sub-states (for the UI to offer only what is legal).' })
  nextStates!: string[]
}

/** The PUT body for a status transition. */
export class SetAssessmentStatusDto {
  @ApiProperty({ type: String, enum: ['eingegangen', 'geprüft', 'einspruch-eingelegt'], description: 'The target sub-state.' })
  @IsIn(['eingegangen', 'geprüft', 'einspruch-eingelegt'])
  status!: string
}

/** The PUT body for the Bescheiddatum. */
export class SetAssessmentDateDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-04-15', description: 'Bescheiddatum (ISO yyyy-mm-dd).' })
  @IsOptional()
  @IsString()
  date?: string | null
}

/** The PUT body for filing an Einspruch. */
export class SetAppealDto {
  @ApiProperty({ type: String, enum: ['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'], description: 'The Einspruch-Grund (closed set).' })
  @IsIn(['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'])
  reason!: string
}
