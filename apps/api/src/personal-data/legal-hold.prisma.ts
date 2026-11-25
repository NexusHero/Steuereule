import { RETENTION } from '@steuereule/core'
import type { PrismaClient } from '@prisma/client'

// Legal holds on single rows (P7, stakeholder decision 2). The privacy text (`screens/legal/texts.ts`, § 5) and
// the deletion dialog print `RETENTION.legalHold*`; the periods below are those constants, so the code keeps
// exactly the promise the text makes:
//
// - A paid unlock (`Unlock`, status `bezahlt`) is a Buchungsbeleg: held `legalHoldPaymentYears` from the end of
//   the calendar year of the payment (§ 147 Abs. 1 Nr. 4, Abs. 3 AO; § 257 Abs. 1 Nr. 4, Abs. 4 HGB).
// - A refund (`erstattet`) does not end the hold: the refund is a booking of its own and needs the payment
//   record next to it. The hold runs from the end of the later year, the payment's or the refund's.
// - A dispute (`angefochten`) and its end change nothing: the payment happened.
// - A session that never paid (`offen`, `abgelaufen`) is no payment and is never held.
// - A submitted version (`FilingVersion`) is held `legalHoldFilingVersionYears` from the end of the year it was
//   submitted in (§ 169 Abs. 2 Satz 1 Nr. 2, § 170 AO). A correction replaces the version and takes the hold
//   over; withdrawing a submission ("not submitted after all") removes the version and its hold.
//
// The holds bite on account deletion: `deleteAccountTransaction` keeps every row with an active hold, reports
// what it kept and until when, and the lifecycle sweep deletes the row once the hold has ended.

type HoldClient = Pick<PrismaClient, 'legalHold'>

export const HOLD_RESOURCE = { unlock: 'unlock', filingVersion: 'filingVersion' } as const

export const HOLD_REASON = {
  unlock: '§ 147 AO, § 257 HGB',
  filingVersion: '§ 169, § 170 AO',
} as const

/** The first instant after `years` full calendar years following the end of `year` (UTC). */
export function endOfPeriodAfterYear(year: number, years: number): Date {
  return new Date(Date.UTC(year + years + 1, 0, 1))
}

export function paymentHoldUntil(paidAt: Date): Date {
  return endOfPeriodAfterYear(paidAt.getUTCFullYear(), RETENTION.legalHoldPaymentYears)
}

/** `submittedOn` is the ISO day (yyyy-mm-dd) the user says it was submitted. */
export function filingVersionHoldUntil(submittedOn: string, fallback: Date): Date {
  const year = Number(submittedOn.slice(0, 4))
  return endOfPeriodAfterYear(Number.isInteger(year) && year >= 2000 ? year : fallback.getUTCFullYear(), RETENTION.legalHoldFilingVersionYears)
}

/** Creates the hold, or moves an existing one later (never earlier). */
async function holdAtLeastUntil(client: HoldClient, hold: { userId: string; resource: string; resourceId: string; reason: string; until: Date }): Promise<void> {
  const existing = await client.legalHold.findUnique({ where: { resource_resourceId: { resource: hold.resource, resourceId: hold.resourceId } } })
  if (!existing) {
    await client.legalHold.create({ data: { userId: hold.userId, resource: hold.resource, resourceId: hold.resourceId, reason: hold.reason, holdUntil: hold.until } })
    return
  }
  if (existing.holdUntil < hold.until) await client.legalHold.update({ where: { id: existing.id }, data: { holdUntil: hold.until } })
}

/** A payment confirmed by the webhook (`bezahlt`). */
export function holdPaidUnlock(client: HoldClient, unlock: { id: string; userId: string; paidAt: Date | null }, now: Date): Promise<void> {
  return holdAtLeastUntil(client, {
    userId: unlock.userId,
    resource: HOLD_RESOURCE.unlock,
    resourceId: unlock.id,
    reason: HOLD_REASON.unlock,
    until: paymentHoldUntil(unlock.paidAt ?? now),
  })
}

/** A refund: the payment record stays, the period counts from the end of the refund year if that is later. */
export function holdRefundedUnlock(client: HoldClient, unlock: { id: string; userId: string; paidAt: Date | null }, refundedAt: Date): Promise<void> {
  const paidUntil = paymentHoldUntil(unlock.paidAt ?? refundedAt)
  const refundUntil = paymentHoldUntil(refundedAt)
  return holdAtLeastUntil(client, {
    userId: unlock.userId,
    resource: HOLD_RESOURCE.unlock,
    resourceId: unlock.id,
    reason: HOLD_REASON.unlock,
    until: refundUntil > paidUntil ? refundUntil : paidUntil,
  })
}

export function holdFilingVersion(client: HoldClient, version: { id: string; userId: string; submittedOn: string }, now: Date): Promise<void> {
  return holdAtLeastUntil(client, {
    userId: version.userId,
    resource: HOLD_RESOURCE.filingVersion,
    resourceId: version.id,
    reason: HOLD_REASON.filingVersion,
    until: filingVersionHoldUntil(version.submittedOn, now),
  })
}

/** The versions are gone (replaced by a correction, or the submission withdrawn): so are their holds. */
export async function releaseFilingVersionHolds(client: HoldClient, versionIds: readonly string[]): Promise<void> {
  if (versionIds.length === 0) return
  await client.legalHold.deleteMany({ where: { resource: HOLD_RESOURCE.filingVersion, resourceId: { in: [...versionIds] } } })
}
