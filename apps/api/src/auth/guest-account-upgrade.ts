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
    let movedInterview = false
    for (const { taxYear } of guestYears) {
      const [accountAnswers, accountTaxYear] = await Promise.all([
        tx.interviewAnswer.count({ where: { userId: accountUserId, taxYear } }),
        tx.taxYear.count({ where: { userId: accountUserId, taxYear } }),
      ])
      if (accountAnswers > 0 || accountTaxYear > 0) continue

      await tx.interviewAnswer.updateMany({ where: { userId: guestUserId, taxYear }, data: { userId: accountUserId } })
      await tx.taxYear.updateMany({ where: { userId: guestUserId, taxYear }, data: { userId: accountUserId } })
      movedInterview = true
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
