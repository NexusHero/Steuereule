import { ApiProperty } from '@nestjs/swagger'

const POSITION_DESCRIPTION = 'A position id of the core catalogue `ASSESSMENT_POSITIONS` (e.g. `homeofficeA`, `zuVersteuerndesEinkommen`).'

/** One position of the Bescheid-Abgleich (ADR-0098 §8). */
export class AssessmentDiffRowDto {
  @ApiProperty({ type: String, example: 'homeofficeA', description: POSITION_DESCRIPTION })
  position!: string

  @ApiProperty({ type: String, example: 'Homeoffice-Pauschale' })
  label!: string

  @ApiProperty({ enum: ['own', 'followOn'], description: '`followOn` positions follow from the own ones and never count as a deviation.' })
  role!: 'own' | 'followOn'

  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true, description: 'Whose column of a joint Bescheid; null for the household.' })
  person!: 'A' | 'B' | null

  @ApiProperty({ type: Number, nullable: true, description: 'As declared in the frozen version (euros).' })
  declared!: number | null

  @ApiProperty({ type: Number, nullable: true, description: 'As assessed; null when not read.' })
  assessed!: number | null

  @ApiProperty({ type: Number, nullable: true, description: 'assessed − declared; null unless both are there.' })
  difference!: number | null

  @ApiProperty({ enum: ['same', 'deviation', 'not_read', 'not_declared'], description: '`not_read` is never 0 and never a deviation.' })
  status!: 'same' | 'deviation' | 'not_read' | 'not_declared'

  @ApiProperty({ type: String, nullable: true, description: 'The Finanzamt’s explanation, quoted from the Bescheid.' })
  explanation!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    example: '180 statt 210 Tage',
    description: 'A few words taken from the explanation by the core’s fixed patterns (`shortAssessmentReason`); null when none fits.',
  })
  shortReason!: string | null
}

export class AssessmentOwnDeviationDto extends AssessmentDiffRowDto {
  @ApiProperty({ type: Number, nullable: true, example: -56, description: 'Effect on the refund of setting only this position to the Bescheid’s value; null when not computable.' })
  refundEffect!: number | null
}

export class AssessmentDiffGroupDto {
  @ApiProperty({ enum: ['einkuenfte', 'werbungskostenA', 'werbungskostenB', 'vorsorge', 'steuer'] })
  group!: string

  @ApiProperty({ type: [AssessmentDiffRowDto] })
  rows!: AssessmentDiffRowDto[]
}

export class AssessmentFollowOnLinkDto {
  @ApiProperty({ type: String, example: 'zuVersteuerndesEinkommen' })
  position!: string

  @ApiProperty({ type: String, example: 'Zu versteuerndes Einkommen' })
  label!: string

  @ApiProperty({ type: Number, example: 300 })
  difference!: number
}

export class AssessmentDiffCountsDto {
  @ApiProperty({ type: Number }) positions!: number
  @ApiProperty({ type: Number }) same!: number
  @ApiProperty({ type: Number, description: 'Own deviations.' }) deviations!: number
  @ApiProperty({ type: Number }) notRead!: number
}

/** Erklärung ↔ Bescheid, computed by the core's `diffAssessment` (ADR-0098 §8). */
export class AssessmentDiffDto {
  @ApiProperty({ type: Number, example: 2024 })
  year!: number

  @ApiProperty({ enum: ['einzel', 'zusammen'] })
  filingType!: 'einzel' | 'zusammen'

  @ApiProperty({ type: [AssessmentDiffGroupDto], description: 'Every position in form order, grouped as the Bescheid groups them.' })
  groups!: AssessmentDiffGroupDto[]

  @ApiProperty({ type: [AssessmentOwnDeviationDto], description: 'What the Finanzamt changed, largest effect on the refund first.' })
  ownDeviations!: AssessmentOwnDeviationDto[]

  @ApiProperty({ type: [AssessmentFollowOnLinkDto], description: 'Summe Werbungskosten → zvE → Steuer → Erstattung, only the links that moved.' })
  followOnChain!: AssessmentFollowOnLinkDto[]

  @ApiProperty({ type: Number, nullable: true, example: -92, description: 'Assessed minus declared refund.' })
  totalRefundEffect!: number | null

  @ApiProperty({ type: Number, nullable: true, example: -94 })
  singleEffectsSum!: number | null

  @ApiProperty({ type: Boolean, description: 'The single effects do not add up to the total (the tax is not linear): say so.' })
  effectsDifferFromTotal!: boolean

  @ApiProperty({ type: [String], description: 'Explanations that name no position.' })
  generalExplanations!: string[]

  @ApiProperty({ type: AssessmentDiffCountsDto })
  counts!: AssessmentDiffCountsDto
}

export class LessonMaskDto {
  @ApiProperty({ enum: ['commute', 'interview'], description: 'The mask (`Screen`) the lesson shows at in the next open year.' })
  screen!: 'commute' | 'interview'

  @ApiProperty({ type: String, example: 'homeOfficeDays' })
  field!: string

  @ApiProperty({ type: String, example: 'Homeoffice' })
  label!: string
}

export class LessonRecognisedDto {
  @ApiProperty({ type: Number }) declared!: number
  @ApiProperty({ type: Number }) assessed!: number
  @ApiProperty({ type: Number }) difference!: number
}

export class LessonNextYearDto {
  @ApiProperty({ type: Number, example: 2025 })
  year!: number

  @ApiProperty({ enum: ['filed', 'answers'], description: '`filed`: the next year’s frozen version; `answers`: today’s answers, not yet filed.' })
  source!: 'filed' | 'answers'

  @ApiProperty({ type: Number, nullable: true, description: 'What the next year declares for the position; never an amount for its pending Bescheid.' })
  declared!: number | null

  @ApiProperty({ type: Boolean, nullable: true, description: 'It again declares more than this Bescheid recognised; null when it declares nothing.' })
  declaredAboveRecognised!: boolean | null
}

/** „Fürs nächste Mal“ (ADR-0098 §8), from the core's `assessmentLessons`. */
export class AssessmentLessonDto {
  @ApiProperty({ type: String, example: 'homeofficeA', description: POSITION_DESCRIPTION })
  position!: string

  @ApiProperty({ type: String })
  label!: string

  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true })
  person!: 'A' | 'B' | null

  @ApiProperty({ type: LessonRecognisedDto })
  recognised!: LessonRecognisedDto

  @ApiProperty({ type: LessonNextYearDto, nullable: true })
  nextYear!: LessonNextYearDto | null

  @ApiProperty({ type: String, nullable: true, description: 'From the fixed catalogue per position type; null without an entry.' })
  hint!: string | null

  @ApiProperty({ type: LessonMaskDto, nullable: true })
  mask!: LessonMaskDto | null
}
