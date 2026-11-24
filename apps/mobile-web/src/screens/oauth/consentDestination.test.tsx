import { describe, expect, it } from 'vitest'
import { consentDestinations } from './consentDestination'

const TARGETS = [
  { uri: 'https://claude.ai/api/mcp/auth_callback', destination: 'claude.ai' },
  { uri: 'http://127.0.0.1:33418/callback', destination: 'localhost' },
  { uri: 'http://localhost:8080/cb', destination: 'localhost' },
]

describe('consentDestinations', () => {
  it('names the destination of the redirect address the request asks for', () => {
    const query = `client_id=c1&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&sig=x`
    expect(consentDestinations(TARGETS, query)).toEqual(['claude.ai'])
  })

  it('names every registered destination once when the request names none of them', () => {
    expect(consentDestinations(TARGETS, 'client_id=c1')).toEqual(['claude.ai', 'localhost'])
    expect(consentDestinations(TARGETS, `redirect_uri=${encodeURIComponent('https://elsewhere.example/cb')}`)).toEqual(['claude.ai', 'localhost'])
  })

  it('names nothing for a client without a registered address', () => {
    expect(consentDestinations([], 'client_id=c1')).toEqual([])
  })
})
