// A real household's year, told to the owl through the chat and its receipts, then printed and
// compared outside this repository with the return an adviser prepared. The case itself never lives
// here: it is read from REAL_CASE_FILE (JSON outside the repo), and without it the test is skipped.
// Results (conversation, stored fields, printed form fields) go to REAL_CASE_OUT, also outside.
//
//   REAL_CASE_FILE=/…/case.json REAL_CASE_OUT=/…/out DATABASE_URL=… AI_EVAL_GEMINI_API_KEY=… \
//     pnpm exec vitest run --config vitest.live.config.ts test/live/owl-real-case.live.test.ts
//
// What a user types into the masks herself (names, tax ID, address, IBAN, the coupling, children's
// names) and what the chat cannot reach (Person B's figures) is set up "by hand" from the case file;
// everything else goes through the owl. Delete the database afterwards.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { AdvisorActionProposal, AdvisorMessageMeta } from '@steuereule/core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { AdvisorService } from '../../src/advisor/advisor.service.js'
import { AppModule } from '../../src/app.module.js'
import { ChSalaryCertificateService } from '../../src/ch-salary-certificate/ch-salary-certificate.service.js'
import { ChildrenService } from '../../src/children/children.service.js'
import { CommuteService } from '../../src/commute/commute.service.js'
import { ConfirmationService } from '../../src/confirmation/confirmation.service.js'
import { LinkService } from '../../src/link/link.service.js'
import { MasterDataService } from '../../src/master-data/master-data.service.js'
import { PrintoutService } from '../../src/printout/printout.service.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import { ProfileService } from '../../src/profile/profile.service.js'
import { InterviewService } from '../../src/interview/interview.service.js'
import { ReceiptParseService } from '../../src/receipt/receipt-parse.service.js'
import { TaxEstimateService } from '../../src/tax-estimate/tax-estimate.service.js'

const KEY = process.env.AI_EVAL_GEMINI_API_KEY?.trim()
const CASE_FILE = process.env.REAL_CASE_FILE
const OUT = process.env.REAL_CASE_OUT ?? '/tmp/real-case'
/** Continue a case already set up and told: only the by-hand steps and the results run again. */
const RESUME = process.env.REAL_CASE_RESUME === '1'

interface RealCase {
  readonly year: number
  readonly userId: string
  readonly personA: { readonly profile: Record<string, unknown>; readonly masterData: Record<string, unknown> }
  readonly personB?: Record<string, unknown>
  readonly children?: readonly { readonly create: Record<string, unknown>; readonly userFields?: Record<string, unknown> }[]
  /** Messages to the owl, in order. */
  readonly chat: readonly string[]
  /** Messages sent when a case is resumed. */
  readonly followUp?: readonly string[]
  /** Receipts as the app's upload sends them: file name and the text read from the document. */
  readonly receipts?: readonly { readonly fileName: string; readonly textFile: string }[]
  /** What the user enters in the masks herself after the chat, per person: Swiss certificate fields, provision, N-Gre, commute. */
  readonly byHand?: {
    readonly A?: ByHand
    readonly B?: ByHand
  }
}

interface ByHand {
  /** Interview answers given in the mask, in order (question id → answer). */
  readonly interview?: readonly (readonly [string, string])[]
  readonly chFields?: Readonly<Record<string, number>>
  readonly chProvision?: Record<string, unknown>
  readonly chNGre?: Record<string, unknown>
  readonly chExchangeRate?: Record<string, unknown>
  readonly commute?: Record<string, unknown>
}

