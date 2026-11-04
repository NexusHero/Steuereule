import { ApiProperty } from '@nestjs/swagger'

/** What this deployment can actually authenticate. */
export class AuthCapabilitiesDto {
  @ApiProperty({
    description:
      'Social providers this deployment will actually accept, e.g. ["google"]. Empty when none are configured — the client must then not offer social sign-in at all, rather than offering a button that always errors.',
    example: ['google'],
    type: [String],
  })
  socialProviders!: string[]
}
