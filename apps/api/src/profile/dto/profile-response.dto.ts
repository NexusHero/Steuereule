import { ApiProperty } from '@nestjs/swagger'

/** The one response shape for both GET and PUT /v1/profile. */
export class ProfileResponseDto {
  @ApiProperty({ type: String, nullable: true, example: 'Anna' })
  firstName!: string | null

  @ApiProperty({ type: String, nullable: true, example: 'Beispiel' })
  lastName!: string | null

  @ApiProperty({ type: String, nullable: true, example: '02476291358' })
  steuerId!: string | null

  @ApiProperty({ type: String, nullable: true, example: '18181508155' })
  steuernummer!: string | null
}
