import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AUTH_CONTEXT_REQUEST_KEY, USER_ID_REQUEST_KEY } from '../src/auth/user-context.guard.js'
import { McpController } from '../src/mcp/mcp.controller.js'

const BASE = 'http://localhost:3501'

function controller() {
  return new McpController({ createServer: vi.fn() } as never, { auth: { options: { baseURL: BASE } } } as never)
}

describe('McpController sign-in challenge (ADR-0052 §2, RFC 9728 §5.1)', () => {
  it('answers a request without an assistant token with 401 and points to the protected-resource metadata', async () => {
    const reply = { header: vi.fn(), hijack: vi.fn() }
    const request = { [USER_ID_REQUEST_KEY]: 'guest-1', [AUTH_CONTEXT_REQUEST_KEY]: { source: 'nutzer' } }
    await expect(controller().sse(request as never, reply as never)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(reply.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp/sse"`)
    expect(reply.hijack).not.toHaveBeenCalled()
  })

  it('does the same on the message endpoint', async () => {
    const reply = { header: vi.fn(), hijack: vi.fn(), raw: {} }
    const request = { [AUTH_CONTEXT_REQUEST_KEY]: { source: 'nutzer' }, query: {} }
    await expect(controller().messages(request as never, reply as never)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(reply.header).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('resource_metadata='))
  })
})
