// Contract-pinned MSW server for tests only (ADR-0001/0003): routes and payload shapes come
// straight from @steuereule/api-client's orval-generated mock handlers, so a test can never
// drift from the real Profile OpenAPI contract. Default GET resolves to the deterministic
// all-null profile (what a fresh guest actually gets) rather than the generated factory's
// random faker data, so tests aren't flaky; individual tests layer overrides with
// `server.use(...)` and get reset in test-setup.ts's afterEach.
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import {
  getProfileControllerGetProfileMockHandler,
  getProfileControllerPutProfileMockHandler,
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler,
  getCockpitControllerGetCockpitSummaryMockHandler,
  getDeviceControllerRequestCodeMockHandler,
} from '@steuereule/api-client/msw'
import type { ProfileResponseDto, AuthCapabilitiesDto, DeviceCodeResponseDto } from '@steuereule/api-client'

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

/**
 * Default `POST /v1/device/code` answer (#238) — pinned, not the generated factory's random
 * faker data, same reasoning as the capability answer above: a QR/`user_code` assertion against
 * a random string is no assertion at all. LoginScreen's own suite renders at jsdom's default
 * window width (1024px, breakpoint `m`), so the QR column mounts and requests a code in every
 * test that renders Login unless overridden — this is what keeps that request from becoming an
 * unhandled-request error in every one of them.
 */
export const DEVICE_CODE_RESPONSE: DeviceCodeResponseDto = {
  userCode: 'K7QX-9F2M',
  deviceCode: 'test-device-code',
  // `/device` — the app's own router route (#238 AC-1), matching `verificationUri`'s real,
  // fixed value (`${WEB_APP_URL}/device`, apps/api/src/auth/better-auth.ts). Was `/geraet`
  // here before Robin's fix landed the actual path; kept in sync now that it's settled.
  verificationUriComplete: 'http://localhost:8081/device?user_code=K7QX-9F2M',
  expiresIn: 120,
  interval: 5,
}

export const server = setupServer(
  getProfileControllerGetProfileMockHandler(EMPTY_PROFILE_RESPONSE),
  getProfileControllerPutProfileMockHandler(),
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITH_GOOGLE),
  // Cockpit's honest empty state ("noch keine Angaben") — a fresh guest genuinely has no
  // tax year yet, so this is what the real API returns. Present by default so shell-level
  // tests that merely pass through Cockpit don't each have to stub it; CockpitScreen's own
  // suite overrides it with real figures where the numbers are the point.
  getCockpitControllerGetCockpitSummaryMockHandler(null),
  getDeviceControllerRequestCodeMockHandler(DEVICE_CODE_RESPONSE),
  // better-auth's own session read — not orval-generated (better-auth owns this contract,
  // ADR-0012 §1), so it's not in @steuereule/api-client. Defaults to "no session" (`null`),
  // which is also the fail-closed default any screen deriving "verified"/"signed in" from
  // this read must land on absent a positive answer (#194, RegistrierungScreen). Tests that
  // need a real session (or a session-fetch error) override with `server.use(...)`.
  http.get('*/api/auth/get-session', () => HttpResponse.json(null)),
)
