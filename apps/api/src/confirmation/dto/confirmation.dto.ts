import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ANNEXES, SCREENS } from '@steuereule/core'
import { ASSISTANT_TASK_DECISIONS, ASSISTANT_TASK_KINDS, type AssistantTaskDecision, type AssistantTaskKind } from '../../assistant-task/assistant-task.repository.js'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'

export class ProvenanceDto {
  @ApiProperty({ type: String, enum: ['nutzer', 'uebernahme', 'assistent', 'beleg'], example: 'assistent' })
  kind!: 'nutzer' | 'uebernahme' | 'assistent' | 'beleg'

  @ApiPropertyOptional({ type: String, example: 'Claude', description: 'Name des Assistenten (art = assistent).' })
  name?: string

  @ApiPropertyOptional({ type: String, description: 'Der Beleg, aus dem der Wert stammt.' })
  receiptId?: string

  @ApiPropertyOptional({ type: Number, example: 2024, description: 'Quelljahr der Jahresübernahme (art = uebernahme).' })
  lastYear?: number
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

  @ApiProperty({ type: String, nullable: true, example: 'Mia', description: 'Which record the value belongs to, as the user knows it: the child’s first name, the object’s address. Null without an instance or without a name.' })
  instanceLabel!: string | null

  @ApiProperty({ type: String, description: 'What the user is shown of this value; confirming an Anlage sends it back (MCP-4).' })
  version!: string

  @ApiProperty({ type: String, example: 'bruttoarbeitslohn' })
  field!: string

  @ApiProperty({ type: String, nullable: true, example: '4750', description: 'Der aktuell gespeicherte Feld-Wert (null = offen, "unklar").' })
  value!: string | null

  @ApiProperty({ type: ProvenanceDto })
  provenance!: ProvenanceDto

  @ApiProperty({ type: Boolean })
  confirmed!: boolean

  @ApiProperty({ type: ProposalDto, nullable: true })
  proposal!: ProposalDto | null

  @ApiPropertyOptional({ type: String, enum: ['B'], description: 'Set when the value belongs to Person B, whose figures the user records (ADR-0054).' })
  person?: 'B'
}

export class AnnexConfirmationDto {
  @ApiProperty({ type: String, enum: ANNEXES, example: 'anlageN' })
  annex!: (typeof ANNEXES)[number]

  @ApiProperty({ type: Number, description: 'Wie viele Werte dieser Anlage noch unbestätigt sind.' })
  unconfirmed!: number

  @ApiProperty({ type: [FieldProvenanceDto] })
  values!: FieldProvenanceDto[]
}

/** A task the user's own assistant left for the user (#547); `text` is plain text, never markup. */
export class AssistantTaskDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String, enum: ASSISTANT_TASK_KINDS, example: 'konfession' })
  kind!: AssistantTaskKind

  @ApiProperty({ type: String, example: 'Bitte trage deine Konfession in den Stammdaten ein.', description: 'Written by the assistant; show as plain text only.' })
  text!: string

  @ApiProperty({ type: String, example: 'Claude', description: 'Name of the assistant that left the task.' })
  assistant!: string

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string
}

/** Was der Nutzer noch prüfen muss: je Anlage die unbestätigten Werte und offenen Vorschläge, dazu die offenen Aufgaben. */
export class ConfirmationResponseDto {
  @ApiProperty({ type: [AnnexConfirmationDto] })
  annexes!: AnnexConfirmationDto[]

  @ApiProperty({ type: [AssistantTaskDto], description: 'The open tasks the user\'s assistant left for this tax year.' })
  tasks!: AssistantTaskDto[]
}

export class TaskDecisionDto {
  @ApiProperty({ type: String, enum: ASSISTANT_TASK_DECISIONS })
  @IsIn(ASSISTANT_TASK_DECISIONS)
  decision!: AssistantTaskDecision
}

export class ShownValueDto {
  @ApiProperty({ type: String, example: 'lstb.bruttoarbeitslohn' })
  @IsString()
  @MaxLength(200)
  key!: string

  @ApiProperty({ type: String, description: 'The `version` of the value as the overview gave it.' })
  @IsString()
  @MaxLength(64)
  version!: string

  @ApiPropertyOptional({ type: String, enum: ['B'], description: 'Set for a value of Person B, as in the overview.' })
  @IsOptional()
  @IsIn(['B'])
  person?: 'B'
}

/** The unconfirmed values of the Anlage the user was shown; confirming binds to exactly these (MCP-4). */
export class ConfirmAnnexDto {
  @ApiProperty({ type: [ShownValueDto] })
  @IsArray()
  @ArrayMaxSize(2_000)
  @ValidateNested({ each: true })
  @Type(() => ShownValueDto)
  values!: ShownValueDto[]
}

export class ProposalDecisionDto {
  @ApiProperty({ type: String, enum: ['annehmen', 'verwerfen'] })
  @IsIn(['annehmen', 'verwerfen'])
  decision!: 'annehmen' | 'verwerfen'

  @ApiPropertyOptional({ type: String, enum: ['A', 'B'], description: 'Whose proposal: B for a value of Person B the user records. Default A.' })
  @IsOptional()
  @IsIn(['A', 'B'])
  person?: 'A' | 'B'
}
