// #238 — the Login screen's QR column requests a real device-authorization code from the real
// API the moment the screen mounts (ADR-0003/0005: vertical, never mocked) — `POST
// /v1/device/code`, no guard needed (the desktop calling this has no identity of its own yet,
// device.controller.ts's own header comment). No fixture, no canned response: if the request
// fails or the deployment's `/device` rate rule (ADR-0024) answers 429, that is an honest error
// state, not a hidden one.
import { useEffect, useRef, useState } from 'react'
import { useDeviceControllerRequestCode } from '@steuereule/api-client'

export type DeviceQrState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly userCode: string; readonly verificationUriComplete: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'error' }

export interface UseDeviceQrCodeResult {
  readonly state: DeviceQrState
  /** Re-requests a code — the honest way out of both `expired` and `error`, never a silent retry. */
  readonly requestNewCode: () => void
}

export function useDeviceQrCode(): UseDeviceQrCodeResult {
  const mutation = useDeviceControllerRequestCode()
  const [state, setState] = useState<DeviceQrState>({ kind: 'loading' })
  // A plain `useRef`, not TanStack Query's own retry/staleTime machinery: this is a one-shot
  // mint-then-countdown, not a value worth re-fetching on focus or a stale clock.
  const expiryTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mutateRef = useRef(mutation.mutate)
  mutateRef.current = mutation.mutate

  function requestNewCode() {
    clearTimeout(expiryTimer.current)
    setState({ kind: 'loading' })
    mutateRef.current(undefined, {
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
        expiryTimer.current = setTimeout(() => setState({ kind: 'expired' }), result.data.expiresIn * 1000)
      },
      onError: () => setState({ kind: 'error' }),
    })
  }

  useEffect(() => {
    requestNewCode()
    return () => clearTimeout(expiryTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request exactly once on mount;
    // `requestNewCode` reads the mutation via a ref precisely so this effect never re-fires on
    // the mutation object's own identity churn.
  }, [])

  return { state, requestNewCode }
}
