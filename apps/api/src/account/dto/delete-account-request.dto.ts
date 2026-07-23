// `type: String`/explicit literals given on every @ApiProperty() below — see the
// comment in validation-error.dto.ts for why we don't rely on inferred design:type
// metadata (esbuild/tsx never emit it).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Equals, IsOptional, IsString, MinLength } from 'class-validator'

export class DeleteAccountRequestDto {
  @ApiProperty({
    type: Boolean,
    enum: [true],
    example: true,
    description: 'Explicit confirmation — must be exactly `true`. The mandatory pre-delete export offer and Löschschutz warning are a frontend/UX concern; this is the server-side confirmation gate.',
  })
  @Equals(true)
  confirm!: true

  @ApiPropertyOptional({
    type: String,
    description:
      'Required only when the caller’s current session is not fresh enough (ADR-0013 §6) — ' +
      're-verified via better-auth’s own password check, never a second hand-rolled one.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string
}
