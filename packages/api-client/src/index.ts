// @steuereule/api-client — the typed OpenAPI client + TanStack Query hooks for the
// Profile, Auth-capability, Cockpit and Device-authorization APIs (ADR-0001). Generated from
// apps/api/openapi.json via orval; never hand-write a hook or type here — regenerate instead
// (see orval.config.ts). MSW handlers/faker factories are intentionally NOT re-exported from
// this entry — import them from the `@steuereule/api-client/msw` subpath in tests only, so
// production code never pulls in msw/faker.
export * from './generated/profile'
export * from './generated/profile.schemas'
export * from './generated/auth'
export * from './generated/auth.schemas'
export * from './generated/cockpit'
export * from './generated/cockpit.schemas'
export * from './generated/account'
export * from './generated/account.schemas'
export * from './generated/device'
export * from './generated/device.schemas'
export * from './generated/interview'
export * from './generated/interview.schemas'
export { configureApiClient, resetApiClientConfig, getApiClientBaseUrl, type ApiClientConfig } from './http-client'
