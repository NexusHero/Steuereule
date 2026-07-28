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
})
