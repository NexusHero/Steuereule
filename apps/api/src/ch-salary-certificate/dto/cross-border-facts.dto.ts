import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, Max, Min } from 'class-validator'

/**
 * Person B's own Grenzgänger questions (residence, days without return), when the user records B's
 * figures. The user answers them in the interview; B, who answers no interview, here (escalation case).
 */
export class PutCrossBorderFactsDto {
  @ApiProperty({ enum: ['Deutschland', 'Schweiz'], description: 'Where Person B lives.' })
  @IsIn(['Deutschland', 'Schweiz'])
  residence!: 'Deutschland' | 'Schweiz'

  @ApiProperty({ type: Number, example: 0, description: 'Working days Person B did not return home (Nichtrückkehrtage).' })
  @IsInt()
  @Min(0)
  @Max(365)
  daysWithoutReturn!: number
}
