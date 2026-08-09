// `type:` given explicitly on every @ApiProperty() — see PutProfileDto's comment for
// why (esbuild/tsx emit no `design:*` metadata, so @nestjs/swagger can't infer these).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Mirrors @steuereule/core's `Step` discriminated union
 * (`{kind:'question'|'gate', id} | {kind:'done'}`) with Swagger-visible properties.
 * Never re-derived — every value on the wire came straight from `nextStep()`.
 */
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
