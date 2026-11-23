import { describe, expect, it } from 'vitest'
import { CHANGE_PASSWORD_PATH, forceRevokeOtherSessionsOnPasswordChange } from '../src/auth/force-session-rotation.js'

// ADR-0103 vulnerability 3 — a password change must rotate the current token and revoke the account's
// other sessions. better-auth does both only when the caller sends `revokeOtherSessions: true`; its
// default does neither. This helper forces the flag on in better-auth's before-hook, so the rotation
// happens through better-auth's own supported path regardless of what the client sent. The end-to-end
// effect (sibling session revoked, token rotated) is proved in the integration suite; this pins the shape
// the before-hook merges into the request.
describe('forceRevokeOtherSessionsOnPasswordChange', () => {
  it('forces revokeOtherSessions on a /change-password body that omitted it', () => {
    const result = forceRevokeOtherSessionsOnPasswordChange(CHANGE_PASSWORD_PATH, {
      currentPassword: 'a',
      newPassword: 'b',
    })
    expect(result).toEqual({ context: { body: { currentPassword: 'a', newPassword: 'b', revokeOtherSessions: true } } })
  })

  it('forces it even when the client explicitly sent false', () => {
    const result = forceRevokeOtherSessionsOnPasswordChange(CHANGE_PASSWORD_PATH, { revokeOtherSessions: false })
    expect(result).toEqual({ context: { body: { revokeOtherSessions: true } } })
  })

  it('leaves a body that already opted in untouched (no override needed)', () => {
    expect(forceRevokeOtherSessionsOnPasswordChange(CHANGE_PASSWORD_PATH, { revokeOtherSessions: true })).toBeUndefined()
  })

  it('does nothing for any other path', () => {
    expect(forceRevokeOtherSessionsOnPasswordChange('/sign-in/email', { revokeOtherSessions: false })).toBeUndefined()
    expect(forceRevokeOtherSessionsOnPasswordChange('/oauth2/register', {})).toBeUndefined()
  })

  it('tolerates a missing/non-object body', () => {
    expect(forceRevokeOtherSessionsOnPasswordChange(CHANGE_PASSWORD_PATH, undefined)).toEqual({
      context: { body: { revokeOtherSessions: true } },
    })
  })
})
