import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  registerDecorator,
} from 'class-validator'
import {
  SCREENS,
  type AdvisorActionProposal,
  type AdvisorActionStatus,
  type AdvisorChatMessageView,
  type AdvisorLegalSource,
  type AdvisorLstbScanMeta,
  type AdvisorMessageMeta,
  type AdvisorTwoPathsProposal,
  type LstbExtractedFieldStatus,
  type LstbFieldReason,
  type OwlSourceId,
  type Screen,
} from '@steuereule/core'
import { OwlCardDto } from '../../owl-mode/dto/owl-mode.dto.js'

/** At most a handful of provenance keys, each mapped to a short string or null. */
function IsAcknowledgedValueMap(): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isAcknowledgedValueMap',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: 'acknowledgedCurrentValues must map up to 10 field keys to a string (max. 200) or null.' },
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined) return true
          if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
          const entries = Object.entries(value as Record<string, unknown>)
          return (
            entries.length <= 10 &&
            entries.every(([key, v]) => key.length <= 120 && (v === null || (typeof v === 'string' && v.length <= 200)))
          )
        },
      },
    })
  }
}

const OWL_SOURCE_IDS: readonly OwlSourceId[] = [
  'estg-4-5-6c',
  'estg-9-1',
  'estg-9-1-4a',
  'estg-9-1-6',
  'estg-9-4a',
  'estg-9-6',
  'estg-10b',
  'estg-10-1-5',
  'ao-355',
]

/** One summand of a scanned value: the certificate line and the amount printed there (#444). */
export class CalculationTermDto {
  @ApiProperty({ type: String, example: '23a' })
  line!: string

  @ApiProperty({ type: Number, example: 5051.76 })
  amount!: number
}

export class AdvisorLegalSourceDto implements AdvisorLegalSource {
  @ApiProperty({ type: String, enum: OWL_SOURCE_IDS, example: 'estg-9-1-4a' })
  sourceId!: OwlSourceId

  @ApiProperty({ type: String, example: '§ 9 Abs. 1 Nr. 4a EStG' })
  paragraph!: string

  @ApiProperty({ type: String, example: 'Reise- und Fahrtkosten bei Auswärtstätigkeit' })
  title!: string

  @ApiProperty({ type: String, example: 'Fahrten zu einer Fortbildungsstätte sind mit 0,30 € pro gefahrenem Kilometer absetzbar.' })
  summary!: string

  @ApiProperty({ type: String, example: '01.01.2025' })
  legalStatusDate!: string

  @ApiProperty({ type: String, example: 'https://www.gesetze-im-internet.de/estg/__9.html' })
  url!: string
}

export class AdvisorActionProposalDto implements AdvisorActionProposal {
  @ApiProperty({ type: String, example: 'act-1730970000' })
  actionId!: string

  @ApiProperty({
    type: String,
    enum: ['pending', 'applied', 'dismissed', 'superseded', 'undone'],
    example: 'pending',
  })
  status!: AdvisorActionStatus

  @ApiProperty({ type: String, enum: SCREENS, example: 'interview' })
  screen!: Screen

  @ApiProperty({ type: String, example: 'spenden-betrag' })
  field!: string

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  instance!: string | null

  @ApiPropertyOptional({ type: Object, additionalProperties: { type: 'string' } })
  companionFields?: Readonly<Record<string, string>> | undefined

