// Shared by RegistrierungScreen and LoginScreen (#194, #217 — ADR-0012 amendment). Both screens
// show a "please verify" state for an account and must notice, live, once verification completes
// out of band (mail client, another device/tab) — never a value snapshotted at sign-up/sign-in
// and left stale. better-auth's session atom re-fetches on tab focus (`refetchOnWindowFocus`,
// pinned in auth-client.ts), so `useSession()` alone gives the live read; this hook adds the two
// rules that must not drift between the two call sites:
//   - fail-closed: only a *positive* `emailVerified === true` turns the banner off. The atom
//     keeps its last-known `data` on a non-401 fetch error rather than clearing it
//     (session-atom.mjs), so a missing/errored read must never be read as "verified".
//   - account-scoped: `sessionData` can belong to a different, already-verified account (a
//     session mid-refetch right after signup, the atom's stale last-known session, or — on
//     LoginScreen specifically — a second person's still-live session on a shared device). Only
//     a session whose `user.email` matches the account this screen is actually showing counts.
//
// Because a hook can't be conditional, `useSession()` mounts on every render of its host, not
// just the branch that shows a banner — on LoginScreen that means the bare sign-in form now
// issues one `GET /api/auth/get-session` too (Musti's #217 review, recorded rather than left
// implicit). Accepted: with no session cookie the endpoint short-circuits without touching the
// store, so the unauthenticated common case stays cheap, and this is what a session-aware app
// does anyway. If we ever want it scoped to the unverified branch only, the answer is a child
// component rendered just there — not worth it for one short-circuiting request today.
import { useAuthClient } from './AuthClientProvider'

/**
 * Whether `email` — the server-derived value the screen is showing a stage for, never a raw
 * input field — is verified right now, per the live session. Re-evaluates on every render.
 * `email` is `undefined` when the host screen has no account to show a stage for yet; that is
 * an absence, not a value, and fails closed the same as any other unresolved case.
 */
export function useEmailVerified(email: string | undefined): boolean {
  const authClient = useAuthClient()
  const { data: sessionData } = authClient.useSession()
  if (!email) return false
  return sessionData?.user.emailVerified === true && sessionData.user.email === email
}
