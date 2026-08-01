// Wraps better-auth's own core `listSessions`/`revokeSession` client actions behind TanStack
// Query, matching every other screen's data-fetching convention in this app. This is
// "configuration + a screen", exactly as the ticket names it — no plugin, no new backend
// machinery, apps/api/src/device/* is untouched by this file.
//
// No region here. Musti's ADR-0021 control test (not a read) proved the only deployment-config
// candidate for a trustworthy client IP — better-auth's `ipAddressHeaders` + `trustedProxies` —
// still returns a spoofable address: the trust check's own hop-peeling logic has nothing to
// peel for a single-value header, so the config path *removes* the check rather than replacing
// it. Fail-closed follows directly: no `Session.region` column, therefore no region field on
// this list at all — not even a "Region unbekannt" row, because there is no column to be
// unknown. This is deliberate, not an oversight — see DeviceListSection.tsx for the exact spot
// a region row would have gone. The approval screen's own region (GeraetefreigabeScreen) is
// unaffected: it reads `DeviceCode.requestRegion`, stamped from Fastify's own `request.ip` at
// code-creation time, a completely different path from Session's client-IP question.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthClient } from '../../auth/AuthClientProvider'

export interface DeviceSessionRow {
  readonly token: string
  readonly userAgent: string | null
  readonly updatedAt: string
  /** Whether this is the session the app is currently running under — revoking it is a
   *  self-sign-out, not just removing an entry from a list (ProfilScreen must react to it). */
  readonly isCurrent: boolean
}

const DEVICE_SESSIONS_QUERY_KEY = ['device-sessions'] as const

export function useDeviceSessions() {
  const authClient = useAuthClient()
  const queryClient = useQueryClient()
  // The one honest source for "which of these rows is the one I'm looking at this list from" —
  // the same `useSession()` read DatenschutzScreen/DeviceScreen already use, compared by its
  // own session token rather than guessed at from e.g. matching User-Agent strings.
  const { data: currentSession } = authClient.useSession()

  const sessionsQuery = useQuery({
    queryKey: DEVICE_SESSIONS_QUERY_KEY,
    queryFn: async (): Promise<Omit<DeviceSessionRow, 'isCurrent'>[]> => {
      const { data, error } = await authClient.listSessions()
      if (error || !data) {
        throw new Error('listSessions failed')
      }
      return data.map((session) => ({
        token: session.token,
        userAgent: session.userAgent ?? null,
        // better-auth's client deserialises date fields into real `Date` objects (its own
        // `parser.mjs`), unlike the raw server JSON — normalising to an ISO string here keeps
        // `formatRequestedAt` (deviceContext.ts) usable from either source without a second,
        // Date-aware formatter.
        updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date(session.updatedAt).toISOString(),
      }))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token })
      if (error) throw new Error('revokeSession failed')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEVICE_SESSIONS_QUERY_KEY })
    },
  })

  // `isCurrent` is derived fresh on every render, never baked into the cached query data:
  // `listSessions()` and `useSession()` are two independent fetches that can resolve in either
  // order, and TanStack Query's own cache would otherwise freeze whatever `currentSession` was
  // at the moment `queryFn` happened to run — including `undefined`, if the session read hadn't
  // resolved yet — with no reason for the sessions query to ever refetch once it had. Comparing
  // at render time means a `currentSession` that resolves *after* the list already loaded still
  // marks the right row, no query invalidation required to "unstick" it.
  const sessions = sessionsQuery.data?.map((session) => ({
    ...session,
    isCurrent: currentSession?.session.token === session.token,
  }))

  return { sessionsQuery: { ...sessionsQuery, data: sessions }, revokeMutation }
}
