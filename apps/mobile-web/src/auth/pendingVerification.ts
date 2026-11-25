/**
 * A registration that waits for its verification link (WEB-4). After sign-up the person is still a guest until
 * the link is followed and they sign in (ADR-0109 §11). The account wall then says „Bestätige deine E-Mail“
 * instead of offering „Konto anlegen“ again. Kept per browser only; cleared on the next sign-in. A week is far
 * longer than the link lives; after that the wall offers both ways again.
 */
export const PENDING_VERIFICATION_STORAGE_KEY = 'steuereule.pendingVerification'
const PENDING_VERIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function rememberPendingVerification(email: string, now: number = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(PENDING_VERIFICATION_STORAGE_KEY, JSON.stringify({ email, at: now }))
  } catch {
    // storage disabled (private mode / native env): the wall falls back to both ways
  }
}

export function readPendingVerification(now: number = Date.now()): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_VERIFICATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown }
    if (typeof parsed.email !== 'string' || typeof parsed.at !== 'number') return null
    if (now - parsed.at > PENDING_VERIFICATION_MAX_AGE_MS) return null
    return parsed.email
  } catch {
    return null
  }
}

export function clearPendingVerification(): void {
  try {
    globalThis.localStorage?.removeItem(PENDING_VERIFICATION_STORAGE_KEY)
  } catch {
    // nothing to clear
  }
}
