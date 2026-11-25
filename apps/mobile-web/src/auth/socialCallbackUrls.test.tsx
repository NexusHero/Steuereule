import { describe, expect, it } from 'vitest'
import { SOCIAL_ERROR_MARKER, socialCallbackUrls } from './useSocialSignIn'

/** WEB-33: better-auth resolves a relative callback against the API host; the app hands it absolute web addresses. */
describe('socialCallbackUrls', () => {
  it('sends success and failure back to the web app, not to the API host', () => {
    const { origin } = window.location
    expect(socialCallbackUrls()).toEqual({ callbackURL: `${origin}/`, errorCallbackURL: `${origin}/login?${SOCIAL_ERROR_MARKER}=1` })
    for (const url of Object.values(socialCallbackUrls())) expect(new URL(url).origin).toBe(origin)
  })

  it('brings a re-authentication back to the page it started on (WEB-50)', () => {
    const page = `${window.location.origin}/app/profil/sicherheit`
    expect(socialCallbackUrls(page)).toEqual({ callbackURL: page, errorCallbackURL: page })
  })
})
