import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthClient } from '../../auth/AuthClientProvider'
import { useAccountSession } from '../../auth/useAccountSession'
import { RequestFailedError, classifyByStatus, classifyThrown } from '../../net/failure-reason'

/**
 * A row of the device list. Named by the session's id, never its token: the server hands no token to JavaScript
 * (WEB-22) and `/revoke-session` accepts the id of one of the caller's own sessions.
 */
export interface DeviceSessionRow {
  readonly id: string
  readonly userAgent: string | null
  readonly updatedAt: string
  readonly isCurrent: boolean
}

const DEVICE_SESSIONS_QUERY_KEY = ['device-sessions'] as const

export function useDeviceSessions() {
  const authClient = useAuthClient()
  const queryClient = useQueryClient()
  const { state: sessionState } = useAccountSession()
  const currentId = sessionState.status === 'signed-in' ? sessionState.session.session.id : undefined

  const sessionsQuery = useQuery({
    queryKey: DEVICE_SESSIONS_QUERY_KEY,
    queryFn: async (): Promise<Omit<DeviceSessionRow, 'isCurrent'>[]> => {
      const result = await authClient.listSessions().catch((thrown: unknown) => {
        throw new RequestFailedError('listSessions did not complete', classifyThrown(thrown))
      })
      const { data, error } = result
      if (error) {
        throw new RequestFailedError('listSessions failed', classifyByStatus(error.status))
      }
      if (!Array.isArray(data)) {
        throw new RequestFailedError('listSessions returned an unusable body', 'unknown')
      }
      return data.map((session) => ({
        id: session.id,
        userAgent: session.userAgent ?? null,
        updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date(session.updatedAt).toISOString(),
      }))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.revokeSession({ token: id })
      if (error) throw new Error('revokeSession failed')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEVICE_SESSIONS_QUERY_KEY })
    },
  })

  const sessions = sessionsQuery.data?.map((session) => ({
    ...session,
    isCurrent: currentId === session.id,
  }))

  return { sessionsQuery: { ...sessionsQuery, data: sessions }, revokeMutation }
}
