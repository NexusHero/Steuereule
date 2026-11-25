import type { PrismaClient } from '@prisma/client'
import type { GenericEndpointContext } from 'better-auth'
import { withSystemDatabaseAccess } from '../common/database-identity.js'
import { delegateName, entriesWhere, type PersonalDataEntry } from '../personal-data/personal-data-registry.js'
import { shadowIdOf } from '../common/shadow-id.js'
import { resolveGuestSessionSecret, verifyGuestSession } from './guest-session.js'
import { GUEST_SESSION_COOKIE } from './user-context.guard.js'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

interface MovableTable {
  count(args: { where: Record<string, unknown> }): Promise<number>
  updateMany(args: { where: Record<string, unknown>; data: { userId: string } }): Promise<{ count: number }>
}

/** Re-encrypts one guest receipt file for the account (the bytes are bound to the owner's key and id, ADR-0059). */
export interface ReceiptFileMover {
  move(fromUserId: string, toUserId: string, receiptId: string): Promise<void>
}

const table = (tx: TransactionClient, entry: PersonalDataEntry): MovableTable =>
  (tx as unknown as Record<string, MovableTable>)[delegateName(entry.model)]!

/**
 * REQ-006 / API-20: the first confirmed sign-in takes the guest's data into the account. Which tables move,
 * and how, comes from `personal-data-registry.ts` (`takeover`): every table a guest can write moves. Years
 * the account already has data for stay untouched and expire with the guest (ADR-0109 sweep).
 */
export async function upgradeGuestToAccount(
  prisma: PrismaClient,
  guestUserId: string,
  accountUserId: string,
  files?: ReceiptFileMover,
): Promise<void> {
  if (guestUserId === accountUserId) return
  // The guest's rows and the account's in one transaction: a path across two ids (P11).
  return withSystemDatabaseAccess('guest-takeover', () => moveGuestData(prisma, guestUserId, accountUserId, files))
}

async function moveGuestData(prisma: PrismaClient, guestUserId: string, accountUserId: string, files?: ReceiptFileMover): Promise<void> {
  const movedReceipts = await prisma.$transaction(async (tx) => {
    const from = { userId: guestUserId }
    const to = { userId: accountUserId }

    // The guest's years the account has no interview and no tax year for.
    const [guestAnswers, guestTaxYears] = await Promise.all([
      tx.interviewAnswer.findMany({ where: from, select: { taxYear: true }, distinct: ['taxYear'] }),
      tx.taxYear.findMany({ where: from, select: { taxYear: true } }),
    ])
    const years = [...new Set([...guestAnswers, ...guestTaxYears].map(({ taxYear }) => taxYear))]
    const [accountAnswers, accountTaxYears] = await Promise.all([
      tx.interviewAnswer.findMany({ where: { ...to, taxYear: { in: years } }, select: { taxYear: true }, distinct: ['taxYear'] }),
      tx.taxYear.findMany({ where: { ...to, taxYear: { in: years } }, select: { taxYear: true } }),
    ])
    const taken = new Set([...accountAnswers, ...accountTaxYears].map(({ taxYear }) => taxYear))
    const movable = years.filter((taxYear) => !taken.has(taxYear))

    const moved = new Set<string>()
    let receiptIds: string[] = []
    for (const entry of entriesWhere((e) => e.takeover.kind !== 'accountOnly' && e.takeover.kind !== 'none')) {
      const treatment = entry.takeover
      let count = 0
      if (treatment.kind === 'moveAll') {
        count = (await table(tx, entry).updateMany({ where: from, data: to })).count
      } else if (treatment.kind === 'moveYears') {
        if (movable.length > 0) count = (await table(tx, entry).updateMany({ where: { ...from, taxYear: { in: movable } }, data: to })).count
      } else if (treatment.kind === 'moveIfAbsent') {
        if ((await table(tx, entry).count({ where: to })) === 0) count = (await table(tx, entry).updateMany({ where: from, data: to })).count
      } else if (treatment.kind === 'step' && treatment.step === 'receipts' && entry.model === 'Receipt') {
        receiptIds = (await tx.receipt.findMany({ where: from, select: { id: true } })).map((receipt) => receipt.id)
        count = (await tx.receipt.updateMany({ where: from, data: to })).count
      } else if (treatment.kind === 'step' && treatment.step === 'coupling') {
        // The interview may have set up a joint return for the guest (UX review H3): it moves with its year,
        // its placeholder spouse renamed to the account's shadow id.
        const links = await tx.taxYearLink.findMany({ where: { personAUserId: guestUserId, taxYear: { in: movable } } })
        for (const link of links) {
          const placeholder = link.personBUserId === shadowIdOf(guestUserId, link.taxYear)
          await tx.taxYearLink.update({
            where: { id: link.id },
            data: { personAUserId: accountUserId, personBUserId: placeholder ? shadowIdOf(accountUserId, link.taxYear) : link.personBUserId },
          })
        }
        count = links.length
      }
      if (count > 0) moved.add(entry.model)
    }
    // What moved is a write to the account's data (REQ-004).
    if (moved.has('Profile')) await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'profile' } })
    if (moved.has('InterviewAnswer')) await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'interview' } })
    if (moved.has('Receipt')) await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'beleg' } })
    return receiptIds
  })

  // ReceiptFile and its key: each file is decrypted under the guest's key and stored again under the account's
  // (outside the transaction: the keys live in the keystore database). A file that fails stays with the guest.
  if (!files) return
  for (const receiptId of movedReceipts) {
    await files.move(guestUserId, accountUserId, receiptId).catch(() => undefined)
  }
}

export function createGuestAccountUpgradeHook(
  prisma: PrismaClient,
  files?: ReceiptFileMover,
): (session: { userId: string }, context: GenericEndpointContext | null) => Promise<void> {
  return async (session, context) => {
    if (!context) return

    const guestToken = context.getCookie(GUEST_SESSION_COOKIE)
    if (!guestToken) return

    const guestUserId = verifyGuestSession(guestToken, resolveGuestSessionSecret())
    if (!guestUserId) return

    await upgradeGuestToAccount(prisma, guestUserId, session.userId, files)

    context.setCookie(GUEST_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  }
}
