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
//
// #283 (Musti's refinement block, ADR-0018 joint grillme) — three changes on top of task 6:
//   §3(b) `error` now carries a `reason` ('unreachable' | 'server' | 'rate-limited') instead of
//     folding a transport failure, an undocumented non-2xx and a deliberate rate-limit answer
//     into one opaque state — LoginScreen's shared-outage banner (AC-A) and the "never fight a
//     429" boundary (AC-B, ADR-0024) both need to tell them apart.
//   §4(1) a bounded, backing-off auto-retry on 'unreachable'/'server' only — never on
//     'rate-limited' (that would be the frontend fighting a deliberate server-side brake) and
//     never on 'expired'/'denied' (those are answers, not failures).
//   §5 states 3 (`knapp`, a ticking countdown with an amber sub-20s pre-warning) and 7
//     (`bestaetigt`, a ~1.5s confirmation beat before `onApproved` fires, so a QR sign-in doesn't
//     vanish from under the user the instant the phone taps yes).
//
// The `enabled` param (§4(2)) is what actually fixes the reload-adjacent bug Musti found: this
// hook used to live inside `DeviceQrColumn`, which only mounted at `bp !== 's'` — so resizing
// across the `s`/`m` boundary in *either* direction unmounted and remounted it, burning a
// perfectly good code (and re-minting, which can itself fail). The state machine now lives here,
// called unconditionally from `LoginScreen` itself (which never unmounts on a resize) — `enabled`
// gates only the *first* mint via `hasStarted`, so it fires exactly once, the first time the
// screen is ever wide enough, and never again just because `enabled` toggles back and forth
// afterward. `false` throughout (embedded usage, #238 AC-7, or a screen that loads narrow and
// never widens) means the mint never happens — no code, no request, exactly as before.
import { useEffect, useRef, useState } from 'react'
import { useDeviceControllerRequestCode, useDeviceControllerExchangeToken } from '@steuereule/api-client'

export type DeviceQrErrorReason = 'unreachable' | 'server' | 'rate-limited'

export type DeviceQrState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly userCode: string
      readonly verificationUriComplete: string
      /** Ticks down once a second (see the `ready`-keyed effect below); reaching 0 is what
       *  actually drives the `expired` transition now — there is no separate expiry timer to
       *  keep in sync with it. */
      readonly secondsRemaining: number
      readonly totalSeconds: number
    }
  | { readonly kind: 'denied' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'error'; readonly reason: DeviceQrErrorReason }
  /** The confirmation beat (§5, state 7) — entered the instant the poll reports success, held
   *  for a moment before `onApproved` actually fires, so "you're in" is something the user sees
   *  rather than a screen that just vanishes. */
  | { readonly kind: 'approved' }

export interface UseDeviceQrCodeResult {
  readonly state: DeviceQrState
  /** Re-requests a code — the honest way out of `denied`/`expired`/`error`, never a silent retry. */
  readonly requestNewCode: () => void
  /** `null` outside `{ kind: 'error' }`. `'scheduled'`/`'exhausted'` only ever apply to
   *  'unreachable'/'server' (§4(1)); 'rate-limited' is always `'none'` — ADR-0024's own brake,
   *  never fought automatically, ever. The UI reads this rather than re-deriving it, so the copy
   *  it shows ("we're retrying" vs. "retry yourself") can never drift from what actually happens. */
  readonly autoRetryStatus: AutoRetryStatus | null
}

const APPROVED_BEAT_MS = 1500
// Auto-retry backoff (§4(1)): starts at 2s, doubles, caps the PER-RETRY delay at 16s — and,
// separately, caps the NUMBER of automatic retries at MAX_AUTO_RETRIES (Musti's #298 review,
// F1(b) — a delay cap alone bounds how *slow* the hammering gets, not whether it ever stops).
// After the cap, the column falls back to manual-only ("Erneut versuchen" stays live throughout
// regardless) rather than retrying into a still-down server forever.
const RETRY_BASE_MS = 2000
const RETRY_CAP_MS = 16000
const MAX_AUTO_RETRIES = 6

export type AutoRetryStatus = 'scheduled' | 'exhausted' | 'none'

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

/** ADR-0024's `/device` rate rule answers 429; any other undocumented non-2xx is an honest,
 *  distinct "something's wrong on our end" — never folded together, since only the latter may
 *  ever auto-retry (§4(1)). */
function classifyHttpFailure(httpStatus: number): DeviceQrErrorReason {
  return httpStatus === 429 ? 'rate-limited' : 'server'
}

