import { useEffect, useRef, useState } from 'react'
import { useDeviceControllerRequestCode, useDeviceControllerExchangeToken } from '@steuereule/api-client'

export type DeviceQrErrorReason = 'unreachable' | 'server' | 'rate-limited'

export type DeviceQrState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly userCode: string
      readonly verificationUriComplete: string
      readonly secondsRemaining: number
      readonly totalSeconds: number
    }
  | { readonly kind: 'denied' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'error'; readonly reason: DeviceQrErrorReason }
  | { readonly kind: 'approved' }

export interface UseDeviceQrCodeResult {
  readonly state: DeviceQrState
  readonly requestNewCode: () => void
  readonly autoRetryStatus: AutoRetryStatus | null
}

const APPROVED_BEAT_MS = 1500
const RETRY_BASE_MS = 2000
const RETRY_CAP_MS = 16000
const MAX_AUTO_RETRIES = 6

export type AutoRetryStatus = 'scheduled' | 'exhausted' | 'none'

function readDeviceTokenErrorCode(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined
  const value = (data as { error: unknown }).error
  return typeof value === 'string' ? value : undefined
}

function classifyHttpFailure(httpStatus: number): DeviceQrErrorReason {
  return httpStatus === 429 ? 'rate-limited' : 'server'
}

export function useDeviceQrCode(onApproved: () => void, enabled: boolean): UseDeviceQrCodeResult {
  const mintMutation = useDeviceControllerRequestCode()
  const tokenMutation = useDeviceControllerExchangeToken()
  const [state, setState] = useState<DeviceQrState>({ kind: 'loading' })
  const [autoRetryStatus, setAutoRetryStatus] = useState<AutoRetryStatus | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mintRef = useRef(mintMutation.mutate)
  mintRef.current = mintMutation.mutate
  const tokenRef = useRef(tokenMutation.mutate)
  tokenRef.current = tokenMutation.mutate
  const onApprovedRef = useRef(onApproved)
  onApprovedRef.current = onApproved
  const hasStarted = useRef(false)
  const retryAttempt = useRef(0)

  function stopPolling() {
    clearTimeout(pollTimer.current)
  }

  function schedulePoll(deviceCode: string, intervalSeconds: number) {
    stopPolling()
    pollTimer.current = setTimeout(() => poll(deviceCode, intervalSeconds), Math.max(intervalSeconds, 1) * 1000)
  }

  function poll(deviceCode: string, intervalSeconds: number) {
    tokenRef.current(
      { data: { deviceCode } },
      {
        onSuccess: (result) => {
          const httpStatus = (result as { status: number }).status
          if (httpStatus === 200) {
            stopPolling()
            setState({ kind: 'approved' })
            setTimeout(() => onApprovedRef.current(), APPROVED_BEAT_MS)
            return
          }

          const code = readDeviceTokenErrorCode((result as { data: unknown }).data)
          switch (code) {
            case 'authorization_pending':
              schedulePoll(deviceCode, intervalSeconds)
              return
            case 'slow_down':
              schedulePoll(deviceCode, intervalSeconds + 5)
              return
            case 'expired_token':
              stopPolling()
              setState({ kind: 'expired' })
              return
            case 'access_denied':
              stopPolling()
              setState({ kind: 'denied' })
              return
            default:
              stopPolling()
              setState({ kind: 'error', reason: classifyHttpFailure(httpStatus) })
          }
        },
        onError: () => {
          stopPolling()
          setState({ kind: 'error', reason: 'unreachable' })
        },
      },
    )
  }

  function requestNewCode() {
    stopPolling()
    setState({ kind: 'loading' })
    mintRef.current(undefined, {
      onSuccess: (result) => {
        if (result.status !== 201) {
          setState({ kind: 'error', reason: classifyHttpFailure(result.status) })
          return
        }
        setState({
          kind: 'ready',
          userCode: result.data.userCode,
          verificationUriComplete: result.data.verificationUriComplete,
          secondsRemaining: result.data.expiresIn,
          totalSeconds: result.data.expiresIn,
        })
        schedulePoll(result.data.deviceCode, result.data.interval)
      },
      onError: () => setState({ kind: 'error', reason: 'unreachable' }),
    })
  }

  useEffect(() => {
    if (!enabled || hasStarted.current) return
    hasStarted.current = true
    requestNewCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (state.kind !== 'ready') return
    const id = setInterval(() => {
      setState((prev) => (prev.kind === 'ready' ? { ...prev, secondsRemaining: Math.max(prev.secondsRemaining - 1, 0) } : prev))
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind === 'ready' ? state.userCode : null])

  useEffect(() => {
    if (state.kind === 'ready' && state.secondsRemaining <= 0) {
      stopPolling()
      setState({ kind: 'expired' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (state.kind === 'error' && (state.reason === 'unreachable' || state.reason === 'server')) {
      if (retryAttempt.current >= MAX_AUTO_RETRIES) {
        setAutoRetryStatus('exhausted')
        return undefined
      }
      setAutoRetryStatus('scheduled')
      const backoffMs = Math.min(RETRY_BASE_MS * 2 ** retryAttempt.current, RETRY_CAP_MS)
      const timer = setTimeout(() => {
        retryAttempt.current += 1
        requestNewCode()
      }, backoffMs)
      return () => clearTimeout(timer)
    }
    if (state.kind === 'error' && state.reason === 'rate-limited') {
      setAutoRetryStatus('none')
      return undefined
    }
    if (state.kind === 'ready') {
      retryAttempt.current = 0
    }
    setAutoRetryStatus(null)
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [])

  return { state, requestNewCode, autoRetryStatus }
}
