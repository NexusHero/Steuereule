// Generates the typed profile client + TanStack Query hooks from the API's own OpenAPI
// document (ADR-0001) — the client is never hand-written. Regenerate after any change
// to apps/api/src/profile/**:
//
//   pnpm --filter @steuereule/api run openapi:spec
//   pnpm --filter @steuereule/api-client run generate
//
// `mock: true` + `mode: 'split'` puts the MSW handlers/faker factories in their own
// `.msw.ts`/`.faker.ts` files (exposed only via the package's `./msw` subpath export) so
// production code importing `@steuereule/api-client` never pulls in msw/faker.
import { defineConfig } from 'orval'

export default defineConfig({
  profile: {
    input: { target: '../../apps/api/openapi.json', filters: { tags: ['profile'] } },
    output: {
      target: './src/generated/profile.ts',
      mode: 'split',
      client: 'react-query',
      httpClient: 'fetch',
      mock: true,
      override: {
        mutator: { path: './src/http-client.ts', name: 'httpClient' },
      },
    },
  },
  // REQ-001 (steuereule#91) — same openapi.json, filtered to the cockpit tag, into its
  // own output so the generated file names stay honest about what they contain.
  // REQ-008 — the auth capability probe, so the login screen can ask what this deployment
  // can actually authenticate with before it offers a social button.
  auth: {
    input: { target: '../../apps/api/openapi.json', filters: { tags: ['auth'] } },
    output: {
      target: './src/generated/auth.ts',
      mode: 'split',
      client: 'react-query',
      httpClient: 'fetch',
      mock: true,
      override: {
        mutator: { path: './src/http-client.ts', name: 'httpClient' },
      },
    },
  },
  cockpit: {
    input: { target: '../../apps/api/openapi.json', filters: { tags: ['cockpit'] } },
    output: {
      target: './src/generated/cockpit.ts',
      mode: 'split',
      client: 'react-query',
      httpClient: 'fetch',
      mock: true,
      override: {
        mutator: { path: './src/http-client.ts', name: 'httpClient' },
      },
    },
  },
  // REQ-011 (ADR-0013) — DSGVO export (GET /v1/account/export) + account deletion
  // (DELETE /v1/account). Both controllers share the `account` OpenAPI tag.
  account: {
    input: { target: '../../apps/api/openapi.json', filters: { tags: ['account'] } },
    output: {
      target: './src/generated/account.ts',
      mode: 'split',
      client: 'react-query',
      httpClient: 'fetch',
      mock: true,
      override: {
        mutator: { path: './src/http-client.ts', name: 'httpClient' },
      },
    },
  },
  // #238 — QR device-authorization. `POST /v1/device/code` today (Robin's task 0); the
  // `device` tag is what task 2's `/v1/device/{pending,approve,token}` will land in too,
  // regenerating this same target rather than adding a new one.
  device: {
    input: { target: '../../apps/api/openapi.json', filters: { tags: ['device'] } },
    output: {
      target: './src/generated/device.ts',
      mode: 'split',
      client: 'react-query',
      httpClient: 'fetch',
      mock: true,
      override: {
        mutator: { path: './src/http-client.ts', name: 'httpClient' },
      },
    },
  },
  // REQ-015 (#318 task 2) — the Minimal-Gate: GET the re-entry state, POST each answer.
  // Same `interview` OpenAPI tag both endpoints share.
  interview: {
    input: { target: '../../apps/api/openapi.json', filters: { tags: ['interview'] } },
    output: {
      target: './src/generated/interview.ts',
      mode: 'split',
      client: 'react-query',
      httpClient: 'fetch',
      mock: true,
      override: {
        mutator: { path: './src/http-client.ts', name: 'httpClient' },
        // `StepDto.id` (@ApiPropertyOptional — genuinely absent when kind is "done", not
        // nullable) is the first response schema in this API with a truly optional,
        // non-nullable property. orval's default faker output for that shape is
        // `id: faker.helpers.arrayElement([value, undefined])`, which fails to typecheck
        // under this repo's `exactOptionalPropertyTypes: true` (TS2375 — an *explicit*
        // `undefined` on an optional key is stricter-disallowed than omitting the key).
        // `mock.required: true` (an orval-native override, not a hand-edit of generated
        // output — see @orval/mock's own `MockOptions.required`) makes every mocked property
        // always populated, matching this repo's own convention of never trusting random
        // faker data in a real test anyway (every test here pins its own fixture). The real
        // `StepDto.id` TYPE stays genuinely optional in interview.schemas.ts — only the mock
        // *value* generation changes.
        mock: { required: true },
      },
    },
  },
})
