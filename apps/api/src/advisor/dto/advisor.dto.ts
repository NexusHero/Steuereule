import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
  registerDecorator,
} from 'class-validator'
import {
  ADVISOR_FEEDBACK_RATINGS,
  ADVISOR_SKILL_IDS,
  ADVISOR_FEEDBACK_REASONS,
  ADVISOR_MESSAGE_STATUSES,
  ADVISOR_QUICK_ACTIONS,
  SCREENS,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorMessageFeedback,
  type AdvisorMessageStatus,
  type AdvisorQuickAction,
  type AdvisorActionProposal,
  type AdvisorActionStatus,
  type AdvisorChatMessageView,
  type AdvisorLegalSource,
  type AdvisorLstbScanMeta,
  type AdvisorAnswerNotice,
  type AdvisorAnswerNoticeKind,
  type AdvisorContextLevel,
  type AdvisorConnection,
  type AdvisorConnectionState,
  type AdvisorEffectKind,
  type AdvisorModelFailure,
  type AdvisorModelFailureReason,
  type AdvisorNoteChange,
  type AdvisorNoteChangeKind,
  type AdvisorMessageMeta,
  type AdvisorNotStaged,
  type AdvisorQuestionRound,
  type AdvisorQuestionKind,
  ADVISOR_QUESTION_KINDS,
  type AdvisorRoundQuestion,
  type AdvisorSkillId,
  type AdvisorTwoPathsProposal,
  type LstbExtractedFieldStatus,
  type LstbFieldReason,
  type OwlSourceId,
  type Screen,
  ADVISOR_THOUGHT_STEP_KINDS,
  type AdvisorThoughtStep,
  type AdvisorThoughtStepKind,
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
  'estg-35a',
  'estg-10-1-3',
  'estg-33',
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

  @ApiPropertyOptional({
    type: String,
    enum: ['A', 'B'],
    example: 'B',
    description: 'Whose fields the draft writes in a joint return (ADR-0073): B is the spouse whose figures the user records. Absent means the user.',
  })
  person?: 'A' | 'B' | undefined

  @ApiPropertyOptional({ type: Object, additionalProperties: { type: 'string' } })
  companionFields?: Readonly<Record<string, string>> | undefined

  @ApiPropertyOptional({
    type: String,
    example: 'act-1730970000',
    description: 'Drafts sharing this group are alternatives (the two paths of a comparison): apply one, never several together.',
  })
  alternativeGroup?: string | undefined

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

  @ApiPropertyOptional({
    type: String,
    enum: ['computed', 'not-computable'],
    description: 'computed: the three euro figures come from the app\'s own estimate. not-computable: there is no figure, see effectHint. Absent: approximation.',
  })
  effect?: AdvisorEffectKind | undefined

  @ApiPropertyOptional({ type: String, description: 'Why the effect cannot be put in euros yet.' })
  effectHint?: string | undefined

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

export class AdvisorAnswerNoticeDto implements AdvisorAnswerNotice {
  @ApiProperty({ type: String, enum: ['unbacked-amount', 'claims-write', 'nothing-prepared', 'invented-source', 'out-of-scope'] })
  kind!: AdvisorAnswerNoticeKind

  @ApiProperty({ type: String, example: 'Die Eule trägt nichts selbst ein.' })
  text!: string

  @ApiPropertyOptional({ type: [Number], description: 'For unbacked-amount: the amounts the app did not work out.' })
  amounts?: readonly number[] | undefined
}

export class AdvisorNoteChangeDto implements AdvisorNoteChange {
  @ApiProperty({ type: String, enum: ['added', 'replaced', 'removed'] })
  kind!: AdvisorNoteChangeKind

  @ApiPropertyOptional({ type: String })
  noteId?: string | undefined

  @ApiProperty({ type: String, description: 'The text after the change; for a removed note, the text that went.' })
  text!: string

  @ApiPropertyOptional({ type: String, description: 'What a replaced note said before.' })
  previousText?: string | undefined

  @ApiPropertyOptional({ type: Boolean, description: 'True once the user took the change back.' })
  undone?: true | undefined
}

export class AdvisorModelFailureDto implements AdvisorModelFailure {
  @ApiProperty({ type: String, enum: ['not-configured', 'quota', 'unavailable', 'timeout', 'network', 'blocked', 'unknown'] })
  reason!: AdvisorModelFailureReason

  @ApiPropertyOptional({ type: String, description: 'Provider and HTTP status, e.g. "Gemini · HTTP 429". Never message text.' })
  detail?: string | undefined
}

export class AdvisorConnectionDto implements AdvisorConnection {
  @ApiProperty({ type: String, enum: ['connected', 'degraded', 'unavailable', 'rules-only'] })
  state!: AdvisorConnectionState

  @ApiProperty({ type: String, nullable: true, example: 'Gemini' })
  provider!: string | null

  @ApiProperty({ type: String, nullable: true, example: 'gemini-3.8-flash' })
  model!: string | null

  @ApiPropertyOptional({ type: () => AdvisorModelFailureDto, description: 'Why it is not connected, or only degraded.' })
  failure?: AdvisorModelFailureDto | undefined

  @ApiProperty({ type: String, format: 'date-time' })
  checkedAt!: string
}

export class AdvisorNotStagedDto implements AdvisorNotStaged {
  @ApiProperty({ type: String, example: 'Mieteinnahmen' })
  label!: string

  @ApiProperty({ type: String, example: 'Es gibt noch kein Vermietungsobjekt.' })
  reason!: string

  @ApiPropertyOptional({ type: String, description: 'The mask where the user can enter it by hand.', example: 'vermietung' })
  screen?: Screen | undefined
}

export class AdvisorRoundQuestionDto implements AdvisorRoundQuestion {
  @ApiProperty({ type: String })
  text!: string

  @ApiProperty({ type: [String] })
  options!: readonly string[]

  @ApiPropertyOptional({ type: String, enum: ADVISOR_QUESTION_KINDS, description: '`fact` gets no recommendation; `decision` does, with a reason. Missing on older rounds: read as fact.' })
  kind?: AdvisorQuestionKind | undefined

  @ApiPropertyOptional({ type: Boolean, description: 'More than one answer may be ticked.' })
  multiple?: boolean | undefined

  @ApiPropertyOptional({ type: String, description: 'The owl\'s pick, only on a decision.' })
  recommended?: string | undefined

  @ApiPropertyOptional({ type: String, description: 'Why she recommends it, one short sentence.' })
  reason?: string | undefined
}

export class AdvisorQuestionRoundDto implements AdvisorQuestionRound {
  @ApiProperty({ type: () => [AdvisorRoundQuestionDto] })
  questions!: readonly AdvisorRoundQuestionDto[]
}

export class AdvisorThoughtStepDto implements AdvisorThoughtStep {
  @ApiProperty({ type: String, enum: ADVISOR_THOUGHT_STEP_KINDS })
  kind!: AdvisorThoughtStepKind

  @ApiProperty({ type: String, example: 'Prüfe EStG-Paragraph …' })
  label!: string

  @ApiPropertyOptional({ type: String, description: 'The tool that ran, for its icon; only on tool steps.' })
  tool?: string | undefined

  @ApiPropertyOptional({ type: String, example: '§ 4 Abs. 5 Nr. 6c EStG', description: 'What the tool found, without personal data.' })
  result?: string | undefined

  @ApiPropertyOptional({ type: Boolean, description: 'False when the tool refused.' })
  ok?: boolean | undefined
}

export class AdvisorOpeningMarkerDto {
  @ApiProperty({ type: String, description: 'Fingerprint of what the owl knew about the year when it opened (ADR-0067 §11).' })
  fingerprint!: string

  @ApiProperty({ type: String, enum: ['partial', 'ready'] })
  stage!: 'partial' | 'ready'
}

export class AdvisorOpeningLastDto {
  @ApiProperty({ type: String })
  conversationId!: string

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string
}

export class AdvisorOpeningStateDto {
  @ApiProperty({ type: String, enum: ['empty', 'partial', 'ready'], description: 'What the app knows about the year: nothing, not enough for an analysis, or enough.' })
  stage!: 'empty' | 'partial' | 'ready'

  @ApiProperty({ type: Boolean, description: 'True when a new conversation should open with the owl speaking first: something is entered and it changed since the last opening.' })
  shouldOpen!: boolean

  @ApiPropertyOptional({ type: () => AdvisorOpeningLastDto, nullable: true, description: 'The last opening of this year, to link to when nothing changed.' })
  lastOpening!: AdvisorOpeningLastDto | null
}

export class AdvisorMessageMetaDto implements AdvisorMessageMeta {
  @ApiPropertyOptional({ type: () => AdvisorOpeningMarkerDto, description: 'Both messages of an opening carry it; the user message is a hidden placeholder.' })
  opening?: AdvisorOpeningMarkerDto | undefined

  @ApiPropertyOptional({ type: [String] })
  choices?: readonly string[] | undefined

  @ApiPropertyOptional({ type: [String], description: 'Steps the owl reported while working on this answer (#476).' })
  steps?: readonly string[] | undefined

  @ApiPropertyOptional({
    type: () => [AdvisorThoughtStepDto],
    description: 'The steps with their kind and what each tool found; replaces steps on new answers.',
  })
  thoughtSteps?: readonly AdvisorThoughtStepDto[] | undefined

  @ApiPropertyOptional({
    type: () => [AdvisorNotStagedDto],
    description: 'Drafts the owl tried to prepare in this answer and could not, with the reason (ADR-0066).',
  })
  notStaged?: readonly AdvisorNotStagedDto[] | undefined

  @ApiPropertyOptional({
    type: () => [AdvisorAnswerNoticeDto],
    description: 'What the check of the finished answer found: a figure the app did not compute, a claim to have written something, an unknown source (ADR-0066).',
  })
  notices?: readonly AdvisorAnswerNoticeDto[] | undefined

  @ApiPropertyOptional({
    type: () => [AdvisorNoteChangeDto],
    description: 'What the owl changed in the project notes in this answer; each change can be undone (#481).',
  })
  noteChanges?: readonly AdvisorNoteChangeDto[] | undefined

  @ApiPropertyOptional({ type: [String], description: 'Additions to the description of the situation the owl suggests; taken over with a tap (#501).' })
  situationSuggestions?: readonly string[] | undefined

  @ApiPropertyOptional({ type: () => AdvisorQuestionRoundDto, description: 'A round of questions with answers to tap, from the interview skill (#495).' })
  questionRound?: AdvisorQuestionRoundDto | undefined

  @ApiPropertyOptional({ type: Boolean, description: 'Turbo mode: the owl applied the drafts of this answer itself; each can be undone.' })
  turbo?: true | undefined

  @ApiPropertyOptional({
    type: () => AdvisorModelFailureDto,
    description: 'Why the language model did not answer this turn, when it did not (#487): the answer then comes from fixed rules or is missing.',
  })
  modelFailure?: AdvisorModelFailureDto | undefined

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

export class AdvisorMessageFeedbackDto implements AdvisorMessageFeedback {
  @ApiProperty({ type: String, enum: ADVISOR_FEEDBACK_RATINGS })
  rating!: AdvisorFeedbackRating

  @ApiPropertyOptional({ type: String, enum: ADVISOR_FEEDBACK_REASONS })
  reason?: AdvisorFeedbackReason | undefined
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

  @ApiPropertyOptional({
    type: String,
    enum: ADVISOR_MESSAGE_STATUSES,
    description: 'Lifecycle of the message (#476). An aborted or failed answer keeps its partial text and carries no proposal.',
  })
  status?: AdvisorMessageStatus | undefined

  @ApiPropertyOptional({ type: String, description: 'Reasoning summary of the provider; considerations of the model, not advice.' })
  reasoning?: string | undefined

  @ApiPropertyOptional({ type: () => AdvisorMessageFeedbackDto, nullable: true })
  feedback?: AdvisorMessageFeedbackDto | null | undefined

  @ApiPropertyOptional({ type: String, description: 'Present while status is streaming: the run to re-attach to.' })
  runId?: string | undefined

  @ApiPropertyOptional({ type: Number, description: 'How long the owl worked on a finished answer, in milliseconds.' })
  durationMs?: number | undefined
}

export class SetAdvisorFeedbackDto {
  @ApiProperty({ type: String, enum: ADVISOR_FEEDBACK_RATINGS, nullable: true, description: 'null removes the rating.' })
  @ValidateIf((_object, value) => value !== null)
  @IsIn(ADVISOR_FEEDBACK_RATINGS)
  rating!: AdvisorFeedbackRating | null

  @ApiPropertyOptional({ type: String, enum: ADVISOR_FEEDBACK_REASONS, description: 'Only kept with a thumbs down.' })
  @IsOptional()
  @IsIn(ADVISOR_FEEDBACK_REASONS)
  reason?: AdvisorFeedbackReason | undefined
}

export class AdvisorConversationDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String, nullable: true, description: 'From the first question; null while nothing has been asked.', example: 'Lohnt sich mein Arbeitsweg?' })
  title!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string

  @ApiProperty({ type: String, format: 'date-time' })
  lastUsedAt!: string

  @ApiProperty({ type: Boolean, description: 'An answer is being written in this conversation right now; several conversations can answer at the same time (#503).' })
  answering!: boolean
}

