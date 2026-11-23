import { describe, expect, it } from 'vitest'
import { redirectDestinationOf } from '../src/assistenten/redirect-destination.js'

// An MCP client registers itself and picks its own name, so a client called "Claude" may redirect to
// anyone's server. The consent screen shows where the registered redirect leads; this is that reading.
describe('redirectDestinationOf', () => {
  it('names the host of a web redirect, whatever the client calls itself', () => {
    expect(redirectDestinationOf('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai')
    expect(redirectDestinationOf('https://evil.example/cb?next=https://claude.ai')).toBe('evil.example')
    expect(redirectDestinationOf('https://claude.ai.evil.example/cb')).toBe('claude.ai.evil.example')
    expect(redirectDestinationOf('https://claude.ai@evil.example/cb')).toBe('evil.example')
  })

  it('shows a look-alike domain in its ASCII form', () => {
    expect(redirectDestinationOf('https://clаude.ai/cb')).toMatch(/^xn--clude-[a-z0-9]+\.ai$/) // Cyrillic "а", shown as punycode
  })

  it('reads every loopback redirect as an app on the user\'s machine', () => {
    for (const uri of ['http://localhost:8123/callback', 'http://127.0.0.1/cb', 'http://[::1]:5000/cb']) {
      expect(redirectDestinationOf(uri)).toBe('localhost')
    }
    expect(redirectDestinationOf('https://localhost.evil.example/cb')).toBe('localhost.evil.example')
  })

  it('names the scheme of an app redirect, and nothing for what is no address', () => {
    expect(redirectDestinationOf('cursor://anysphere.cursor-mcp/oauth/callback')).toBe('cursor://')
    expect(redirectDestinationOf('not an address')).toBeNull()
  })
})
