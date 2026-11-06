import { ApiProperty } from '@nestjs/swagger'
import { LstbFieldDto } from './lstb-feld.dto.js'
import { LstbStatusDto } from './lstb-zustand.dto.js'

/** The response shape for `GET /v1/steuerjahre/{jahr}/lstb` and the `PUT .../lstb/{feld}` response. */
export class LstbResponseDto {
  @ApiProperty({ type: LstbFieldDto })
  bruttoarbeitslohn!: LstbFieldDto

  @ApiProperty({ type: LstbFieldDto })
  lohnsteuer!: LstbFieldDto

  @ApiProperty({ type: LstbFieldDto })
  sozialversicherung!: LstbFieldDto

  @ApiProperty({ type: LstbStatusDto })
  state!: LstbStatusDto
}