export class AdvisorProjectDto {
  @ApiProperty({ type: Number, example: 2025, description: 'The tax year is the project.' })
  taxYear!: number

  @ApiProperty({ type: () => [AdvisorConversationDto], description: 'The conversations of that year, most recently used first.' })
  conversations!: readonly AdvisorConversationDto[]
}

export class AdvisorNoteDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String, example: 'Arbeitszimmer geprüft: lohnt sich nicht, weil kein eigener Raum.' })
  text!: string

  @ApiProperty({ type: String, enum: ['owl', 'user'], description: 'Who wrote the current text.' })
  author!: 'owl' | 'user'

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string
}

export class DeleteAdvisorNoteResponseDto {
  @ApiProperty({ type: Boolean })
  deleted!: true
}

export class AdvisorSituationDto {
  @ApiProperty({ type: String, description: 'The user’s own description of the household’s situation; empty while nothing was written (#501).' })
  text!: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null
}

export class SaveAdvisorSituationDto {
  @ApiProperty({ type: String, maxLength: 1500, description: 'Empty clears the description.' })
  @IsString()
  @MaxLength(3000)
  text!: string
}

export class SaveAdvisorNoteDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  text!: string
}

export class AdvisorSearchHitDto {
  @ApiProperty({ type: String })
  conversationId!: string

