import type { PrismaClient } from '@prisma/client'
import type { GenericEndpointContext } from 'better-auth'
import { resolveGuestSessionSecret, verifyGuestSession } from './guest-session.js'
import { GUEST_SESSION_COOKIE } from './user-context.guard.js'

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

    if (guestProfile && !accountProfile) {
      await tx.profile.update({ where: { userId: guestUserId }, data: { userId: accountUserId } })
      await tx.taxDataAccessLog.updateMany({ where: { userId: guestUserId }, data: { userId: accountUserId } })
      await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'profile' } })
    }

    const guestYears = await tx.interviewAnswer.findMany({
      where: { userId: guestUserId },
      select: { taxYear: true },
      distinct: ['taxYear'],
    })
    // A year the account already has data for stays untouched; every other guest year moves over.
    const years = guestYears.map(({ taxYear }) => taxYear)
    const [accountAnswers, accountTaxYears] = await Promise.all([
      tx.interviewAnswer.findMany({ where: { userId: accountUserId, taxYear: { in: years } }, select: { taxYear: true }, distinct: ['taxYear'] }),
      tx.taxYear.findMany({ where: { userId: accountUserId, taxYear: { in: years } }, select: { taxYear: true } }),
    ])
    const taken = new Set([...accountAnswers, ...accountTaxYears].map(({ taxYear }) => taxYear))
    const movable = years.filter((taxYear) => !taken.has(taxYear))
    const movedInterview = movable.length > 0
    if (movedInterview) {
      await tx.interviewAnswer.updateMany({ where: { userId: guestUserId, taxYear: { in: movable } }, data: { userId: accountUserId } })
      await tx.taxYear.updateMany({ where: { userId: guestUserId, taxYear: { in: movable } }, data: { userId: accountUserId } })
    }
    if (movedInterview) {
      await tx.taxDataAccessLog.updateMany({ where: { userId: guestUserId, resource: 'interview' }, data: { userId: accountUserId } })
      await tx.taxDataAccessLog.create({ data: { userId: accountUserId, action: 'WRITE', resource: 'interview' } })
    }
  })
}

export function createGuestAccountUpgradeHook(
  prisma: PrismaClient,
): (session: { userId: string }, context: GenericEndpointContext | null) => Promise<void> {
  return async (session, context) => {
    if (!context) return

    const guestToken = context.getCookie(GUEST_SESSION_COOKIE)
    if (!guestToken) return

    const guestUserId = verifyGuestSession(guestToken, resolveGuestSessionSecret())
    if (!guestUserId) return

    await upgradeGuestToAccount(prisma, guestUserId, session.userId)

    context.setCookie(GUEST_SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  }
}
