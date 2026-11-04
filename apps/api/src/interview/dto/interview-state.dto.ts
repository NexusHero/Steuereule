import { ApiProperty } from '@nestjs/swagger'
import { StepDto } from './step.dto.js'

/** The response shape for `GET /v1/steuerjahre/{jahr}/interview`. */
export class InterviewStateDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { job: 'Angestellt', ausland: 'Nein' },
    description:
      'Every stored answer/gate-acknowledgement so far, keyed by question/gate id (packages/core StepId). Empty object for a tax year with nothing answered yet.',
  })
  answers!: Record<string, string>

  @ApiProperty({ type: StepDto, description: '@steuereule/core’s nextStep(answers) — never recomputed elsewhere.' })
  nextStep!: StepDto

  @ApiProperty({
    type: Number,
    example: 2,
    description: 'Questions still to answer — @steuereule/core’s remainingSteps(answers).',
  })
  openItems!: number
}
