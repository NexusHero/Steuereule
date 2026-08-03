// #238 — the Login screen's QR column requests a real device-authorization code from the real
// API the moment the screen mounts (ADR-0003/0005: vertical, never mocked) — `POST
// /v1/device/code`, no guard needed (the desktop calling this has no identity of its own yet,
// device.controller.ts's own header comment). No fixture, no canned response: if the request
// fails or the deployment's `/device` rate rule (ADR-0024) answers 429, that is an honest error
// state, not a hidden one.
//
// Task 6 fix (Salih's T1 gate): minting a code is only half of RFC 8628 (§3.4/3.5) — the desktop
// also has to *poll* `POST /v1/device/token` with the `deviceCode` until the phone approves it,
// or nothing here ever actually signs the desktop in. That was missing entirely; this file now
// owns the whole desktop-side state machine, not just the mint.
import { useEffect, useRef, useState } from 'react'
import { useDeviceControllerRequestCode, useDeviceControllerExchangeToken } from '@steuereule/api-client'

export type DeviceQrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly userCode: string; readonly verificationUriComplete: string }
  | { readonly kind: 'denied' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'error' }

export interface UseDeviceQrCodeResult {
  readonly state: DeviceQrState
  /** Re-requests a code — the honest way out of `denied`/`expired`/`error`, never a silent retry. */
  readonly requestNewCode: () => void
}

/**
 * `POST /v1/device/token`'s OpenAPI contract only documents its 200 (`AckResponseDto`) — the
 * RFC 8628 `authorization_pending`/`slow_down`/`expired_token`/`access_denied` family is
 * better-auth's own error vocabulary, relayed verbatim by `translateDeviceApiError`
 * (apps/api/src/device/device-api-error.ts's own header comment: "the frontend's polling logic
 * gets the plugin's real error codes untouched"). Reading it here, rather than generating it, is
 * deliberate — it's the one undocumented seam this polling loop actually depends on.
 */
function readDeviceTokenErrorCode(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined
  const value = (data as { error: unknown }).error
  return typeof value === 'string' ? value : undefined
}

export function useDeviceQrCode(onApproved: () => void): UseDeviceQrCodeResult {
  const mintMutation = useDeviceControllerRequestCode()
  const tokenMutation = useDeviceControllerExchangeToken()
  const [state, setState] = useState<DeviceQrState>({ kind: 'loading' })
  // Plain `useRef`s, not TanStack Query's own retry/staleTime machinery: this is a one-shot
  // mint-then-poll-then-countdown sequence, not a value worth re-fetching on focus or a stale
  // clock — and the poll's own cadence is server-given (RFC 8628 `interval`), not TanStack
  // Query's `refetchInterval`.
  const expiryTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mintRef = useRef(mintMutation.mutate)
  mintRef.current = mintMutation.mutate
  const tokenRef = useRef(tokenMutation.mutate)
  tokenRef.current = tokenMutation.mutate
  const onApprovedRef = useRef(onApproved)
  onApprovedRef.current = onApproved

  function stopPolling() {
    clearTimeout(pollTimer.current)
  }

  function schedulePoll(deviceCode: string, intervalSeconds: number) {
    stopPolling()
    // Never faster than the server's own stated minimum (RFC 8628 §3.5) — `Math.max(…, 1)` is a
    // defensive floor against a `0`/negative value, not a frontend-chosen cadence.
    pollTimer.current = setTimeout(() => poll(deviceCode, intervalSeconds), Math.max(intervalSeconds, 1) * 1000)
  }

  function poll(deviceCode: string, intervalSeconds: number) {
    tokenRef.current(
      { data: { deviceCode } },
      {
        onSuccess: (result) => {
          // Same widening as `requestNewCode` below and as GeraetefreigabeScreen's own pending
          // read: the generated type narrows `.status` to the literal `200` even though a real
          // 400 (still pending, denied, expired) or an undocumented status (429, 5xx) reaches
          // this exact branch at runtime — httpClient never throws on a non-2xx.
          const httpStatus = (result as { status: number }).status
          if (httpStatus === 200) {
            // The session cookie is already set on this same response (Set-Cookie,
            // device.controller.ts's `exchangeToken`) — this hook's job ends here; the caller
            // decides what "signed in" means for the rest of the app.
            stopPolling()
            clearTimeout(expiryTimer.current)
            onApprovedRef.current()
            return
          }

          const code = readDeviceTokenErrorCode((result as { data: unknown }).data)
          switch (code) {
            case 'authorization_pending':
              schedulePoll(deviceCode, intervalSeconds)
              return
            case 'slow_down':
              // RFC 8628 §3.5: the server is asking for a slower cadence, not reporting a
              // failure — add 5s (the RFC's own increment) and keep polling.
              schedulePoll(deviceCode, intervalSeconds + 5)
              return
            case 'expired_token':
              stopPolling()
              clearTimeout(expiryTimer.current)
              setState({ kind: 'expired' })
              return
            case 'access_denied':
              stopPolling()
              clearTimeout(expiryTimer.current)
              setState({ kind: 'denied' })
              return
            default:
              // An unrecognised body, a bare 429, a 5xx — anything this endpoint's documented
              // contract doesn't name. Never folded into `authorization_pending`: a real error
              // must never look like "still waiting", or it becomes invisible. Stops polling and
              // shows the same honest `error` state a network failure gets.
              stopPolling()
              setState({ kind: 'error' })
          }
        },
        onError: () => {
          stopPolling()
          setState({ kind: 'error' })
        },
      },
    )
  }

  function requestNewCode() {
    stopPolling()
    clearTimeout(expiryTimer.current)
    setState({ kind: 'loading' })
    mintRef.current(undefined, {
      onSuccess: (result) => {
        // The OpenAPI contract only documents 201; a real deployment can still answer 429 (the
        // `/device` rate rule, ADR-0024) or another non-2xx — httpClient resolves rather than
        // throws on those (packages/api-client/src/http-client.ts), so this is the one place
        // that turns "not what the type promised" into the same honest `error` state a network
        // failure gets, rather than rendering a QR for a code that was never actually minted.
        if (result.status !== 201) {
          setState({ kind: 'error' })
          return
        }
        setState({
          kind: 'ready',
          userCode: result.data.userCode,
          verificationUriComplete: result.data.verificationUriComplete,
        })
        expiryTimer.current = setTimeout(() => {
          stopPolling()
          setState({ kind: 'expired' })
        }, result.data.expiresIn * 1000)
        // RFC 8628 §3.4: start polling with the code the server just minted, no faster than the
        // `interval` it returned alongside it.
        schedulePoll(result.data.deviceCode, result.data.interval)
      },
      onError: () => setState({ kind: 'error' }),
    })
  }

  useEffect(() => {
    requestNewCode()
    return () => {
      clearTimeout(expiryTimer.current)
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request exactly once on mount;
    // `requestNewCode` reads the mutations via refs precisely so this effect never re-fires on
    // their identity churn.
  }, [])

  return { state, requestNewCode }
}