export function useDeviceQrCode(onApproved: () => void, enabled: boolean): UseDeviceQrCodeResult {
  const mintMutation = useDeviceControllerRequestCode()
  const tokenMutation = useDeviceControllerExchangeToken()
  const [state, setState] = useState<DeviceQrState>({ kind: 'loading' })
  const [autoRetryStatus, setAutoRetryStatus] = useState<AutoRetryStatus | null>(null)
  // Plain `useRef`s, not TanStack Query's own retry/staleTime machinery: this is a one-shot
  // mint-then-poll-then-countdown sequence, not a value worth re-fetching on focus or a stale
  // clock — and the poll's own cadence is server-given (RFC 8628 `interval`), not TanStack
  // Query's `refetchInterval`.
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mintRef = useRef(mintMutation.mutate)
  mintRef.current = mintMutation.mutate
  const tokenRef = useRef(tokenMutation.mutate)
  tokenRef.current = tokenMutation.mutate
  const onApprovedRef = useRef(onApproved)
  onApprovedRef.current = onApproved
  // Latches true on the first mint — `enabled` toggling afterward (a resize back across `s`)
  // must never re-arm this (§4(2)).
  const hasStarted = useRef(false)
  const retryAttempt = useRef(0)

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
            // device.controller.ts's `exchangeToken`) — but the caller doesn't hear about it
            // instantly; state 7's confirmation beat runs first (§5), so "you're in" is
            // something the user actually sees rather than a screen that just disappears.
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
              // RFC 8628 §3.5: the server is asking for a slower cadence, not reporting a
              // failure — add 5s (the RFC's own increment) and keep polling.
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
              // An unrecognised body, a bare 429, a 5xx — anything this endpoint's documented
              // contract doesn't name. Never folded into `authorization_pending`: a real error
              // must never look like "still waiting", or it becomes invisible.
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
        // The OpenAPI contract only documents 201; a real deployment can still answer 429 (the
        // `/device` rate rule, ADR-0024) or another non-2xx — httpClient resolves rather than
        // throws on those (packages/api-client/src/http-client.ts), so this is the one place
        // that turns "not what the type promised" into an honest, reason-carrying `error` state
        // rather than rendering a QR for a code that was never actually minted.
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
        // RFC 8628 §3.4: start polling with the code the server just minted, no faster than the
        // `interval` it returned alongside it.
        schedulePoll(result.data.deviceCode, result.data.interval)
      },
      onError: () => setState({ kind: 'error', reason: 'unreachable' }),
    })
  }

  useEffect(() => {
    if (!enabled || hasStarted.current) return
    hasStarted.current = true
    requestNewCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `requestNewCode` reads the
    // mutations via refs precisely so this effect never needs it as a dependency; `hasStarted`
    // is what keeps this to exactly one real mint no matter how `enabled` flips afterward.
  }, [enabled])

  // The countdown (§5, state 3 `knapp`) — one tick per second while `ready`. Keyed on the code
  // itself, not on `secondsRemaining`, or this would tear itself down and restart every second.
  useEffect(() => {
    if (state.kind !== 'ready') return
    const id = setInterval(() => {
      setState((prev) => (prev.kind === 'ready' ? { ...prev, secondsRemaining: Math.max(prev.secondsRemaining - 1, 0) } : prev))
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on entering `ready` for this
    // exact code, not on every tick's own `secondsRemaining` change.
  }, [state.kind === 'ready' ? state.userCode : null])

  // The countdown reaching 0 is what actually expires the code now (replacing the old,
  // separately-tracked `expiryTimer`) — one fewer timer to keep in sync with the display.
  useEffect(() => {
    if (state.kind === 'ready' && state.secondsRemaining <= 0) {
      stopPolling()
      setState({ kind: 'expired' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to `state` transitions only.
  }, [state])

  // §4(1) — bounded, backing-off auto-retry, 'unreachable'/'server' only. Never 'rate-limited'
  // (ADR-0024's own brake — a UI that auto-retries into it is fighting the server on purpose),
  // never `expired`/`denied` (answers, not failures). The manual "Erneut versuchen" affordance
  // stays available throughout — a user who just fixed their WiFi shouldn't have to wait out
  // the backoff.
  //
  // Musti's #298 review, F1 — the real bug: `retryAttempt` used to reset to 0 whenever `state`
  // was NOT an auto-retryable error, and `requestNewCode()` itself commits `{ kind: 'loading' }`
  // *before* the mint resolves — so every single automatic retry re-entered this effect via
  // 'loading' first, reset the counter, and the backoff never actually grew: measured at a
  // constant ~2300ms/attempt (base delay + overhead) rather than doubling. Confirmed synchronous
  // MSW rejections (what this file's own tests used) never exposed it — React can commit
  // 'loading' and the following 'error' in the same microtask flush, skipping the render this
  // bug depended on; a *real* network round trip (or `delay(...)` in a test) never skips it. The
  // fix has two parts, both required: (a) only genuine recovery resets the counter now — `ready`,
  // not "any non-error state" — so passing through 'loading' on the way to the *next* failure no
  // longer erases how many attempts already happened; (b) `MAX_AUTO_RETRIES` bounds the attempt
  // COUNT, not just each individual delay — `RETRY_CAP_MS` alone only slows the hammering down to
  // one request per 16s forever, it never stops it.
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
    // Only a genuine mint SUCCESS counts as recovery — passing through on the way to another
    // failure (the exact bug above) must not look like one.
    if (state.kind === 'ready') {
      retryAttempt.current = 0
    }
    setAutoRetryStatus(null)
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `requestNewCode` reads the
    // mutations via refs; only a genuine `state` transition should (re)schedule a retry.
  }, [state])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [])

  return { state, requestNewCode, autoRetryStatus }
}
