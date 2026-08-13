// #349 — the one seam every `authClient.useSession()` consumer reads through now, replacing
// three call sites (`DeviceScreen.tsx`, `DatenschutzScreen.tsx`, `useEmailVerified.ts`) that each
// read `data`/`isPending` straight off the hook and silently dropped `error` on the floor. The
// measured defect: better-auth's own atom (`session-atom.mjs:88-98`) nulls `data` only on a 401;
// on a COLD START — the atom's own initial value is `data: null` — any OTHER failure (429, a 5xx,
// a genuine network error) settles at `data: null, error: <something>`, indistinguishable to a
// consumer reading only `data` from "you have no session". `DeviceScreen` turned that straight
// into `<LoginScreen>` for a user who, per the server, might be signed in just fine — we simply
// never got to ask, because the ceiling that answers `/get-session` is shared product-wide
// (issue #349's own measurement; #350 narrows *that*, not this).
//
// The seam decision (Musti's dispatch on #349 asked for a view, not just a fix): one hook behind
// which "signed out" and "could not tell" are different *values*, not the same `null` a caller has
// to remember to re-derive correctly at every call site. A per-screen patch — add an `if (error)`
// branch three times — would have closed today's three cases and drifted the instant a fourth
// screen reached for `useSession()` directly; nothing would stop it reading `data` alone again.
// Same instinct `failure-reason.ts` itself is built on: make the wrong read unrepresentable
// instead of relying on everyone remembering to check.
//
// `FailureReason` (`../net/failure-reason.ts`) is reused for the `unknown` branch's `reason`
// rather than invented fresh — the exact vocabulary #306/#308 built for "why didn't this request
// give us an answer", now applied to better-auth's own session read instead of `listSessions()`.
//
// The one rule that makes this a *fix* and not just a rename: **a known `data` always outranks a
// fresh `error`.** better-auth's atom already keeps `latest.data` on any non-401 failure — so a
// REFETCH of an already-established session surviving a 429 must keep reading as signed-in, and
// the issue is explicit that this case was never broken. Checking `data !== null` before `error`
// is what carries that already-correct behaviour into this hook, not a decision made fresh here.
import { useAuthClient } from './AuthClientProvider'
import type { AppAuthClient } from './auth-client'
import { classifyByStatus, type FailureReason, type MaybeHttpStatus } from '../net/failure-reason'

/** A real, signed-in better-auth session — never a guest cookie (ADR-0007/0012), which resolves
 *  to `null` here exactly like "no session at all" does. Derived from the hook itself, so this
 *  type can never drift from what `authClient.useSession()` actually returns. */
export type AccountSession = NonNullable<ReturnType<AppAuthClient['useSession']>['data']>

export type AccountSessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-in'; readonly session: AccountSession }
  /** The server told us, one way or another, that there is no session: a genuine 200 with none,
   *  or better-auth's own 401 — which its atom already treats as the one authoritative "signed
   *  out" answer (`session-atom.mjs:90`). */
  | { readonly status: 'signed-out' }
  /** We do not know, and say so rather than guessing either way. Never collapsed into
   *  `signed-out` — that collapse is this ticket's entire defect. */
  | { readonly status: 'unknown'; readonly reason: FailureReason }

export interface UseAccountSessionResult {
  readonly state: AccountSessionState
  /** The honest way out of `unknown` — better-auth's own `refetch`, never a silent auto-retry
   *  loop fighting whatever just rate-limited or failed us. Returns the same `Promise<void>`
   *  `refetch` does (not swallowed into fire-and-forget): `DatenschutzScreen`'s post-delete
   *  re-sync (Musti's #238 T1, F2) needs to `await` it before it's safe to hand back to the
   *  caller. */
  readonly retry: () => Promise<void>
}

/**
 * Pure by design and exported for its own focused, exhaustive unit test
 * (`useAccountSession.test.tsx`) — no React, no MSW, so every `(data, error, isPending)`
 * combination is a plain function call rather than a render. `useAccountSession` below is the
 * thin, necessarily-integration-tested wiring on top of it.
 *
 * `error` is deliberately `unknown`, not better-auth's own `BetterFetchError`: a genuine
 * transport failure reaches the atom as a raw thrown value (`session-atom.mjs`'s own `catch
 * (fetchError)` branch assigns it straight to `error` with no wrapping), so at runtime it may be
 * a bare `TypeError` with no `.status` at all, despite the hook's declared type. `extractStatus`
 * below reads it defensively, the same discipline `classifyByStatus`/`MaybeHttpStatus` already
 * apply to "a status we cannot actually trust the shape of".
 */
export function deriveAccountSessionState(data: AccountSession | null, error: unknown, isPending: boolean): AccountSessionState {
  if (isPending) return { status: 'loading' }
  // A known session — even a stale one kept alive through a failed refetch, per the module
  // header's rule — is still known, and outranks whatever `error` says.
  if (data !== null) return { status: 'signed-in', session: data }
  if (error) {
    const httpStatus = extractStatus(error)
    if (httpStatus === 401) return { status: 'signed-out' }
    return { status: 'unknown', reason: classifyByStatus(httpStatus) }
  }
  // No error, no data: the fetch completed and the honest answer was "no session".
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
