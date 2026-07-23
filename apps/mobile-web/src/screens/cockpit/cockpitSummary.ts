// PROVISIONAL contract module — REQ-001 T6 (steuereule#93), blocked-but-not-blocking on T4
// (steuereule#91: the real `GET /v1/steuerjahre/{jahr}/cockpit` NestJS endpoint, not yet built on
// any branch as of this writing). ADR-0001 requires the typed client to be orval-generated from
// apps/api/openapi.json, never hand-written — this file does NOT live in @steuereule/api-client
// and does NOT claim to be that client; it is a small, isolated, contract-pinned stand-in scoped
// to this screen only, matching the exact shape pinned in docs/runtime/req-001-cockpit-read.md
// (path, response envelope) and reusing @steuereule/core's `EstimateRange`/`cockpitRange` types
// rather than re-declaring them. It calls the same `httpClient` mutator every generated hook uses
// (packages/api-client/src/http-client.ts), so it is a real fetch against the real API — no mock
// data ships in this file. Against today's real backend the route doesn't exist yet, so this
// genuinely 404s/errors, and the honest error state renders (see CockpitScreen) — not a fake
// success. Once T4 ships and `packages/api-client` regenerates with a matching endpoint, this
// whole file is deleted and `useCockpitSummary` swaps to the generated hook — a one-file,
// call-site-compatible change (see steuereule#91 for the coordination note).
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { httpClient } from '@steuereule/api-client'
import type { EstimateRange } from '@steuereule/core'

export interface CockpitSummaryDto {
  readonly taxYear: number
  readonly estimate: EstimateRange
  readonly openItems: number
}

export interface CockpitSummaryResponse {
  /** `null` means "no tax year yet" — the honest empty state, not an error. */
  readonly data: CockpitSummaryDto | null
  readonly status: number
}

export const getCockpitSummaryUrl = (taxYear: number): string => `/v1/steuerjahre/${taxYear}/cockpit`

export const fetchCockpitSummary = (taxYear: number, options?: RequestInit): Promise<CockpitSummaryResponse> =>
  httpClient<CockpitSummaryResponse>(getCockpitSummaryUrl(taxYear), { ...options, method: 'GET' })

export const cockpitSummaryQueryKey = (taxYear: number) => ['cockpitSummary', taxYear] as const

export function useCockpitSummary(taxYear: number): UseQueryResult<CockpitSummaryResponse, unknown> {
  return useQuery({
    queryKey: cockpitSummaryQueryKey(taxYear),
    queryFn: ({ signal }) => fetchCockpitSummary(taxYear, { signal }),
  })
}
