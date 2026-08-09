import { ApiProperty } from '@nestjs/swagger'
import { StepDto } from './step.dto.js'

/** Response shape for `POST /v1/steuerjahre/{jahr}/interview/antworten` (#318). */
export class PostAnswerResponseDto {
  @ApiProperty({ type: StepDto, description: '@steuereule/core’s nextStep(answers) after this write.' })
  nextStep!: StepDto

  @ApiProperty({
    type: Number,
    example: 1,
    description: 'Questions still to answer after this write — @steuereule/core’s remainingSteps(answers).',
  })
  openItems!: number
}