  @ApiPropertyOptional({
    type: Object,
    additionalProperties: { type: 'string', nullable: true },
    description: 'Raw values of the companion fields when the draft was created (stale-check baseline).',
  })
  companionExpectedValues?: Readonly<Record<string, string | null>> | undefined

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'When the draft was last applied.' })
  appliedAt?: string | undefined

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'When the applied draft was last undone.' })
  undoneAt?: string | undefined

  @ApiProperty({ type: String, example: 'Spenden & Zuwendungen (Sonderausgaben)' })
  label!: string

  @ApiPropertyOptional({ type: String, nullable: true, example: '0 €' })
  previousValue!: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '0' })
  expectedPreviousValue?: string | null | undefined

  @ApiProperty({ type: String, example: '250' })
  newValue!: string

  @ApiProperty({ type: Number, example: 840 })
  beforeRefundEur!: number

  @ApiProperty({ type: Number, example: 925 })
  afterRefundEur!: number

  @ApiProperty({ type: Number, example: 85 })
  deltaEur!: number

  @ApiProperty({ type: String, example: 'Sonderausgabenabzug nach § 10b EStG.' })
  reason!: string

  @ApiProperty({ type: String, enum: OWL_SOURCE_IDS, example: 'estg-10b' })
  sourceId!: OwlSourceId

  @ApiPropertyOptional({ type: String, example: '§ 10b EStG' })
  paragraph?: string | undefined

  @ApiPropertyOptional({ type: String, example: 'beleg-123' })
  receiptId?: string | undefined

  @ApiPropertyOptional({ type: String, enum: ['ok', 'pruefen'], example: 'ok' })
  confidenceStatus?: LstbExtractedFieldStatus | undefined

  @ApiPropertyOptional({ type: [String], example: ['3'] })
  sourceLines?: readonly string[] | undefined

  @ApiPropertyOptional({ type: () => [CalculationTermDto] })
  calculation?: readonly CalculationTermDto[] | undefined

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['missing', 'unreadable', 'plausibility_conflict', 'partial_sv_lines', 'llm_suggested', 'ocr_source'],
    example: null,
  })
  fieldReason?: LstbFieldReason | null | undefined
}

export class AdvisorMaxPathProposalDto extends AdvisorActionProposalDto {
  @ApiProperty({
    type: String,
    example: 'Nachweis-Hinweis: Das Finanzamt kann eine kurze Bestätigung des Arbeitgebers anfordern.',
  })
  evidenceHint!: string
}

export class AdvisorTwoPathsProposalDto implements AdvisorTwoPathsProposal {
  @ApiProperty({ type: String, example: 'Zwei-Wege-Empfehlung: Homeoffice & Arbeitszimmer' })
  title!: string

  @ApiProperty({ type: AdvisorActionProposalDto })
  safePath!: AdvisorActionProposalDto

  @ApiProperty({ type: AdvisorMaxPathProposalDto })
  maxPath!: AdvisorMaxPathProposalDto

  @ApiProperty({ type: String, enum: OWL_SOURCE_IDS, example: 'estg-4-5-6c' })
  sourceId!: OwlSourceId
}

export class AdvisorLstbScanMetaDto implements AdvisorLstbScanMeta {
  @ApiProperty({ type: String, nullable: true, example: 'beleg-123' })
  receiptId!: string | null

  @ApiProperty({ type: String, enum: ['deterministic', 'llm_text_fallback'], example: 'deterministic' })
  stage!: 'deterministic' | 'llm_text_fallback'

  @ApiProperty({ type: Number, nullable: true, example: 2025 })
  taxYearOnDocument!: number | null

  @ApiPropertyOptional({ type: String, enum: ['A', 'B'], example: 'A' })
  person?: 'A' | 'B' | undefined

  @ApiProperty({ type: [String], example: ['act-1', 'act-2', 'act-3'] })
  actionIds!: readonly string[]
}

export class AdvisorMessageMetaDto implements AdvisorMessageMeta {
  @ApiPropertyOptional({ type: [String] })
  choices?: readonly string[] | undefined

  @ApiPropertyOptional({ type: AdvisorActionProposalDto })
  action?: AdvisorActionProposalDto | undefined

  @ApiPropertyOptional({ type: [AdvisorActionProposalDto] })
  actions?: readonly AdvisorActionProposalDto[] | undefined

  @ApiPropertyOptional({ type: AdvisorLstbScanMetaDto })
  lstbScan?: AdvisorLstbScanMetaDto | undefined

