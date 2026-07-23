// Guest -> account upgrade (ADR-0012 §4, REQ-006): the guest's persisted data
// carries over atomically to the account identity the first time that account gets
// a real session while the guest cookie is still present.
//
// Wired as better-auth's `databaseHooks.session.create.after` (not
// `user.create.after`): a session is created on *every* real-identity path —
// sign-up (autoSignIn), plain sign-in, and (once REQ-008 lands) social sign-in —
// so this one hook covers "brand-new account, guest had data" (signup) *and*
// "returning account signs in while a stray guest cookie is still around" (the
// "account already owns a profile" edge case ADR-0012 §4 calls out) with no
// controller/service change, exactly the seam's whole point.
import type { PrismaClient } from '@prisma/client'
import type { GenericEndpointContext } from 'better-auth'
import { resolveGuestSessionSecret, verifyGuestSession } from './guest-session.js'
import { GUEST_SESSION_COOKIE } from './user-context.guard.js'

/**
 * The atomic, idempotent FK re-key at the heart of REQ-006. Exported separately from
 * the better-auth hook wiring so it's directly testable without going through
 * better-auth's request plumbing.
 *
 * Uses the *plain* (non-field-encryption-extended) Prisma client deliberately: this
 * only ever re-assigns the `userId` FK column, never reads or writes
 * steuerId/steuernummer, so it needs none of prisma-field-encryption's
 * decrypt/re-encrypt machinery — matching ADR-0009's "no re-encryption needed, the
 * key is app-wide" note.
 */
export async function upgradeGuestToAccount(
  prisma: PrismaClient,
  guestUserId: string,
  accountUserId: string,
): Promise<void> {
  if (guestUserId === accountUserId) return

  await prisma.$transaction(async (tx) => {
    const [guestProfile, accountProfile] = await Promise.all([
      tx.profile.findUnique({ where: { userId: guestUserId } }),
      tx.profile.findUnique({ where: { userId: accountUserId } }),
    ])

    // Guest has no profile: nothing to carry over — not an error, just a no-op.
    if (!guestProfile) return
    // Account already owns a profile: its data wins; the guest's profile is left
    // under the guest id, never silently merged/clobbered (Profile.userId is
    // @unique anyway — a blind re-key here would violate that constraint).
    if (accountProfile) return

    await tx.profile.update({ where: { userId: guestUserId }, data: { userId: accountUserId } })
    // Sanctioned append-only exception (ADR-0012 §4): this UPDATE transfers
    // *ownership* of already-recorded facts to the account that inherits them; it
    // does not alter what was recorded. Any future DB-level append-only enforcement
    // must whitelist this one migration path.
    await tx.taxDataAccessLog.updateMany({ where: { userId: guestUserId }, data: { userId: accountUserId } })
    await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'profile' } })
  })
}

/**
 * Builds better-auth's `databaseHooks.session.create.after` callback. Reads the
 * guest cookie straight off the in-flight request via `context.getCookie` (never
 * trusting an unsigned value — `verifyGuestSession` still gates it), runs the
 * migration, then retires the guest cookie on success so the next request resolves
 * via the account session (UserContextGuard's precedence rule, ADR-0012 §2).
 */
export function createGuestAccountUpgradeHook(
  prisma: PrismaClient,
): (session: { userId: string }, context: GenericEndpointContext | null) => Promise<void> {
  return async (session, context) => {
    // No real HTTP request context (e.g. a session created outside a request) —
    // there is no guest cookie to read, nothing to upgrade.
    if (!context) return

    const guestToken = context.getCookie(GUEST_SESSION_COOKIE)
    if (!guestToken) return

    const guestUserId = verifyGuestSession(guestToken, resolveGuestSessionSecret())
    if (!guestUserId) return // tampered/forged — never trusted, never acted on

    await upgradeGuestToAccount(prisma, guestUserId, session.userId)

    // Retire the guest session on success (ADR-0012 §4) regardless of whether there
    // was actually data to migrate — the guest identity is spent either way once a
    // real account session exists for this browser.
    context.setCookie(GUEST_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  }
}
