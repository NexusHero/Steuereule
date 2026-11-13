// ADR-0073 — the owl drafts the spouse's figures for Person B, against the REAL model and a real
// Postgres. A married couple, the wife has no account of her own: the husband tells the owl her
// Swiss salary certificate and her commute. The drafts must be for Person B, land in her record
// once applied, and leave his own fields untouched.
//
// Not a gate: the model is not deterministic. Skipped without the key; see vitest.live.config.ts:
//
//   DATABASE_URL=… AI_EVAL_GEMINI_API_KEY=… pnpm --filter @steuereule/api exec vitest run \
//     --config vitest.live.config.ts test/live/owl-person-b.live.test.ts
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { AdvisorActionProposal, AdvisorMessageMeta } from '@steuereule/core'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdvisorService } from '../../src/advisor/advisor.service.js'
import { AppModule } from '../../src/app.module.js'
import { ConfirmationService } from '../../src/confirmation/confirmation.service.js'
import { LinkService } from '../../src/link/link.service.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

const KEY = process.env.AI_EVAL_GEMINI_API_KEY?.trim()
const YEAR = 2025

describe.skipIf(!KEY)('the owl drafts the spouse’s figures for Person B (live model)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let advisor: AdvisorService
  let confirmation: ConfirmationService
  let link: LinkService
  const users: string[] = []

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = KEY
    process.env.AI_ADVISOR_PROVIDER = 'google-genai'
    if (process.env.AI_EVAL_GEMINI_MODEL) process.env.AI_ADVISOR_MODEL = process.env.AI_EVAL_GEMINI_MODEL
    delete process.env.AI_FAKE_KI
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    advisor = app.get(AdvisorService)
    confirmation = app.get(ConfirmationService)
    link = app.get(LinkService)
  })

  afterAll(async () => {
    const tables = prisma as unknown as Record<string, { deleteMany(args: unknown): Promise<unknown> } | undefined>
    for (const userId of users) {
      for (const table of ['advisorChatMessage', 'advisorConversation', 'advisorNote', 'marking', 'interviewAnswer', 'taxDataAccessLog', 'commute', 'lstb', 'chSalaryCertificate', 'profile', 'masterData', 'taxYear']) {
        await tables[table]?.deleteMany({ where: { userId } }).catch(() => {})
      }
    }
    await prisma.taxYearLink.deleteMany({ where: { personAUserId: { in: users } } }).catch(() => {})
    await app.close()
  })

  it('drafts the wife’s Swiss salary and commute for Person B; applied, they land in her masks', async () => {
    const userId = `live-${randomUUID()}`
    users.push(userId)
    // What the user sets up in the masks himself: married, joint return, the wife without an account.
    await confirmation.writeConfirmedByAdvisor(userId, YEAR, 'interview.familienstand', 'Verheiratet')
    await link.set(userId, YEAR, { filingType: 'zusammen' })
    await link.updatePersonB(userId, YEAR, { firstName: 'Büsra', lastName: 'Testfall' })
    const spouse = await link.dataUser(userId, YEAR, 'B')
    users.push(spouse)

    const response = await advisor.sendMessage(userId, YEAR, {
      message:
        'Meine Frau Büsra arbeitet als Grenzgängerin in Basel. Laut ihrem Lohnausweis 2025: Bruttolohn 84.000 CHF, Quellensteuer 3.780 CHF. Sie fährt 24 km einfach zur Arbeit. Bitte trag das für sie ein.',
    })
    expect(response.mode, 'the turn must be answered by the model').toBe('langgraph')
    const meta = (response.assistantMessage.meta ?? {}) as AdvisorMessageMeta
    const drafts: AdvisorActionProposal[] = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
    const forB = drafts.filter((draft) => draft.person === 'B')
    expect(drafts.filter((draft) => draft.person !== 'B'), 'nothing of hers may be drafted as his').toEqual([])
    expect(forB.map((draft) => `${draft.screen}.${draft.field}`)).toEqual(expect.arrayContaining(['commute.oneWayKm']))
    expect(forB.some((draft) => draft.screen === 'chLohnausweis')).toBe(true)
    // The model never saw her name.
    expect(response.userMessage.content).not.toContain('Büsra')

    await advisor.applyBatch(userId, YEAR, { drafts: forB.map((draft) => ({ actionId: draft.actionId })) })

    expect(await confirmation.readRawValue(spouse, YEAR, 'commute.oneWayKm')).toBe('24')
    const certificate = await Promise.all(
      forB.filter((draft) => draft.screen === 'chLohnausweis').flatMap((draft) => [draft.field, ...Object.keys(draft.companionFields ?? {})]).map(async (field) => [field, await confirmation.readRawValue(spouse, YEAR, `chLohnausweis.${field}`)] as const),
    )
    expect(Object.fromEntries(certificate)).toMatchObject({ 'bruttolohn-total': '84000' })
    // His own masks stay as they were.
    expect(await confirmation.readRawValue(userId, YEAR, 'commute.oneWayKm').catch(() => null)).toBeNull()
    expect(await confirmation.readRawValue(userId, YEAR, 'chLohnausweis.bruttolohn-total').catch(() => null)).toBeNull()
  })
})
