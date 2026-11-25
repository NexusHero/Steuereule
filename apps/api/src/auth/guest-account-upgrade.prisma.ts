import type { PrismaClient } from '@prisma/client'
import type { GenericEndpointContext } from 'better-auth'
import { Logger } from '@nestjs/common'
import { withSystemDatabaseAccess } from '../common/database-identity.js'
import { joinTransaction } from '../prisma/transaction.js'
import { delegateName, entriesWhere, shadowIdOf, type PersonalDataEntry } from '../account/personal-data-registry.js'
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

/** Whether everything the guest owned is with the account now; `false` means a retry has work left. */
export interface TakeoverResult {
  readonly complete: boolean
  /** Receipts that stayed with the guest, row and file, because the file could not be stored for the account. */
  readonly receiptsLeftBehind: readonly string[]
}

/** A file of up to 10 MB is decrypted, encrypted and written in the receipt's transaction. */
const RECEIPT_MOVE_TIMEOUT_MS = 30_000

/**
 * REQ-006 / API-20: the first confirmed sign-in takes the guest's data into the account. Which tables move,
 * and how, comes from `personal-data-registry.ts` (`takeover`): every table a guest can write moves. Years
 * the account already has data for stay untouched and expire with the guest (ADR-0109 sweep).
 *
 * The tables move in one transaction. Each receipt then moves in a transaction of its own, row and file
 * together: a receipt is never the account's while its bytes are still encrypted for the guest. One whose
 * file cannot be stored for the account stays with the guest as a whole and is named in the result; running
 * the takeover again moves what is left.
 */
export async function upgradeGuestToAccount(
  prisma: PrismaClient,
  guestUserId: string,
  accountUserId: string,
  files?: ReceiptFileMover,
): Promise<TakeoverResult> {
  if (guestUserId === accountUserId) return { complete: true, receiptsLeftBehind: [] }
  // The guest's rows and the account's in one transaction: a path across two ids (P11).
  return withSystemDatabaseAccess('guest-takeover', async () => {
    await moveGuestTables(prisma, guestUserId, accountUserId)
    const receiptsLeftBehind = await moveGuestReceipts(prisma, guestUserId, accountUserId, files)
    return { complete: receiptsLeftBehind.length === 0, receiptsLeftBehind }
  })
}

async function moveGuestTables(prisma: PrismaClient, guestUserId: string, accountUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
    for (const entry of entriesWhere((e) => e.takeover.kind !== 'accountOnly' && e.takeover.kind !== 'none')) {
      const treatment = entry.takeover
      let count = 0
      if (treatment.kind === 'moveAll') {
        count = (await table(tx, entry).updateMany({ where: from, data: to })).count
      } else if (treatment.kind === 'moveYears') {
        if (movable.length > 0) count = (await table(tx, entry).updateMany({ where: { ...from, taxYear: { in: movable } }, data: to })).count
      } else if (treatment.kind === 'moveIfAbsent') {
        if ((await table(tx, entry).count({ where: to })) === 0) count = (await table(tx, entry).updateMany({ where: from, data: to })).count
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
    // What the guest recorded for Person B lives under the guest's shadow id of the year (`spouse_<guest>_<year>`):
    // it moves to the account's shadow id of the same year, or the renamed coupling above would point at nothing
    // and the guest sweep would erase B's answers.
    for (const taxYear of movable) {
      const fromShadow = { userId: shadowIdOf(guestUserId, taxYear) }
      const toShadow = { userId: shadowIdOf(accountUserId, taxYear) }
      for (const entry of entriesWhere((e) => e.tie === 'userId' && (e.takeover.kind === 'moveAll' || e.takeover.kind === 'moveYears' || e.takeover.kind === 'moveIfAbsent'))) {
        if (entry.takeover.kind === 'moveIfAbsent' && (await table(tx, entry).count({ where: toShadow })) > 0) continue
        await table(tx, entry).updateMany({ where: fromShadow, data: toShadow })
      }
    }
    // What moved is a write to the account's data (REQ-004).
    if (moved.has('Profile')) await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'profile' } })
    if (moved.has('InterviewAnswer')) await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'interview' } })
  })
}

/**
 * Registry step `receipts` (Receipt and ReceiptFile). The file's bytes are bound to their owner by the key and
 * the AAD (ADR-0059), so they are decrypted under the guest's key and stored again under the account's. That
 * write joins the transaction that moves the receipt's row; only the account's key itself lives in the keystore
 * database, and creating it is harmless when the transaction rolls back.
 */
async function moveGuestReceipts(prisma: PrismaClient, guestUserId: string, accountUserId: string, files?: ReceiptFileMover): Promise<string[]> {
  const receiptIds = (await prisma.receipt.findMany({ where: { userId: guestUserId }, select: { id: true }, orderBy: { id: 'asc' } })).map((receipt) => receipt.id)
  const leftBehind: string[] = []
  let moved = 0
  for (const receiptId of receiptIds) {
    try {
      await prisma.$transaction(
        (tx) =>
          joinTransaction(tx, async () => {
            if (files) await files.move(guestUserId, accountUserId, receiptId)
            await tx.receipt.updateMany({ where: { id: receiptId, userId: guestUserId }, data: { userId: accountUserId } })
          }),
        { timeout: RECEIPT_MOVE_TIMEOUT_MS },
      )
      moved += 1
    } catch {
      leftBehind.push(receiptId)
    }
  }
  if (moved > 0) await prisma.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'beleg' } })
  return leftBehind
}

export function createGuestAccountUpgradeHook(
  prisma: PrismaClient,
  files?: ReceiptFileMover,
  onIncomplete: (result: TakeoverResult) => void = reportIncompleteTakeover,
): (session: { userId: string }, context: GenericEndpointContext | null) => Promise<void> {
  return async (session, context) => {
    if (!context) return

    const guestToken = context.getCookie(GUEST_SESSION_COOKIE)
    if (!guestToken) return

    const guestUserId = verifyGuestSession(guestToken, resolveGuestSessionSecret())
    if (!guestUserId) return

    const result = await upgradeGuestToAccount(prisma, guestUserId, session.userId, files)
    if (!result.complete) {
      // The guest cookie stays: the next sign-in runs the takeover again and moves what is left. Until then
      // those receipts are the guest's, row and file, and the guest clock keeps them.
      onIncomplete(result)
      return
    }

    context.setCookie(GUEST_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  }
}

const logger = new Logger('GuestAccountUpgrade')

/** Counts only: receipt ids are not personal data, but nothing more than the number is needed to alert on. */
function reportIncompleteTakeover(result: TakeoverResult): void {
  logger.error(`Guest takeover incomplete: ${result.receiptsLeftBehind.length} receipt(s) stayed with the guest and will be retried at the next sign-in.`)
}
