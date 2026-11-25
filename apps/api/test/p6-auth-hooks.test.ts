// API-18: provider tokens are not stored. WEB-22: the session list hands no token to JavaScript.
import { describe, expect, it } from 'vitest'
import { withoutProviderTokens } from '../src/auth/provider-tokens.js'
import { redactSessionList } from '../src/auth/session-list-redaction.js'

describe('provider tokens are not stored (API-18)', () => {
  it('drops the access, refresh and ID token of a social account write', () => {
    const { data } = withoutProviderTokens({ providerId: 'google', accountId: 'g-1', accessToken: 'ya29', refreshToken: '1//r', idToken: 'eyJ', accessTokenExpiresAt: new Date(), scope: 'email' })
    expect(data).toMatchObject({ providerId: 'google', accountId: 'g-1', accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, scope: 'email' })
  })

  it('leaves an update that touches no token as it is', () => {
    expect(withoutProviderTokens({ updatedAt: 'x' }).data).toEqual({ updatedAt: 'x' })
  })
})

describe('the session list carries no token (WEB-22)', () => {
  it('removes the token of every session and keeps the rest', () => {
    expect(redactSessionList([{ id: 's1', token: 'secret', userAgent: 'UA' }])).toEqual([{ id: 's1', userAgent: 'UA' }])
  })
})
