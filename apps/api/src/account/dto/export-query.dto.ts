import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'

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