  @ApiPropertyOptional({ type: AdvisorTwoPathsProposalDto })
  twoPaths?: AdvisorTwoPathsProposalDto | undefined

  @ApiPropertyOptional({ type: [String], enum: OWL_SOURCE_IDS })
  sources?: readonly OwlSourceId[] | undefined
}

export class AdvisorChatMessageDto implements AdvisorChatMessageView {
  @ApiProperty({ type: String, example: 'msg-123' })
  id!: string

  @ApiProperty({ type: String, enum: ['user', 'assistant'], example: 'assistant' })
  role!: 'user' | 'assistant'

  @ApiProperty({ type: String, example: 'Ich habe deine Akte 2025 geprüft.' })
  content!: string

  @ApiPropertyOptional({ type: AdvisorMessageMetaDto, nullable: true })
  meta!: AdvisorMessageMetaDto | null

  @ApiProperty({ type: String, example: '2026-11-07T09:00:00.000Z' })
  createdAt!: string
}

export class AdvisorSessionResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  enabled!: boolean

  @ApiProperty({
    type: String,
    example: 'Hallo! Ich habe deine Akte 2025 durchgesehen. Wollen wir die offenen Punkte gemeinsam durchgehen?',
  })
  greeting!: string

  @ApiProperty({ type: [OwlCardDto] })
  openCards!: readonly OwlCardDto[]

  @ApiProperty({ type: [AdvisorChatMessageDto] })
  messages!: readonly AdvisorChatMessageDto[]

  @ApiProperty({ type: [String] })
  quickChips!: readonly string[]

  @ApiProperty({ type: [AdvisorLegalSourceDto] })
  legalSources!: readonly AdvisorLegalSourceDto[]
}

export class SendAdvisorMessageDto {
  @ApiProperty({ type: String, example: 'Ich hatte dieses Jahr eine Fortbildung.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string

  @ApiPropertyOptional({ type: String, enum: SCREENS, example: 'interview' })
  @IsOptional()
  @IsString()
  @IsIn(SCREENS)
  activeScreen?: Screen | undefined
}

export class SendAdvisorMessageResponseDto {
  @ApiProperty({ type: AdvisorChatMessageDto })
  userMessage!: AdvisorChatMessageDto

  @ApiProperty({ type: AdvisorChatMessageDto })
  assistantMessage!: AdvisorChatMessageDto

  @ApiProperty({
    enum: ['langgraph', 'deterministic_fallback'],
    description: 'deterministic_fallback means no model answered; the UI labels the reply as Basis-Modus.',
  })
  mode!: 'langgraph' | 'deterministic_fallback'
}

export class AdvisorActionMutationResponseDto {
  @ApiProperty({ type: AdvisorChatMessageDto })
  message!: AdvisorChatMessageDto

  @ApiProperty({ type: AdvisorActionProposalDto })
  action!: AdvisorActionProposalDto
}

export class ApplyBatchActionItemDto {
  @ApiProperty({ type: String, example: 'act-1730970000' })
  @IsString()
  @IsNotEmpty()
  actionId!: string

  @ApiPropertyOptional({
    description:
      'Re-baselines fields after a stale conflict: provenance key → the value the field holds now (from the 409 details). The write remains a compare-and-set.',
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: { 'commute.homeOfficeDays': '40' },
  })
  @IsOptional()
  @IsObject()
  @IsAcknowledgedValueMap()
  acknowledgedCurrentValues?: Record<string, string | null> | undefined
}

export class ApplyBatchActionsDto {
  @ApiProperty({ type: [ApplyBatchActionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ApplyBatchActionItemDto)
  drafts!: ApplyBatchActionItemDto[]
}

export class ApplyBatchActionsResponseDto {
  @ApiProperty({ type: [AdvisorActionProposalDto] })
  actions!: AdvisorActionProposalDto[]

  @ApiProperty({ type: [AdvisorChatMessageDto] })
  messages!: AdvisorChatMessageDto[]
}
