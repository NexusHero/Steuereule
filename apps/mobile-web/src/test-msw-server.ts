// Contract-pinned MSW server for tests only (ADR-0001/0003): routes and payload shapes come
// straight from @steuereule/api-client's orval-generated mock handlers, so a test can never
// drift from the real Profile OpenAPI contract. Default GET resolves to the deterministic
// all-null profile (what a fresh guest actually gets) rather than the generated factory's
// random faker data, so tests aren't flaky; individual tests layer overrides with
// `server.use(...)` and get reset in test-setup.ts's afterEach.
import { setupServer } from 'msw/node'
import {
  getProfileControllerGetProfileMockHandler,
  getProfileControllerPutProfileMockHandler,
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler,
} from '@steuereule/api-client/msw'
import type { ProfileResponseDto, AuthCapabilitiesDto } from '@steuereule/api-client'

export const EMPTY_PROFILE_RESPONSE: ProfileResponseDto = {
  firstName: null,
  lastName: null,
  steuerId: null,
  steuernummer: null,
}

/**
 * Default capability answer (REQ-008): a deployment with Google configured, which is what
 * the auth screens are normally exercised against. A test that wants the unconfigured
 * deployment overrides with `CAPABILITIES_WITHOUT_SOCIAL` via `server.use(...)`. Pinned
 * explicitly rather than left to the generated faker factory, which would return random
 * provider names and make the gating tests meaningless.
 */
export const CAPABILITIES_WITH_GOOGLE: AuthCapabilitiesDto = { socialProviders: ['google'] }
export const CAPABILITIES_WITHOUT_SOCIAL: AuthCapabilitiesDto = { socialProviders: [] }

export const server = setupServer(
  getProfileControllerGetProfileMockHandler(EMPTY_PROFILE_RESPONSE),
  getProfileControllerPutProfileMockHandler(),
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITH_GOOGLE),
)
