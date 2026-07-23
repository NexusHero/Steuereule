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
} from '@steuereule/api-client/msw'
import type { ProfileResponseDto } from '@steuereule/api-client'

export const EMPTY_PROFILE_RESPONSE: ProfileResponseDto = {
  firstName: null,
  lastName: null,
  steuerId: null,
  steuernummer: null,
}

export const server = setupServer(
  getProfileControllerGetProfileMockHandler(EMPTY_PROFILE_RESPONSE),
  getProfileControllerPutProfileMockHandler(),
)
