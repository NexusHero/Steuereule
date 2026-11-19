import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator'
import { AssessmentFieldDto } from './assessment-field.dto.js'
import { AssessmentDiffDto } from './assessment-diff.dto.js'

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

  @ApiProperty({ type: String, nullable: true, description: 'Einspruchsfrist-Ende: one month after the notice counts as received (Bescheiddatum + 4 days, § 122 Abs. 2 AO; 3 before 2025), moved to a working day (§ 108 Abs. 3 AO). Null until the datum is set.' })
  deadlineEnd!: string | null

  @ApiProperty({ type: Number, nullable: true, description: 'Whole days left (negative = abgelaufen), null until the datum is set.' })
  remainingDays!: number | null

  @ApiProperty({ type: Boolean, nullable: true, description: 'The Einspruchsfrist still runs (its last day included); null until the datum is set.' })
  running!: boolean | null
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/bescheid` and every PUT. */
export class AssessmentResponseDto {
  @ApiProperty({ type: String, enum: ['eingegangen', 'geprüft', 'einspruch-eingelegt'], description: 'The bescheid-phase sub-state.' })
  status!: string

  @ApiProperty({ type: String, nullable: true, description: 'Bescheiddatum (ISO yyyy-mm-dd).' })
  assessmentDate!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Einspruch-Grund (closed set), null until filed.' })
  appealReason!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2026-07-03', description: 'The day the Einspruch was lodged (ISO), null until filed (ADR-0099 §8).' })
  appealDate!: string | null

  @ApiProperty({ type: String, nullable: true, enum: ['offen', 'stattgegeben', 'teilweise', 'abgelehnt', 'zurueckgenommen'], description: 'How the Einspruch ended; `offen` while undecided, null without an Einspruch.' })
  appealOutcome!: 'offen' | 'stattgegeben' | 'teilweise' | 'abgelehnt' | 'zurueckgenommen' | null

  @ApiProperty({ type: Number, nullable: true, example: 140, description: 'What the outcome changed the refund by, whole euros (negative = less); null when not given.' })
  appealOutcomeAmount!: number | null

  @ApiProperty({ type: [AssessmentFieldDto], description: 'The five figures, in paper order.' })
  fields!: AssessmentFieldDto[]

  @ApiProperty({ type: AssessmentComparisonDto, description: 'The Abgleich (Bescheid vs. berechnet).' })
  reconciliation!: AssessmentComparisonDto

  @ApiProperty({ type: AssessmentDeadlineDto, description: 'The § 355 AO Einspruchsfrist.' })
  frist!: AssessmentDeadlineDto

  @ApiProperty({ type: [String], description: 'The legal next sub-states (for the UI to offer only what is legal).' })
  nextStates!: string[]

  @ApiProperty({ type: [AssessmentFieldDto], description: 'Every Besteuerungsgrundlage of the Bescheid (core `ASSESSMENT_POSITIONS`, form order) with its capture state; `offen` = not read.' })
  positions!: AssessmentFieldDto[]

  @ApiProperty({ type: [String], description: 'The Finanzamt’s Erläuterungen as printed, one per paragraph.' })
  explanations!: string[]

  @ApiProperty({ type: AssessmentDiffDto, nullable: true, description: 'Erklärung ↔ Bescheid (ADR-0098 §8), the same diff the Verlauf shows; null without a version filed in the app or without Bescheid values.' })
  diff!: AssessmentDiffDto | null
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

  @ApiPropertyOptional({ type: String, example: '2026-07-03', description: 'The day the Einspruch was lodged (ISO yyyy-mm-dd); today when absent (ADR-0099 §8).' })
  @IsOptional()
  @IsString()
  date?: string
}

/** The PUT body for how an Einspruch ended (ADR-0099 §8). */
export class SetAppealOutcomeDto {
  @ApiProperty({ type: String, enum: ['offen', 'stattgegeben', 'teilweise', 'abgelehnt', 'zurueckgenommen'], description: 'The outcome (closed set).' })
  @IsString()
  outcome!: string

  @ApiPropertyOptional({ type: Number, nullable: true, example: 140, description: 'What it changed the refund by, whole euros (negative = less); null or absent when not known.' })
  @IsOptional()
  @IsInt()
  amount?: number | null
}
