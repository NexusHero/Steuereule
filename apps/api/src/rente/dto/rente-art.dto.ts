// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'

/** The PUT body for choosing the Rentenart (null clears the choice). */
export class PutRentenartDto {
  @ApiProperty({
    type: String,
    enum: ['GesetzlicheRente', 'Betriebsrente', 'PrivateRentenversicherung', 'WitwenWaisenrente', 'AuslaendischeRente'],
    nullable: true,
    example: 'GesetzlicheRente',
    description: 'One of the five Rentenarten (product ADR-036 §3), or null to clear.',
  })
  @IsOptional()
  @IsIn(['GesetzlicheRente', 'Betriebsrente', 'PrivateRentenversicherung', 'WitwenWaisenrente', 'AuslaendischeRente'])
  art?: string | null
}
