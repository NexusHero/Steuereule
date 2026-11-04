import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { LstbWiderspruchDto } from './lstb-widerspruch.dto.js'

/** The derived LStB mask state. */
export class LstbZustandDto {
  @ApiProperty({ type: String, enum: ['unvollstaendig', 'widerspruch', 'vollstaendig'], example: 'unvollstaendig' })
  kind!: 'unvollstaendig' | 'widerspruch' | 'vollstaendig'

  @ApiPropertyOptional({ type: [String], description: 'Fields not yet reached (only when kind is unvollstaendig).' })
  offen?: string[]

  @ApiPropertyOptional({ type: [String], description: 'Fields looked at but unreadable (only when kind is unvollstaendig).' })
  unklar?: string[]

  @ApiPropertyOptional({ type: [LstbWiderspruchDto], description: 'The named contradictions (only when kind is widerspruch).' })
  widersprueche?: LstbWiderspruchDto[]

  @ApiPropertyOptional({ type: Number, description: 'Bruttoarbeitslohn, whole euros (only when kind is vollstaendig).' })
  bruttoarbeitslohn?: number

  @ApiPropertyOptional({ type: Number, description: 'Einbehaltene Lohnsteuer, whole euros (only when kind is vollstaendig).' })
  lohnsteuer?: number

  @ApiPropertyOptional({ type: Number, description: 'SV-Arbeitnehmeranteil, whole euros (only when kind is vollstaendig).' })
  sozialversicherung?: number
}
