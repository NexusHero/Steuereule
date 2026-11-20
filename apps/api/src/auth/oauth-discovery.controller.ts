import { Controller, Get, Inject, Req, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import type { BetterAuthBundle } from './better-auth.js'
import { OAUTH_SCOPES } from './better-auth.js'
import { authIssuer, mcpResourceUrl } from './mcp-oauth.js'

/**
 * The discovery an MCP client walks before it signs in (ADR-0052 §2): the protected-resource
 * metadata of the MCP endpoint (RFC 9728) names better-auth as its authorization server, whose
 * metadata (RFC 8414) lives under /api/auth and is mirrored here at the root, where clients look.
 */
@ApiExcludeController()
@Controller('.well-known')
export class OAuthDiscoveryController {
  constructor(@Inject(BETTER_AUTH_BUNDLE) private readonly bundle: BetterAuthBundle) {}

  private get baseUrl(): string {
    return String(this.bundle.auth.options.baseURL)
  }

  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp/sse'])
  protectedResource() {
    return {
      resource: mcpResourceUrl(this.baseUrl),
      authorization_servers: [authIssuer(this.baseUrl)],
      scopes_supported: [...OAUTH_SCOPES],
      bearer_methods_supported: ['header'],
      resource_name: 'SteuerEule',
    }
  }

  @Get(['oauth-authorization-server', 'oauth-authorization-server/api/auth'])
  async authorizationServer(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const url = new URL(request.url, this.baseUrl)
    // The bundle is typed with better-auth's base API; the provider plugin adds getOAuthServerConfig at runtime.
    const response = await oauthProviderAuthServerMetadata(this.bundle.auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0])(new Request(url, { headers: { accept: 'application/json' } }))
    reply.status(response.status).header('content-type', response.headers.get('content-type') ?? 'application/json').send(await response.text())
  }
}