  @ApiProperty({ type: String, nullable: true })
  conversationTitle!: string | null

  @ApiPropertyOptional({ type: String, description: 'Absent when only the title of the conversation matched.' })
  messageId?: string | undefined

  @ApiPropertyOptional({ type: String, enum: ['user', 'assistant'] })
  role?: 'user' | 'assistant' | undefined

  @ApiProperty({ type: String, description: 'The matching passage with some text around it.' })
  snippet!: string

  @ApiProperty({ type: String, format: 'date-time' })
  at!: string
}

export class AdvisorContextDto {
  @ApiProperty({ type: Number, description: 'Estimated tokens of the summary so far plus every message since.' })
  usedTokens!: number

  @ApiProperty({ type: Number })
  maxTokens!: number

  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  percent!: number

  @ApiProperty({ type: String, enum: ['ok', 'warn', 'full'], description: 'warn: will be summarised soon. full: summarised before the next answer.' })
  level!: AdvisorContextLevel

  @ApiPropertyOptional({ type: String, description: 'What the summarised part of the conversation said.' })
  summary?: string | undefined

  @ApiPropertyOptional({ type: String, description: 'The last message the summary covers; the chat draws its dividing line after it.' })
  summarizedUntilMessageId?: string | undefined

  @ApiProperty({ type: Boolean, description: 'False while there is too little to summarise.' })
  canSummarize!: boolean
}

