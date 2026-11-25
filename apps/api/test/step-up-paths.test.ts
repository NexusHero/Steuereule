import { describe, expect, it } from 'vitest'
import { needsStepUp } from '../src/auth/step-up-policy.js'

// ADR-0107 L2 (pentest 2026-11-23): step-up covered /oauth2/consent but not the sibling endpoints
// that can widen an existing consent or resume an authorize flow. A stale stolen session must not
// reach those either.
describe('step-up guarded paths (ADR-0107 L2)', () => {
  it('gates the consent-widening and authorize-continuation endpoints, not just the first consent', () => {
    expect(needsStepUp('/oauth2/consent')).toBe(true)
    expect(needsStepUp('/oauth2/update-consent')).toBe(true)
    expect(needsStepUp('/oauth2/continue')).toBe(true)
  })

  it('still gates passkey registration and social linking', () => {
    expect(needsStepUp('/passkey/generate-register-options')).toBe(true)
    expect(needsStepUp('/passkey/verify-registration')).toBe(true)
    expect(needsStepUp('/link-social')).toBe(true)
  })
})
