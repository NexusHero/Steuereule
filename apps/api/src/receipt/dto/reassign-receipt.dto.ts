import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { HOLDER_REF_PATTERN, ParseReceiptResponseDto } from './parse-receipt.dto.js'

/** „für: <Name>“ tapped and another person chosen (ADR-0092 §4). */
export class ReassignReceiptDto {
  @ApiProperty({ type: Number, example: 2025 })
  @IsInt()
  @Min(2020)
  @Max(2030)
  taxYear!: number

  @ApiProperty({ type: String, example: 'B', description: 'The new holder: `A`, `B` or `kind:<child id>`.' })
  @IsString()
  @Matches(HOLDER_REF_PATTERN)
  holder!: string

  @ApiPropertyOptional({
    type: String,
    description: 'The document text, read again on the device, so its values can be read for the new holder. Without it the values are only taken back.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  rawText?: string

  @ApiPropertyOptional({ type: String, enum: ['pdf_text', 'ocr'], example: 'pdf_text' })
  @IsOptional()
  @IsIn(['pdf_text', 'ocr'])
  textSource?: 'pdf_text' | 'ocr'
}

export class ReassignReceiptResponseDto {
  @ApiProperty({ type: [String], example: ['B'], description: 'Whose the document is now, the holder first.' })
  holders!: string[]

  @ApiProperty({ type: Number, example: 3, description: 'Values taken back at the person before (only those still as the document wrote them).' })
  takenBack!: number

  @ApiProperty({ type: Number, example: 3, description: 'Values written for the new holder right away.' })
  applied!: number

  @ApiProperty({ type: Number, example: 0, description: 'Drafts waiting for the user: „zusätzlich oder ersetzen?“ or a value to check.' })
  waiting!: number

  @ApiProperty({ type: ParseReceiptResponseDto, nullable: true, description: 'The document read for the new holder; null without `rawText`.' })
  parse!: ParseReceiptResponseDto | null
}
