// Seeds N account users for scripts/loadtest/multi-user.mjs: each with a signed better-auth session cookie,
// receipts and chat history in realistic proportions. Writes one cookie per line to LOADTEST_COOKIES.
// Run against a throwaway database only:
//   LOADTEST_USERS=1000 LOADTEST_COOKIES=/tmp/cookies.txt pnpm --filter @steuereule/api exec tsx scripts/loadtest-seed.ts
import 'reflect-metadata'
import { createHmac, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../src/auth/auth.tokens.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../src/prisma/encrypted-prisma.provider.js'

const USERS = Number(process.env.LOADTEST_USERS ?? 1000)
const OUT = process.env.LOADTEST_COOKIES
const TAX_YEAR = 2025
const RECEIPTS_PER_USER = 20
const MESSAGES_PER_USER = 300
const KINDS = ['Lohnausweis', 'Saeule3a', 'Krankenkasse', 'Steuerbescheid', 'Sonstiges', null]

const action = (n: number, withReceipt: boolean) => ({
  actionId: `a${n}`,
  ...(withReceipt ? { receiptId: `r${n % 40}` } : {}),
  status: 'pending',
  screen: 'interview',
  field: 'spenden-betrag',
  instance: null,
  label: 'Spenden',
  previousValue: null,
  newValue: '100',
  reason: 'x'.repeat(500),
  sourceId: 'estg-4-5-6c',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
})

/** Every second message is an assistant turn; 5 % of those carry receipt drafts, 40 % an open proposal. */
function metaOf(n: number): string | null {
  if (n % 2 === 1) return null
  const share = (n / 2) % 100
  if (share < 5) return JSON.stringify({ actions: [action(n, true), action(n + 1, true)] })
  if (share < 45) return JSON.stringify({ actions: [action(n, false)], text: 'y'.repeat(800) })
  return null
}

async function main(): Promise<void> {
  if (!OUT) throw new Error('Set LOADTEST_COOKIES to the file the session cookies are written to.')
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  const bundle = app.get<BetterAuthBundle>(BETTER_AUTH_BUNDLE)
  const prisma = app.get<EncryptedPrismaClient>(ENCRYPTED_PRISMA)
  const ctx = await bundle.auth.$context
  const cookies: string[] = []
  const startedAt = Date.now()
  for (let i = 0; i < USERS; i++) {
    const user = await ctx.internalAdapter.createUser({ email: `load${i}-${randomUUID().slice(0, 6)}@steuereule.test`, name: `Load ${i}`, emailVerified: true }, { method: 'email-password' })
    const session = await ctx.internalAdapter.createSession(user.id)
    const signature = createHmac('sha256', ctx.secret).update(session.token).digest('base64')
    cookies.push(`${bundle.sessionCookieName}=${encodeURIComponent(`${session.token}.${signature}`)}`)
    await prisma.receipt.createMany({
      data: Array.from({ length: RECEIPTS_PER_USER }, (_, n) => ({
        userId: user.id,
        fileName: `beleg-${n}.pdf`,
        kind: KINDS[n % KINDS.length] ?? null,
        taxYear: n % 3 === 0 ? null : TAX_YEAR,
        createdAt: new Date(Date.now() - n * 3_600_000),
      })),
    })
    await prisma.advisorChatMessage.createMany({
      data: Array.from({ length: MESSAGES_PER_USER }, (_, n) => ({
        userId: user.id,
        taxYear: TAX_YEAR,
        role: n % 2 === 0 ? 'assistant' : 'user',
        content: 'Hallo '.repeat(60),
        status: 'complete',
        metaJson: metaOf(n),
        createdAt: new Date(Date.now() - (MESSAGES_PER_USER - n) * 60_000),
      })),
    })
    if (i % 100 === 99) console.log(`seeded ${i + 1}/${USERS} in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`)
  }
  writeFileSync(OUT, cookies.join('\n'))
  await app.close()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
