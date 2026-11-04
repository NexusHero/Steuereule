import { useAuthClient } from './AuthClientProvider'
import type { AppAuthClient } from './auth-client'
import { classifyByStatus, type FailureReason, type MaybeHttpStatus } from '../net/failure-reason'

export type AccountSession = NonNullable<ReturnType<AppAuthClient['useSession']>['data']>

export type AccountSessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-in'; readonly session: AccountSession }
  | { readonly status: 'signed-out' }
  | { readonly status: 'unknown'; readonly reason: FailureReason }

export interface UseAccountSessionResult {
  readonly state: AccountSessionState
  readonly retry: () => Promise<void>
}

export function deriveAccountSessionState(data: AccountSession | null, error: unknown, isPending: boolean): AccountSessionState {
  if (isPending) return { status: 'loading' }
  if (data !== null) return { status: 'signed-in', session: data }
  if (error) {
    const httpStatus = extractStatus(error)
    if (httpStatus === 401) return { status: 'signed-out' }
    return { status: 'unknown', reason: classifyByStatus(httpStatus) }
  }
  return { status: 'signed-out' }
}

function extractStatus(error: unknown): MaybeHttpStatus {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
  const status = (error as { status: unknown }).status
  return typeof status === 'number' ? status : undefined
}

export function useAccountSession(): UseAccountSessionResult {
  const authClient = useAuthClient()
  const { data, error, isPending, refetch } = authClient.useSession()
  return {
    state: deriveAccountSessionState(data, error, isPending),
    retry: refetch,
  }
}