export class RenameAdvisorConversationDto {
  @ApiProperty({ type: String, example: 'Vermietung Musterstraße' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string
}

export class ClearAdvisorConversationResponseDto {
  @ApiProperty({ type: Number, example: 12 })
  deletedMessages!: number
}

export class StopAdvisorRunResponseDto {
  @ApiProperty({ type: Boolean, description: 'false when the run had already ended.' })
  stopped!: boolean
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

  @ApiProperty({ type: String, description: 'The conversation these messages belong to (#481).' })
  conversationId!: string

  @ApiProperty({ type: () => [AdvisorConversationDto], description: 'Every conversation of this tax year, most recently used first.' })
  conversations!: readonly AdvisorConversationDto[]

  @ApiProperty({ type: () => [AdvisorProjectDto], description: 'Every tax year with its conversations, newest year first; the list of the sidebar (#503).' })
  projects!: readonly AdvisorProjectDto[]

  @ApiProperty({ type: () => AdvisorContextDto, description: 'How full the context of this conversation is (#481).' })
  context!: AdvisorContextDto

  @ApiProperty({ type: () => [AdvisorNoteDto], description: 'The project notes of this tax year; every conversation reads them.' })
  notes!: readonly AdvisorNoteDto[]

  @ApiProperty({ type: () => AdvisorSituationDto, description: 'The user’s own description of the situation; applies in every conversation of every year (#501).' })
  situation!: AdvisorSituationDto

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

  @ApiPropertyOptional({ type: String, enum: ADVISOR_SKILL_IDS, description: 'A skill the user switched on for this message (#495).' })
  @IsOptional()
  @IsIn(ADVISOR_SKILL_IDS)
  skill?: AdvisorSkillId | undefined

  @ApiPropertyOptional({ type: Boolean, description: 'Turbo mode: the owl applies the drafts of this answer itself instead of waiting for a click. Off by default.' })
  @IsOptional()
  @IsBoolean()
  turbo?: boolean | undefined

  @ApiPropertyOptional({
    type: String,
    enum: ADVISOR_QUICK_ACTIONS,
    description: 'Quick start that shapes the turn: forgotten_check always opens with a visible plan (#451).',
  })
  @IsOptional()
  @IsIn(ADVISOR_QUICK_ACTIONS)
  quickAction?: AdvisorQuickAction | undefined

  @ApiPropertyOptional({
    type: String,
    description:
      'Regenerate or edit-and-resend (#451): the id of the latest user message. That turn is replaced; its pending proposals are dismissed, never applied.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  replaceFromMessageId?: string | undefined

  @ApiPropertyOptional({
    type: String,
    description: 'The conversation the question belongs to (#481). Without it: the one used last in this tax year.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string | undefined
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
