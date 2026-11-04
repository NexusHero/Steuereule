import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

/** Request body for `POST /v1/steuerjahre/{jahr}/interview/antworten`. */
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
