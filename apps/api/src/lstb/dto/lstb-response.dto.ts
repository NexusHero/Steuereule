// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'
import { LstbFeldDto } from './lstb-feld.dto.js'
import { LstbZustandDto } from './lstb-zustand.dto.js'

/**
 * The response shape for `GET /v1/steuerjahre/{jahr}/lstb` and the `PUT .../lstb/{feld}`
 * response (re-entry, ADR-036): the three field states plus the derived `zustand`, so a
 * client reloading mid-mask resumes without re-deriving anything itself. Every value came
 * straight from @steuereule/core (`deserialisiereLstbFeld` + `lstbZustand`), never
 * recomputed in the API — the same "server decides what's true" seam as the interview.
 */
export class LstbResponseDto {
  @ApiProperty({ type: LstbFeldDto })
  bruttoarbeitslohn!: LstbFeldDto

  @ApiProperty({ type: LstbFeldDto })
  lohnsteuer!: LstbFeldDto

  @ApiProperty({ type: LstbFeldDto })
  sozialversicherung!: LstbFeldDto

  @ApiProperty({ type: LstbZustandDto })
  zustand!: LstbZustandDto
}
