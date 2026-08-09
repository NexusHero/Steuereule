// `type:`/explicit classes throughout — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

/**
 * Request body for `POST /v1/steuerjahre/{jahr}/interview/antworten` (#318). Only
 * shape-validated here (non-empty strings) — `questionId` is deliberately NOT
 * whitelisted against a second, hand-maintained id list: the graph in
 * packages/core/src/interview.ts (ADR-0033) is the one and only source of which ids
 * exist, and InterviewService's isReachable()/isValidAnswer() calls are what actually
 * admit or reject a given (questionId, value) pair (#318 P2). Duplicating that id set
 * here would be exactly the two-copies drift ADR-0033 exists to prevent.
 */
export class PostAnswerDto {
  @ApiProperty({
    type: String,
    example: 'job',
    description: 'A question or gate id from the graph (packages/core/src/interview.ts) — validated server-side.',
  })
  @IsString()
  @IsNotEmpty()
  questionId!: string

  @ApiProperty({
    type: String,
    example: 'Angestellt',
    description: "The answer value — validated server-side against this step's own allowed set.",
  })
  @IsString()
  @IsNotEmpty()
  value!: string
}
