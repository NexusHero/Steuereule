import { ApiProperty } from '@nestjs/swagger'

/**
 * What this deployment can actually authenticate with (REQ-008).
 *
 * Deliberately carries capability *names* only — never client ids, never secrets, never
 * anything an unauthenticated caller could use. It answers exactly one question, the one
 * the login screen has to ask before it can be honest: "would a press of this button
 * reach a working provider, or would it certainly fail?"
 */
export class AuthCapabilitiesDto {
  @ApiProperty({
    description:
      'Social providers this deployment will actually accept, e.g. ["google"]. Empty when none are configured — the client must then not offer social sign-in at all, rather than offering a button that always errors.',
    example: ['google'],
    type: [String],
  })
  socialProviders!: string[]
}
