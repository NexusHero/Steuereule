import { ApiProperty } from '@nestjs/swagger'
import { LstbFieldDto } from './lstb-field.dto.js'
import { LstbStatusDto } from './lstb-state.dto.js'

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
