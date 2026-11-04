import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class StepDto {
  @ApiProperty({ type: String, enum: ['question', 'gate', 'done'], example: 'question' })
  kind!: 'question' | 'gate' | 'done'

  @ApiPropertyOptional({
    type: String,
    example: 'ausland',
    description: 'A packages/core StepId (question or gate id). Absent when kind is "done".',
  })
  id?: string
}
