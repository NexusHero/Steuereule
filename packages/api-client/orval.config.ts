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
})
