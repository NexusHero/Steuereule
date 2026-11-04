import { ApiProperty } from '@nestjs/swagger'
import { LstbFeldDto } from './lstb-feld.dto.js'
import { LstbZustandDto } from './lstb-zustand.dto.js'

/** The response shape for `GET /v1/steuerjahre/{jahr}/lstb` and the `PUT .../lstb/{feld}` response. */
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
