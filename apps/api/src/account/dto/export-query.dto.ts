import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'

/** ADR-0013 §Contract: `?format=` chosen over `Accept` content-negotiation because a
 *  browser file-download `<a href>` cannot reliably set an `Accept` header. */
export const EXPORT_FORMATS = ['json', 'pdf'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export class ExportQueryDto {
  @ApiPropertyOptional({
    type: String,
    enum: EXPORT_FORMATS,
    default: 'json',
    description: 'The export representation — defaults to json when omitted.',
  })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: ExportFormat
}
