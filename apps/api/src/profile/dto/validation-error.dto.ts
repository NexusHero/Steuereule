// `type` is given explicitly on every @ApiProperty() below rather than left to be
// inferred from `design:type` reflect-metadata: the toolchain (tsx/esbuild, Vitest)
// does not emit that metadata the way `tsc` does, so an inferred type silently
// resolves to nothing and @nestjs/swagger reports a spurious circular dependency.
import { ApiProperty } from '@nestjs/swagger'

export class ValidationFieldErrorDto {
  @ApiProperty({ type: String, example: 'steuerId' })
  field!: string

  @ApiProperty({ type: String, example: 'steuerId must be exactly 11 digits' })
  message!: string
}

/** Machine-readable 400 shape for an invalid PUT /v1/profile payload. */
export class ValidationErrorDto {
  @ApiProperty({ type: Number, example: 400 })
  statusCode!: number

  @ApiProperty({ type: String, example: 'Bad Request' })
  error!: string

  @ApiProperty({ type: [ValidationFieldErrorDto] })
  fields!: ValidationFieldErrorDto[]
}
