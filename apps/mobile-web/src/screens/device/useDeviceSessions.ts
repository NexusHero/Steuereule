import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthClient } from '../../auth/AuthClientProvider'
import { useAccountSession } from '../../auth/useAccountSession'
import { RequestFailedError, classifyByStatus, classifyThrown } from '../../net/failure-reason'

export interface DeviceSessionRow {
  readonly token: string
  readonly userAgent: string | null
  readonly updatedAt: string
  readonly isCurrent: boolean
}

const DEVICE_SESSIONS_QUERY_KEY = ['device-sessions'] as const

export function useDeviceSessions() {
  const authClient = useAuthClient()
  const queryClient = useQueryClient()
  const { state: sessionState } = useAccountSession()
  const currentToken = sessionState.status === 'signed-in' ? sessionState.session.session.token : undefined

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
        token: session.token,
        userAgent: session.userAgent ?? null,
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

  const sessions = sessionsQuery.data?.map((session) => ({
    ...session,
    isCurrent: currentToken === session.token,
  }))

  return { sessionsQuery: { ...sessionsQuery, data: sessions }, revokeMutation }
}