describe.skipIf(!KEY || !CASE_FILE)('a real case through the chat (live model, by hand)', () => {
  let app: NestFastifyApplication
  const realCase = CASE_FILE ? (JSON.parse(readFileSync(CASE_FILE, 'utf8')) as RealCase) : (null as unknown as RealCase)
  const log: string[] = []

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = KEY
    process.env.AI_ADVISOR_PROVIDER = 'google-genai'
    if (process.env.AI_EVAL_GEMINI_MODEL) process.env.AI_ADVISOR_MODEL = process.env.AI_EVAL_GEMINI_MODEL
    delete process.env.AI_FAKE_KI
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    mkdirSync(OUT, { recursive: true })
  })

  afterAll(async () => {
    writeFileSync(join(OUT, RESUME ? 'resume.md' : 'conversation.md'), log.join('\n'))
    await app?.close()
  })

  it('from the documents to the printed forms', { timeout: 90 * 60 * 1000 }, async () => {
    const { year, userId } = realCase
    const prisma = app.get(PrismaService)
    const advisor = app.get(AdvisorService)

    const link = app.get(LinkService)
    const childIds: string[] = []
    const applyDrafts = async (drafts: readonly AdvisorActionProposal[]) => {
      const pending = drafts.filter((d) => d.status === 'pending')
      if (pending.length > 0) await advisor.applyBatch(userId, year, { drafts: pending.map((d) => ({ actionId: d.actionId })) })
    }

    if (!RESUME) {
    // ── What the user enters herself ───────────────────────────────────────────────────
    await prisma.user.create({ data: { id: userId, name: 'Echtfall', email: `${userId}@real-case.invalid` } })
    await app.get(ProfileService).saveProfile(userId, realCase.personA.profile as never)
    await app.get(MasterDataService).save(userId, realCase.personA.masterData as never)
    if (realCase.personB) {
      await link.set(userId, year, { filingType: 'zusammen' } as never)
      await link.updatePersonB(userId, year, realCase.personB as never)
    }
    for (const child of realCase.children ?? []) {
      const list = (await app.get(ChildrenService).create(userId, year, child.create as never)).kinder
      childIds.push(list.at(-1)!.id)
    }

    // ── The chat ──────────────────────────────────────────────────────────────────────
    for (const message of realCase.chat) {
      const response = await advisor.sendMessage(userId, year, { message })
      const meta = (response.assistantMessage.meta ?? {}) as AdvisorMessageMeta
      const drafts = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
      log.push(`## Kunde\n${message}\n`, `## Eule (${response.mode})\n${response.assistantMessage.content}\n`, `Entwürfe: ${drafts.map((d) => `${d.screen}${d.instance ? `:${d.instance}` : ''}.${d.field}=${d.newValue}`).join(', ') || '—'}`, (meta.notStaged ?? []).length > 0 ? `Nicht vorbereitet: ${(meta.notStaged ?? []).map((n) => `${n.label} (${n.reason})`).join('; ')}\n` : '')
      await applyDrafts(drafts)
    }

    // ── Receipts, as the upload sends them ──────────────────────────────────────────────
    for (const receipt of realCase.receipts ?? []) {
      const rawText = readFileSync(receipt.textFile, 'utf8').slice(0, 32_000)
      try {
        const parsed = await app.get(ReceiptParseService).parseReceipt(userId, { taxYear: year, fileName: receipt.fileName, rawText, textSource: 'pdf_text', stageDraft: true } as never)
        const staged = parsed.stagedAction
        log.push(`## Beleg ${receipt.fileName} (${parsed.mode})\nErkannt: ${JSON.stringify(parsed.parsed)}\nEntwurf: ${staged ? `${staged.screen}.${staged.field}=${staged.newValue}` : '—'}\n`)
        if (staged) await applyDrafts([staged as never])
      } catch (error) {
        log.push(`## Beleg ${receipt.fileName}: Fehler ${error instanceof Error ? error.message : String(error)}\n`)
      }
    }
    } else {
      for (const child of await prisma.child.findMany({ where: { userId, taxYear: year }, orderBy: { createdAt: 'asc' } })) childIds.push(child.id)
    }

    // ── Follow-up messages, also on resume ──────────────────────────────────────────────
    for (const message of RESUME ? (realCase.followUp ?? []) : []) {
      const response = await advisor.sendMessage(userId, year, { message })
      const meta = (response.assistantMessage.meta ?? {}) as AdvisorMessageMeta
      const drafts = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
      log.push(`## Kunde\n${message}\n`, `## Eule (${response.mode})\n${response.assistantMessage.content}\n`, `Entwürfe: ${drafts.map((d) => `${d.screen}.${d.field}=${d.newValue}`).join(', ') || '—'}\n`)
      await applyDrafts(drafts)
    }

    // ── What the user enters by hand afterwards ──────────────────────────────────────────
    const ch = app.get(ChSalaryCertificateService)
    for (const [person, entries] of Object.entries(realCase.byHand ?? {}) as [('A' | 'B'), ByHand][]) {
      const who = person === 'A' ? userId : await link.dataUser(userId, year, 'B')
      for (const [questionId, answer] of entries.interview ?? []) {
        try {
          await app.get(InterviewService).postAnswer(who, year, { questionId, value: answer } as never)
        } catch (error) {
          log.push(`Interview ${questionId}=${answer} (Person ${person}) abgelehnt: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      for (const [field, value] of Object.entries(entries.chFields ?? {})) await ch.setField(who, year, field as never, { kind: 'erfasst', value } as never)
      if (entries.chProvision) await ch.setProvision(who, year, entries.chProvision as never)
      if (entries.chNGre) await ch.setNGre(who, year, entries.chNGre as never)
      if (entries.chExchangeRate) await ch.setExchangeRate(who, year, entries.chExchangeRate as never)
      if (entries.commute) await app.get(CommuteService).save(who, year, entries.commute as never)
      log.push(`## Von Hand (Person ${person})\n${JSON.stringify(entries)}\n`)
    }
    for (const [i, child] of (realCase.children ?? []).entries()) {
      if (child.userFields) await app.get(ChildrenService).update(userId, year, childIds[i]!, child.userFields as never)
    }

    // ── Results ──────────────────────────────────────────────────────────────────────
    const confirmation = app.get(ConfirmationService)
    const stored: Record<string, string | null> = {}
    for (const row of await prisma.marking.findMany({ where: { userId, taxYear: year } })) {
      stored[row.itemKey] = await confirmation.readRawValue(userId, year, row.itemKey)
    }
    const printout = app.get(PrintoutService)
    const { missing } = await printout.check(userId, year)
    const estimate = await app.get(TaxEstimateService).getState(userId, year)
    let fields: Record<string, string> = {}
    if (missing.length === 0) {
      await prisma.unlock.deleteMany({ where: { userId, taxYear: year } })
      await prisma.unlock.create({ data: { userId, taxYear: year, stripeCheckoutSessionId: `cs_${userId}`, status: 'bezahlt', paidAt: new Date() } })
      const pdf = await printout.create(userId, year, { editable: true })
      writeFileSync(join(OUT, 'ausdruck.pdf'), pdf)
      const form = (await PDFDocument.load(pdf)).getForm()
      fields = Object.fromEntries(
        form
          .getFields()
          .map((f) => [f.getName(), f instanceof PDFTextField ? (f.getText() ?? '') : f instanceof PDFCheckBox ? (f.isChecked() ? 'X' : '') : ''] as const)
          .filter(([, value]) => value !== ''),
      )
    }
    writeFileSync(join(OUT, 'result.json'), JSON.stringify({ missing, estimate, stored, printedFields: fields }, null, 2))
  })
})
