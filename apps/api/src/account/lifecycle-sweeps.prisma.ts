import { RETENTION } from '@steuereule/core'
import type { PrismaClient } from '@prisma/client'
import type { DeleteAccountResult } from './account-deletion.repository.js'
import { ownerOf } from './personal-data-registry.js'
import type { UnverifiedSweepDeps as UnverifiedSweepPort, UnverifiedSweepResult } from './lifecycle-sweep.repository.js'

export type UnverifiedSweepDeps = UnverifiedSweepPort & { readonly db: Db }

// The sweeps of the data lifecycle (P7). They run like the guest sweep (ADR-0029): piggybacked on traffic, at
// most once per interval and process, each step bounded, a failure never failing the request it rode on.
// Every clock is a parameter, so "30 days have passed" is an argument in the tests, not a wait (ADR-0030 §6).

const DAY_MS = 24 * 60 * 60 * 1000
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS)

/** Rows one step touches per run. */
export const LIFECYCLE_BATCH = 200

type Db = Pick<
  PrismaClient,
  'legalHold' | 'user' | 'session' | 'oauthAccessToken' | 'oauthRefreshToken' | 'deviceCode' | 'taxDataAccessLog'
>

// --- Legal holds --------------------------------------------------------------------------------------

/**
 * A hold has ended: when its account still exists, only the hold goes (the data is the account's again). When
 * the account was deleted, the hold goes and the erasure is run once more for that id — it now deletes what
 * the hold kept, exactly as the original deletion would have, and keeps whatever another hold still covers.
 */
export async function sweepEndedLegalHolds(
  db: Db,
  erase: (userId: string) => Promise<DeleteAccountResult>,
  now: Date,
): Promise<{ released: number; erasedFor: number }> {
  const ended = await db.legalHold.findMany({ where: { holdUntil: { lte: now } }, select: { id: true, userId: true }, take: LIFECYCLE_BATCH })
  if (ended.length === 0) return { released: 0, erasedFor: 0 }
  // A hold on a Person B row kept under a shadow id belongs to the account that keeps it.
  const userIds = [...new Set(ended.map((hold) => ownerOf(hold.userId)))]
  const living = new Set((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })).map((user) => user.id))
  let released = 0
  let erasedFor = 0
  const failures: unknown[] = []
  for (const userId of userIds) {
    const holdIds = ended.filter((hold) => ownerOf(hold.userId) === userId).map((hold) => hold.id)
    // The erasure comes first and the hold goes only after it succeeded: the hold is the one pointer to the rows
    // it kept. Were it deleted first and the erasure failed, nothing would ever find those rows again. An ended
    // hold no longer protects its row (the deletion asks for `holdUntil > now`), so the order is safe; a failed
    // erasure leaves the hold for the next run.
    try {
      if (!living.has(userId)) {
        await erase(userId)
        erasedFor += 1
      }
      released += (await db.legalHold.deleteMany({ where: { id: { in: holdIds } } })).count
    } catch (error) {
      // One account that cannot be erased must not keep the others waiting; it is reported once all were tried.
      failures.push(error)
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, `Legal-hold sweep: ${failures.length} account(s) could not be erased; their holds stay for the next run.`)
  return { released, erasedFor }
}

// --- Never-verified accounts (ADR-0030) ----------------------------------------------------------------

/**
 * ADR-0030: never-verified accounts. The T-7 warning goes out from day 23 (30 − 7), the T-1 reminder from day 29
 * and no sooner than 6 days after the first; the deletion needs all of: unverified, created more than 30 days ago,
 * and the T-7 warning recorded as sent at least 7 days ago (§3a) — the deadline floats with the warning. The
 * check and the delete share one transaction (`deleteUnverifiedAccount`, §4).
 */
export async function sweepUnverifiedAccounts(deps: UnverifiedSweepDeps, now: Date): Promise<UnverifiedSweepResult> {
  const { db, email } = deps
  const accountDays = RETENTION.unverifiedAccountDays
  const warningDays = RETENTION.unverifiedWarningDays
  const select = { id: true, email: true } as const

  let warned = 0
  const toWarn = await db.user.findMany({
    where: { emailVerified: false, createdAt: { lte: daysBefore(now, accountDays - warningDays) }, unverifiedWarningSentAt: null },
    select,
    take: LIFECYCLE_BATCH,
  })
  for (const user of toWarn) {
    // Recorded only after the send succeeded: a deletion is gated on a warning that really went out.
    await email.sendUnverifiedAccountWarning({ to: user.email, subject: 'Dein SteuerEule-Konto ist noch nicht bestätigt', url: deps.signInUrl, final: false })
    await db.user.updateMany({ where: { id: user.id, emailVerified: false }, data: { unverifiedWarningSentAt: now } })
    warned += 1
  }

  let finalWarned = 0
  const toRemind = await db.user.findMany({
    where: {
      emailVerified: false,
      createdAt: { lte: daysBefore(now, accountDays - 1) },
      unverifiedWarningSentAt: { lte: daysBefore(now, warningDays - 1) },
      unverifiedFinalWarningSentAt: null,
    },
    select,
    take: LIFECYCLE_BATCH,
  })
  for (const user of toRemind) {
    await email.sendUnverifiedAccountWarning({ to: user.email, subject: 'Letzte Erinnerung: Dein SteuerEule-Konto wird gelöscht', url: deps.signInUrl, final: true })
    await db.user.updateMany({ where: { id: user.id, emailVerified: false }, data: { unverifiedFinalWarningSentAt: now } })
    finalWarned += 1
  }

  let deleted = 0
  if (deps.mailIsDelivered) {
    const due = await db.user.findMany({
      where: {
        emailVerified: false,
        // Strictly older than 30 days (the boundary itself survives), and 7 days after the recorded warning.
        createdAt: { lt: daysBefore(now, accountDays) },
        unverifiedWarningSentAt: { not: null, lte: daysBefore(now, warningDays) },
      },
      select: { id: true },
      take: LIFECYCLE_BATCH,
    })
    for (const user of due) {
      if ((await deps.eraseUnverified(user.id)) !== null) deleted += 1
    }
  }
  return { warned, finalWarned, deleted }
}

// --- Growth: ended login records, the access log -------------------------------------------------------

/**
 * Sessions, assistant tokens and device logins that ended `RETENTION.endedLoginRecordDays` ago (H2-7): an
 * expired session no longer opens anything, a revoked or expired token neither; their IP, browser and scopes
 * have no purpose left.
 */
export async function sweepEndedLoginRecords(db: Db, now: Date): Promise<number> {
  const cutoff = daysBefore(now, RETENTION.endedLoginRecordDays)
  const ended = { OR: [{ expiresAt: { lt: cutoff } }, { revoked: { lt: cutoff } }] }
  const results = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    db.oauthAccessToken.deleteMany({ where: ended }),
    db.oauthRefreshToken.deleteMany({ where: ended }),
    db.deviceCode.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
  ])
  return results.reduce((sum, result) => sum + result.count, 0)
}

/**
 * Access-log rows older than `RETENTION.auditLogYears` (H2-7), the anonymised rows of deleted accounts
 * included. An account under an operator's access-log hold keeps its rows.
 */
export async function sweepOldAuditRows(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RETENTION.auditLogYears)
  const held = await db.legalHold.findMany({ where: { resource: 'auditLog', resourceId: null, holdUntil: { gt: now } }, select: { userId: true } })
  const { count } = await db.taxDataAccessLog.deleteMany({
    where: { createdAt: { lt: cutoff }, ...(held.length > 0 ? { userId: { notIn: held.map((hold) => hold.userId) } } : {}) },
  })
  return count
}
