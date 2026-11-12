// ADR-0066 — "the owl can fill the return through the chat", against the REAL model and a real
// Postgres. Each scenario is one customer sentence: the model has to pick the right field, the
// server checks the value, the draft is applied and the stored value is read back. One scenario
// per area of the return, plus the things the owl must not do.
//
// Not a gate: the model is not deterministic. Runs nightly and writes a report; see
// vitest.live.config.ts for how to run it by hand.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { AdvisorActionProposal, AdvisorMessageMeta } from '@steuereule/core'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdvisorService } from '../../src/advisor/advisor.service.js'
import { AppModule } from '../../src/app.module.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../../src/children/child.repository.js'
import { ConfirmationService } from '../../src/confirmation/confirmation.service.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../../src/rental/rental.repository.js'

const KEY = process.env.AI_EVAL_GEMINI_API_KEY?.trim()
const YEAR = 2025

interface Outcome {
  readonly area: string
  readonly scenario: string
  passed: boolean
  attempts: number
  detail: string
}

interface Turn {
  readonly reply: string
  readonly drafts: readonly AdvisorActionProposal[]
  readonly meta: AdvisorMessageMeta
}

describe.skipIf(!KEY)('the owl fills the return through the chat (live model)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let advisor: AdvisorService
  let confirmation: ConfirmationService
  let children: ChildRepository
  let rentals: RentalRepository
  const users: string[] = []
  const outcomes = new Map<string, Outcome>()
  /** Notices of the answer check during the scenario that is running. */
  let noticed: string[] = []

  beforeAll(async () => {
    // The app reads the provider from the environment; the nightly key has its own name so that
    // it can never be picked up by a normal run.
    process.env.GEMINI_API_KEY = KEY
    process.env.AI_ADVISOR_PROVIDER = 'google-genai'
    if (process.env.AI_EVAL_GEMINI_MODEL) process.env.AI_ADVISOR_MODEL = process.env.AI_EVAL_GEMINI_MODEL
    delete process.env.AI_FAKE_KI

    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    advisor = app.get(AdvisorService)
    confirmation = app.get(ConfirmationService)
    children = app.get<ChildRepository>(CHILD_REPOSITORY)
    rentals = app.get<RentalRepository>(RENTAL_REPOSITORY)
  })

  afterAll(async () => {
    const tables = prisma as unknown as Record<string, { deleteMany(args: unknown): Promise<unknown> } | undefined>
    for (const userId of users) {
      for (const table of ['advisorChatMessage', 'advisorConversation', 'advisorNote', 'marking', 'interviewAnswer', 'taxDataAccessLog', 'commute', 'lstb', 'pension', 'capital', 'child', 'rentalProperty', 'taxYear']) {
        await tables[table]?.deleteMany({ where: { userId } }).catch(() => {})
      }
    }
    await app.close()
    writeReport([...outcomes.values()])
  })

  /** A fresh customer. `employee` gives them a return the estimate can already compute. */
  async function customer(options: { employee?: boolean } = {}): Promise<string> {
    const userId = `live-${randomUUID()}`
    users.push(userId)
    if (options.employee) {
      for (const [key, value] of [
        ['interview.job', 'Angestellt'],
        ['interview.familienstand', 'Ledig'],
        ['lstb.bruttoarbeitslohn', '62000'],
        ['lstb.lohnsteuer', '11800'],
        ['lstb.sozialversicherung', '11400'],
      ] as const) {
        await confirmation.writeConfirmedByAdvisor(userId, YEAR, key, value)
      }
    }
    return userId
  }

  async function say(userId: string, message: string): Promise<Turn> {
    const response = await advisor.sendMessage(userId, YEAR, { message })
    // A silent fall back to the built-in rules would make every scenario meaningless.
    expect(response.mode, 'the turn must be answered by the model').toBe('langgraph')
    const meta = (response.assistantMessage.meta ?? {}) as AdvisorMessageMeta
    const drafts = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
    // What the answer check found goes into the report: a notice on an ordinary answer is either
    // the model misbehaving or the check being too eager, and both are worth seeing.
    for (const notice of meta.notices ?? []) noticed.push(`${notice.kind}: „${response.assistantMessage.content.replace(/\s+/g, ' ').slice(0, 140)}“`)
    return { reply: response.assistantMessage.content, drafts, meta }
  }

  /** Applies every draft of a turn the way „Alle übernehmen“ does. */
  async function applyAll(userId: string, turn: Turn): Promise<void> {
    const pending = turn.drafts.filter((draft) => draft.status === 'pending')
    if (pending.length === 0) return
    await advisor.applyBatch(userId, YEAR, { drafts: pending.map((draft) => ({ actionId: draft.actionId })) })
  }

  const stored = (userId: string, key: string) => confirmation.readRawValue(userId, YEAR, key)
  const euros = (value: string | null): number | null => (value === null ? null : Number(value))

  /** Registers the scenario for the report; the last attempt decides. */
  function scenario(area: string, name: string, run: () => Promise<string | void>): void {
    it(`${area}: ${name}`, async () => {
      const outcome = outcomes.get(name) ?? { area, scenario: name, passed: false, attempts: 0, detail: '' }
      outcomes.set(name, outcome)
      outcome.attempts += 1
      noticed = []
      try {
        const detail = (await run()) ?? ''
        outcome.detail = [detail, ...noticed].filter((part) => part !== '').join(' · ')
        outcome.passed = true
      } catch (error) {
        outcome.passed = false
        outcome.detail = error instanceof Error ? error.message.split('\n')[0]!.slice(0, 300) : String(error)
        throw error
      }
    })
  }

  // ── Areas of the return ──────────────────────────────────────────────────────────────────

  scenario('Lohnsteuerbescheinigung', 'three amounts in one sentence', async () => {
    const user = await customer()
    const turn = await say(user, 'Trag bitte meine Lohnsteuerbescheinigung ein: Bruttolohn 58.000 €, Lohnsteuer 10.400 €, Sozialversicherung 11.600 €.')
    await applyAll(user, turn)
    expect(euros(await stored(user, 'lstb.bruttoarbeitslohn'))).toBe(58000)
    expect(euros(await stored(user, 'lstb.lohnsteuer'))).toBe(10400)
    expect(euros(await stored(user, 'lstb.sozialversicherung'))).toBe(11600)
  })

  scenario('Arbeitsweg', 'distance, transport and home office days', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Mein Arbeitsweg: 38 km einfache Strecke mit dem Auto, dazu 60 Tage Homeoffice, 30 Urlaubstage und 5 Krankheitstage. Trag das bitte ein.')
    await applyAll(user, turn)
    expect(euros(await stored(user, 'commute.oneWayKm'))).toBe(38)
    expect(await stored(user, 'commute.transport')).toBe('pkw')
    expect(euros(await stored(user, 'commute.homeOfficeDays'))).toBe(60)
  })

  scenario('Mehrere Angaben', 'three unrelated things in one message become three stored values', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Trag bitte ein: 30 Tage Homeoffice, 5.000 € Handwerkerkosten und 200 € Spenden.')
    await applyAll(user, turn)
    expect(euros(await stored(user, 'commute.homeOfficeDays'))).toBe(30)
    expect(euros(await stored(user, 'interview.haushalt-handwerker-betrag'))).toBe(5000)
    expect(euros(await stored(user, 'interview.spenden-betrag'))).toBe(200)
    return `${turn.drafts.length} drafts`
  })

  scenario('Sonderausgaben', 'a donation, with its effect from the estimate', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Ich habe 1.000 € an eine gemeinnützige Organisation gespendet. Trag das bitte ein.')
    const draft = turn.drafts.find((d) => d.field === 'spenden-betrag')
    expect(draft, 'a draft for the donation').toBeDefined()
    expect(draft!.effect).toBe('computed')
    expect(draft!.deltaEur).toBeGreaterThan(0)
    await applyAll(user, turn)
    expect(euros(await stored(user, 'interview.spenden-betrag'))).toBe(1000)
    return `effect ${draft!.deltaEur} €`
  })

  scenario('Vermietung', 'one object needs no name', async () => {
    const user = await customer({ employee: true })
    const rental = await rentals.create(user, YEAR)
    const turn = await say(user, 'Meine vermietete Wohnung hat 9.600 € Miete im Jahr eingebracht, die Werbungskosten lagen bei 2.400 €. Trag das bitte ein.')
    await applyAll(user, turn)
    expect(euros(await stored(user, `vermietung:${rental.id}.mieteinnahmen`))).toBe(9600)
    expect(euros(await stored(user, `vermietung:${rental.id}.werbungskosten`))).toBe(2400)
  })

  scenario('Vermietung', 'the second of two objects, by its name', async () => {
    const user = await customer({ employee: true })
    const first = await rentals.create(user, YEAR)
    const second = await rentals.create(user, YEAR)
    const turn = await say(user, 'Bei Objekt 2 hatte ich 7.200 € Mieteinnahmen. Trag das bitte ein.')
    await applyAll(user, turn)
    expect(euros(await stored(user, `vermietung:${second.id}.mieteinnahmen`))).toBe(7200)
    expect(await stored(user, `vermietung:${first.id}.mieteinnahmen`)).toBeNull()
  })

  scenario('Vermietung', 'no object yet: nothing is prepared, and the owl does not pretend', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Ich vermiete eine Wohnung und habe 9.600 € Miete eingenommen. Trag das bitte ein.')
    expect(turn.drafts.filter((d) => d.screen === 'vermietung')).toEqual([])
    expect(await rentals.listForUserAndYear(user, YEAR)).toHaveLength(0)
    // Either the app says it under the answer, or the model did not even try and says it itself.
    const admitted = (turn.meta.notStaged?.length ?? 0) > 0 || /anleg|Maske|noch kein/i.test(turn.reply)
    expect(admitted, `the answer must not claim a draft: „${turn.reply.slice(0, 160)}“`).toBe(true)
  })

  scenario('Kinder', 'a yes/no fact about a child, stored in its proper form', async () => {
    const user = await customer({ employee: true })
    const child = await children.create(user, YEAR, { firstName: 'Mila', lastName: 'Muster', geburtsdatum: '2019-05-12' })
    const turn = await say(user, 'Das Kindergeld für mein Kind habe ich das ganze Jahr selbst bekommen, und es war das ganze Jahr bei mir gemeldet. Trag das bitte ein.')
    await applyAll(user, turn)
    expect(await stored(user, `kind:${child.id}.childBenefitToMeAllYear`)).toBe('true')
  })

  scenario('Rente', 'the kind of pension in the form the field knows', async () => {
    const user = await customer()
    const turn = await say(user, 'Ich beziehe eine gesetzliche Altersrente, 14.400 € im Jahr, Rentenbeginn war 2021. Trag das bitte ein.')
    await applyAll(user, turn)
    expect(await stored(user, 'rente.rentenart')).toBe('GesetzlicheRente')
    expect(euros(await stored(user, 'rente.jahresbetrag'))).toBe(14400)
  })

  scenario('Kapitalerträge', 'income and the tax already withheld', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Ich hatte 2.400 € Kapitalerträge, die Bank hat 350 € Kapitalertragsteuer einbehalten. Trag das bitte ein.')
    await applyAll(user, turn)
    expect(euros(await stored(user, 'kapital.kapitalertraege'))).toBe(2400)
    expect(euros(await stored(user, 'kapital.kapitalertragsteuer'))).toBe(350)
  })

  // ── The project of a tax year (#481) ─────────────────────────────────────────────────────

  scenario('Projekt', 'something settled in one conversation is known in the next', async () => {
    const user = await customer({ employee: true })
    await say(user, 'Zur Info: Ein Arbeitszimmer habe ich nicht, ich arbeite zu Hause am Küchentisch. Bitte merk dir das für dieses Jahr.')
    const notes = await advisor.listNotes(user, YEAR)
    expect(notes.length, 'the owl should have kept a note').toBeGreaterThan(0)
    expect(notes.map((n) => n.text).join(' ')).toMatch(/Arbeitszimmer|Küchentisch/i)

    const second = await advisor.createConversation(user, YEAR)
    const response = await advisor.sendMessage(user, YEAR, { message: 'Kann ich ein häusliches Arbeitszimmer absetzen?', conversationId: second.id })
    expect(response.mode).toBe('langgraph')
    expect(response.assistantMessage.content, 'the second conversation should know what the first settled').toMatch(/Küchentisch|kein(?:en)? (?:eigene[ns] |separate[ns] )?(?:Raum|Arbeitszimmer)|Tagespauschale|Homeoffice-Pauschale/i)
    return `${notes.length} note(s): „${notes[0]!.text.slice(0, 80)}“`
  })

  scenario('Projekt', 'a long conversation is summarised and goes on', async () => {
    const user = await customer({ employee: true })
    const filler = 'Hier noch ein paar Einzelheiten dazu, damit das Gespräch länger wird. '.repeat(60)
    for (let i = 1; i <= 6; i += 1) await say(user, `Frage ${i}: Was muss ich bei Werbungskosten beachten? ${filler}`)
    const session = await advisor.getSession(user, YEAR)
    expect(session.context.summary, 'the older part should be summarised by now').toBeTruthy()
    expect(session.context.level).not.toBe('full')
    expect(session.messages.length).toBe(12)
    return `summary of ${session.context.summary!.length} characters, context at ${session.context.percent} %`
  })

  // ── What the owl must not do ─────────────────────────────────────────────────────────────

  scenario('Grenzen', 'a value that cannot be right is not stored', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Trag bei den Homeoffice-Tagen bitte „ziemlich viele“ ein.')
    await applyAll(user, turn)
    const value = await stored(user, 'commute.homeOfficeDays')
    expect(value === null || /^\d+$/.test(value), `stored „${value}“`).toBe(true)
    expect(turn.drafts.every((d) => /^\d+$/.test(d.newValue) || d.field !== 'homeOfficeDays')).toBe(true)
  })

  scenario('Grenzen', 'master data stays with the user', async () => {
    const user = await customer({ employee: true })
    const turn = await say(user, 'Trag bitte meine neue Adresse in die Stammdaten ein: Musterweg 5 in 79098 Freiburg.')
    expect(turn.drafts.filter((d) => d.screen === 'stammdaten' || d.screen === 'profil')).toEqual([])
  })
})

function writeReport(outcomes: readonly Outcome[]): void {
  if (outcomes.length === 0) return
  const lines = [
    '## Eule füllt die Erklärung über den Chat (echtes Modell)',
    '',
    `${outcomes.filter((o) => o.passed).length} von ${outcomes.length} Szenarien grün`,
    '',
    '| Bereich | Szenario | Ergebnis | Versuche | Hinweis |',
    '| --- | --- | --- | --- | --- |',
    ...outcomes.map((o) => `| ${o.area} | ${o.scenario} | ${o.passed ? 'grün' : 'ROT'} | ${o.attempts} | ${o.detail.replace(/\|/g, '/')} |`),
    '',
  ]
  const text = lines.join('\n')
  console.log(`\n${text}`)
  const dir = process.env.AI_EVAL_REPORT_DIR
  if (dir) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'owl-fills-the-return.md'), text)
    writeFileSync(join(dir, 'owl-fills-the-return.json'), JSON.stringify(outcomes, null, 2))
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
}
