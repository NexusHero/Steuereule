import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { LstbConflictDto } from './lstb-widerspruch.dto.js'

/** The derived LStB mask state. */
export class LstbStatusDto {
  @ApiProperty({ type: String, enum: ['unvollstaendig', 'widerspruch', 'vollstaendig'], example: 'unvollstaendig' })
  kind!: 'unvollstaendig' | 'widerspruch' | 'vollstaendig'

  @ApiPropertyOptional({ type: [String], description: 'Fields not yet reached (only when kind is unvollstaendig).' })
  open?: string[]

  @ApiPropertyOptional({ type: [String], description: 'Fields looked at but unreadable (only when kind is unvollstaendig).' })
  unclear?: string[]

  @ApiPropertyOptional({ type: [LstbConflictDto], description: 'The named contradictions (only when kind is widerspruch).' })
  conflicts?: LstbConflictDto[]

  @ApiPropertyOptional({ type: Number, description: 'Bruttoarbeitslohn, whole euros (only when kind is vollstaendig).' })
  bruttoarbeitslohn?: number

  @ApiPropertyOptional({ type: Number, description: 'Einbehaltene Lohnsteuer, whole euros (only when kind is vollstaendig).' })
  lohnsteuer?: number

  @ApiPropertyOptional({ type: Number, description: 'SV-Arbeitnehmeranteil, whole euros (only when kind is vollstaendig).' })
  sozialversicherung?: number
}
