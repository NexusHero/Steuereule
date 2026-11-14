// The whole return through the chat, against the REAL model and a real Postgres. The acceptance
// scenarios of the e2e suite (e2e/fixtures/scenarios-2025.fixture.mjs, e2e/scenarios/05) and one
// more are told to the owl twice: piece by piece, one message per area, and as one batch prompt.
// Every draft is taken over as "Alle übernehmen" does. Then every field of every mask is read back
// against the scenario, the estimate has to compute, the printout pre-check has to be empty, and
// named values have to be in the printed forms.
//
// What the user enters herself (name, tax ID, address, IBAN, the names of children, the address of
// a flat) is set up first: the owl may never write it. A report goes to
// AI_EVAL_REPORT_DIR/full-return.md. By hand, like the other live scenarios (vitest.live.config.ts).
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { AdvisorActionProposal, AdvisorMessageMeta } from '@steuereule/core'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdvisorService } from '../../src/advisor/advisor.service.js'
import { AppModule } from '../../src/app.module.js'
import { ChildrenService } from '../../src/children/children.service.js'
import { ConfirmationService } from '../../src/confirmation/confirmation.service.js'
import { MasterDataService } from '../../src/master-data/master-data.service.js'
import { PrintoutService } from '../../src/printout/printout.service.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'
import { ProfileService } from '../../src/profile/profile.service.js'
import { RentalService } from '../../src/rental/rental.service.js'
import { TaxEstimateService } from '../../src/tax-estimate/tax-estimate.service.js'

const KEY = process.env.AI_EVAL_GEMINI_API_KEY?.trim()
const REPORT_DIR = process.env.AI_EVAL_REPORT_DIR ?? '/tmp/ai-eval'
const YEAR = 2025
const MODES = ['schrittweise', 'batch'] as const
type Mode = (typeof MODES)[number]

interface Setup {
  readonly profile: { readonly firstName: string; readonly lastName: string; readonly steuerId: string; readonly steuernummer?: string }
  readonly masterData: Record<string, unknown>
  readonly children?: readonly { readonly firstName: string; readonly lastName: string; readonly geburtsdatum: string; readonly taxId?: string }[]
  readonly rentals?: readonly { readonly strasse: string; readonly hausnummer: string; readonly plz: string; readonly city: string }[]
}

interface Scenario {
  readonly name: string
  readonly setup: Setup
  /** One message per area, in the customer's words. */
  readonly pieces: readonly string[]
  /** Field key → value; `{child1}`, `{rental2}` stand for the ids of the entries set up. */
  readonly fields: Readonly<Record<string, string>>
  /** Printed form field → value, as the e2e fixture names them. */
  readonly pdf?: Readonly<Record<string, string>>
  /** Whether the printout is expected to be possible (a couple needs Person B, which the chat cannot add). */
  readonly printable: boolean
}

const MASTER = (overrides: Record<string, unknown>) => ({ religion: 'VD', religionConsent: true, iban: 'DE89370400440532013000', ...overrides })

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'Lena Hoffmann, angestellt, pendelt 70 km (Szenario 1)',
    setup: {
      profile: { firstName: 'Lena', lastName: 'Hoffmann', steuerId: '31234567890', steuernummer: '0612345678' },
      masterData: MASTER({ geburtsdatum: '1991-05-14', strasse: 'Kartäuserstraße', hausnummer: '12', plz: '79102', wohnort: 'Freiburg', familienstand: 'ledig', finanzamt: 'Freiburg-Stadt' }),
    },
    pieces: [
      'Ich bin angestellt, ledig, habe keine Kinder und keinen Bezug zum Ausland.',
      'Meine Lohnsteuerbescheinigung 2025: Bruttoarbeitslohn 94.999 €, Lohnsteuer 21.797 €, Sozialversicherung 17.314 €.',
      'Mein Arbeitsweg: 70 km einfache Strecke mit dem Auto, Montag bis Freitag, 30 Urlaubstage, 4 Krankheitstage, kein Homeoffice. Ich wohne in Baden-Württemberg.',
      'Ich habe 300 € gespendet.',
    ],
    fields: {
      'interview.job': 'Angestellt',
      'interview.familienstand': 'Ledig',
      'interview.kinder': 'Nein',
      'interview.ausland': 'Nein',
      'lstb.bruttoarbeitslohn': '94999',
      'lstb.lohnsteuer': '21797',
      'lstb.sozialversicherung': '17314',
      'commute.oneWayKm': '70',
      'commute.transport': 'pkw',
      'commute.workdays': '1,2,3,4,5',
      'commute.vacationDays': '30',
      'commute.sickDays': '4',
      'commute.homeOfficeDays': '0',
      'commute.publicHolidayRegion': 'BW',
      'interview.spenden-betrag': '300',
    },
    pdf: { 'anlN.kz110': '94999', 'anlN.kz110Tage': '216', 'anlN.kz111': '70', 'anlSo.spenden': '300' },
    printable: true,
  },
  {
    name: 'Hans Meyer, Rentner mit Kapitalerträgen (Szenario 5)',
    setup: {
      profile: { firstName: 'Hans', lastName: 'Meyer', steuerId: '61234567890' },
      masterData: MASTER({ geburtsdatum: '1956-03-14', strasse: 'Goethestraße', hausnummer: '10', plz: '70174', wohnort: 'Stuttgart', familienstand: 'ledig', finanzamt: 'Stuttgart I' }),
    },
    pieces: [
      'Ich bin Rentner, ledig, keine Kinder, kein Ausland.',
      'Ich bekomme eine gesetzliche Rente von 24.000 € im Jahr, Rentenbeginn war 2021.',
      'Kapitalerträge über einen deutschen Broker: 8.000 €, Sparer-Pauschbetrag 1.000 € genutzt, 1.750 € Kapitalertragsteuer, 96 € Solidaritätszuschlag, keine Kirchensteuer.',
    ],
    fields: {
      'interview.job': 'Rente',
      'interview.familienstand': 'Ledig',
      'interview.kinder': 'Nein',
      'interview.ausland': 'Nein',
      'rente.rentenart': 'GesetzlicheRente',
      'rente.jahresbetrag': '24000',
      'rente.rentenbeginnJahr': '2021',
      'interview.kap-depot': 'Deutscher Broker',
      'kapital.kapitalertraege': '8000',
      'kapital.sparerPauschbetrag': '1000',
      'kapital.kapitalertragsteuer': '1750',
      'kapital.solidaritaetszuschlag': '96',
    },
    printable: true,
  },
  {
    name: 'Thomas Weber, Kapital und drei vermietete Objekte (Szenario 4, Person A)',
    setup: {
      profile: { firstName: 'Thomas', lastName: 'Weber', steuerId: '51234567890', steuernummer: '9312345678' },
      masterData: MASTER({ geburtsdatum: '1972-11-09', strasse: 'Gänsheidestraße', hausnummer: '8', plz: '70184', wohnort: 'Stuttgart', familienstand: 'verheiratet', finanzamt: 'Stuttgart II' }),
      rentals: [
        { strasse: 'Hölderlinstraße', hausnummer: '3', plz: '70174', city: 'Stuttgart' },
        { strasse: 'Mühlstraße', hausnummer: '21', plz: '73728', city: 'Esslingen' },
        { strasse: 'Schorndorfer Straße', hausnummer: '55', plz: '71638', city: 'Ludwigsburg' },
      ],
    },
    pieces: [
      'Ich bin angestellt, verheiratet, keine Kinder, kein Ausland. Lohnsteuerbescheinigung: Bruttoarbeitslohn 82.000 €, Lohnsteuer 9.890 €, Sozialversicherung 15.473 €.',
      'Arbeitsweg 15 km mit dem Auto, Montag bis Freitag, 30 Urlaubstage, 5 Krankheitstage.',
      'Kapitalerträge über einen deutschen Broker: 50.000 €, Sparer-Pauschbetrag 2.000 €, Kapitalertragsteuer 12.000 €, Soli 660 €, keine Kirchensteuer.',
      'Objekt 1 (Hölderlinstraße): 14.400 € Miete, 3.200 € Werbungskosten, Anschaffungskosten Gebäude 280.000 €, Baujahr 1995.',
      'Objekt 2 (Mühlstraße): 38.400 € Miete, 9.800 € Werbungskosten, Anschaffungskosten Gebäude 620.000 €, Baujahr 1978.',
      'Objekt 3 (Schorndorfer Straße): 10.200 € Miete, 2.600 € Werbungskosten, Anschaffungskosten Gebäude 240.000 €, Baujahr 2018.',
    ],
    fields: {
      'interview.job': 'Angestellt',
      'interview.familienstand': 'Verheiratet',
      'lstb.bruttoarbeitslohn': '82000',
      'lstb.lohnsteuer': '9890',
      'lstb.sozialversicherung': '15473',
      'commute.oneWayKm': '15',
      'commute.vacationDays': '30',
      'commute.sickDays': '5',
      'kapital.kapitalertraege': '50000',
      'kapital.sparerPauschbetrag': '2000',
      'kapital.kapitalertragsteuer': '12000',
      'kapital.solidaritaetszuschlag': '660',
      'vermietung:{rental1}.mieteinnahmen': '14400',
      'vermietung:{rental1}.werbungskosten': '3200',
      'vermietung:{rental1}.anschaffungskosten': '280000',
      'vermietung:{rental1}.baujahr': '1995',
      'vermietung:{rental2}.mieteinnahmen': '38400',
      'vermietung:{rental2}.werbungskosten': '9800',
      'vermietung:{rental2}.anschaffungskosten': '620000',
      'vermietung:{rental2}.baujahr': '1978',
      'vermietung:{rental3}.mieteinnahmen': '10200',
      'vermietung:{rental3}.werbungskosten': '2600',
      'vermietung:{rental3}.anschaffungskosten': '240000',
      'vermietung:{rental3}.baujahr': '2018',
    },
    printable: false,
  },
  {
    name: 'Marie Neumann, alleinerziehend, Fortbildung, Haushalt, Kapital, Wohnung',
    setup: {
      profile: { firstName: 'Marie', lastName: 'Neumann', steuerId: '02476291358' },
      masterData: MASTER({ geburtsdatum: '1988-06-03', strasse: 'Lindenweg', hausnummer: '7', plz: '01067', wohnort: 'Dresden', familienstand: 'ledig', finanzamt: 'Dresden-Nord' }),
      children: [{ firstName: 'Lina', lastName: 'Neumann', geburtsdatum: '2016-09-14' }],
      rentals: [{ strasse: 'Hauptstraße', hausnummer: '3', plz: '01067', city: 'Dresden' }],
    },
    pieces: [
      'Ich bin angestellt als Pflegekraft, ledig, habe ein Kind und keinen Bezug zum Ausland. Lohnsteuerbescheinigung: Bruttoarbeitslohn 46.800 €, Lohnsteuer 6.900 €, Sozialversicherung 9.600 €.',
      'Arbeitsweg: 19 km mit dem Auto, Montag bis Freitag, 30 Urlaubstage, 6 Krankheitstage, 25 Tage Homeoffice.',
      'Ich hatte eine Fortbildung für 640 €, habe 250 € gespendet und hatte Handwerkerkosten von 900 € (nur Arbeitslohn).',
      'Kapitalerträge bei einem deutschen Broker: 1.350 €, 87 € Kapitalertragsteuer, Sparer-Pauschbetrag 1.000 € genutzt.',
      'Meine vermietete Wohnung (Objekt 1): 8.400 € Miete, 2.100 € Werbungskosten, Anschaffungskosten 180.000 €, Baujahr 1998.',
      'Mein Kind (Kind 1) ist mein leibliches Kind, hat das ganze Jahr bei mir in Deutschland gewohnt und war bei mir gemeldet, ich habe das ganze Jahr Kindergeld bekommen, der andere Elternteil lebt im Inland.',
    ],
    fields: {
      'interview.job': 'Angestellt',
      'interview.beruf': 'Pflege & Gesundheit',
      'interview.familienstand': 'Ledig',
      'interview.kinder': '1 Kind',
      'lstb.bruttoarbeitslohn': '46800',
      'lstb.lohnsteuer': '6900',
      'lstb.sozialversicherung': '9600',
      'commute.oneWayKm': '19',
      'commute.vacationDays': '30',
      'commute.sickDays': '6',
      'commute.homeOfficeDays': '25',
      'interview.fortbildung-kosten': '640',
      'interview.spenden-betrag': '250',
      'interview.haushalt-handwerker-betrag': '900',
      'kapital.kapitalertraege': '1350',
      'kapital.kapitalertragsteuer': '87',
      'kapital.sparerPauschbetrag': '1000',
      'vermietung:{rental1}.mieteinnahmen': '8400',
      'vermietung:{rental1}.werbungskosten': '2100',
      'vermietung:{rental1}.anschaffungskosten': '180000',
      'vermietung:{rental1}.baujahr': '1998',
      'kind:{child1}.kinship': '1',
      'kind:{child1}.domesticResidenceAllYear': 'true',
      'kind:{child1}.registeredWithMeAllYear': 'true',
      'kind:{child1}.childBenefitToMeAllYear': 'true',
      'kind:{child1}.otherParent': 'Inland',
    },
    pdf: { 'anlN.kz110': '46800', 'anlSo.spenden': '250', 'anlV.kz01': '8400' },
    printable: true,
  },
]

interface Row {
  scenario: string
  mode: Mode
  key: string
  expected: string
  stored: string | null
}

describe.skipIf(!KEY)('the owl builds whole returns through the chat (live model)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  const users: string[] = []
  const rows: Row[] = []
  const summaries: string[] = []
  const conversations: string[] = []

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = KEY
    process.env.AI_ADVISOR_PROVIDER = 'google-genai'
    if (process.env.AI_EVAL_GEMINI_MODEL) process.env.AI_ADVISOR_MODEL = process.env.AI_EVAL_GEMINI_MODEL
    delete process.env.AI_FAKE_KI
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
  })

  afterAll(async () => {
    const tables = prisma as unknown as Record<string, { deleteMany(args: unknown): Promise<unknown> } | undefined>
    for (const userId of users) {
      for (const table of ['advisorChatMessage', 'advisorConversation', 'advisorNote', 'advisorInterview', 'marking', 'interviewAnswer', 'taxDataAccessLog', 'commute', 'lstb', 'pension', 'capital', 'child', 'rentalProperty', 'unlock', 'masterData', 'profile', 'taxYear']) {
        await tables[table]?.deleteMany({ where: { userId } }).catch(() => {})
      }
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {})
    }
    await app.close()
    mkdirSync(REPORT_DIR, { recursive: true })
    const table = (scenario: string, mode: Mode) =>
      rows
        .filter((r) => r.scenario === scenario && r.mode === mode)
        .map((r) => `| ${r.key.replace(/:[0-9a-f-]{36}/, '')} | ${r.expected} | ${r.stored ?? '—'} | ${r.stored === r.expected ? '✅' : '❌'} |`)
    writeFileSync(
      join(REPORT_DIR, 'full-return.md'),
      [
        '# Ganze Erklärungen über den Chat',
        '',
        ...summaries,
        '',
        ...SCENARIOS.flatMap((s) => MODES.flatMap((mode) => [`## ${s.name} · ${mode}`, '', '| Feld | Soll | Gespeichert | |', '| :--- | :--- | :--- | :---: |', ...table(s.name, mode), ''])),
        '## Gespräche',
        ...conversations,
      ].join('\n'),
    )
  })

  async function setUp(userId: string, setup: Setup): Promise<Record<string, string>> {
    // A real account: the unlock of the printout belongs to a user row.
    await prisma.user.create({ data: { id: userId, name: `${setup.profile.firstName} ${setup.profile.lastName}`, email: `${userId}@live.invalid` } })
    await app.get(ProfileService).saveProfile(userId, setup.profile as never)
    await app.get(MasterDataService).save(userId, setup.masterData as never)
    const ids: Record<string, string> = {}
    let children: { id: string }[] = []
    for (const child of setup.children ?? []) children = (await app.get(ChildrenService).create(userId, YEAR, child as never)).kinder
    children.forEach((child, i) => (ids[`child${i + 1}`] = child.id))
    const rentals = app.get(RentalService)
    for (const [i, address] of (setup.rentals ?? []).entries()) {
      const created = (await rentals.createProperty(userId, YEAR)) as unknown as { properties: { id: string }[] }
      const id = created.properties.at(-1)!.id
      ids[`rental${i + 1}`] = id
      await rentals.setAddress(userId, YEAR, id, address as never)
    }
    return ids
  }

  for (const scenario of SCENARIOS) {
    for (const mode of MODES) {
      it(`${scenario.name} · ${mode}`, { timeout: 30 * 60 * 1000 }, async () => {
        const userId = `live-full-${randomUUID()}`
        users.push(userId)
        const ids = await setUp(userId, scenario.setup)
        const advisor = app.get(AdvisorService)
        const messages =
          mode === 'schrittweise'
            ? [...scenario.pieces.map((piece) => `${piece} Bitte eintragen.`), 'Fehlt jetzt noch etwas für meine Erklärung 2025?']
            : [`Hier sind alle meine Angaben für 2025 auf einmal, trag bitte alles ein:\n${scenario.pieces.join('\n')}`, 'Fehlt jetzt noch etwas für meine Erklärung 2025?']
        const log: string[] = [`### ${scenario.name} · ${mode}`]
        let notByModel = 0
        let drafted = 0
        for (const message of messages) {
          const response = await advisor.sendMessage(userId, YEAR, { message })
          if (response.mode !== 'langgraph') notByModel += 1
          const meta = (response.assistantMessage.meta ?? {}) as AdvisorMessageMeta
          const drafts: AdvisorActionProposal[] = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
          drafted += drafts.length
          log.push(`**Kunde:** ${message.replace(/\n/g, ' / ')}`, '', `**Eule:** ${response.assistantMessage.content.replace(/\n+/g, ' ').slice(0, 1200)}`, '', `Entwürfe: ${drafts.map((d) => `${d.screen}.${d.field}=${d.newValue}`).join(', ') || '—'}${(meta.notStaged ?? []).length > 0 ? ` · nicht vorbereitet: ${(meta.notStaged ?? []).map((n) => `${n.label} (${n.reason})`).join('; ')}` : ''}`, '')
          const pending = drafts.filter((d) => d.status === 'pending')
          if (pending.length > 0) await advisor.applyBatch(userId, YEAR, { drafts: pending.map((d) => ({ actionId: d.actionId })) })
        }
        conversations.push(...log)

        const confirmation = app.get(ConfirmationService)
        let right = 0
        for (const [template, expected] of Object.entries(scenario.fields)) {
          const key = template.replace(/\{(\w+)\}/g, (_, name: string) => ids[name] ?? name)
          const stored = await confirmation.readRawValue(userId, YEAR, key)
          rows.push({ scenario: scenario.name, mode, key: template, expected, stored })
          if (stored === expected) right += 1
          expect.soft(stored, `${mode}: ${template}`).toBe(expected)
        }

        const printout = app.get(PrintoutService)
        const { missing } = await printout.check(userId, YEAR)
        let pdfLine = 'kein Ausdruck geprüft'
        if (scenario.printable) {
          expect.soft(missing, `${mode}: nothing missing for the printout`).toEqual([])
          if (missing.length === 0 && scenario.pdf) {
            await prisma.unlock.create({ data: { userId, taxYear: YEAR, stripeCheckoutSessionId: `cs_${userId}`, status: 'bezahlt', paidAt: new Date() } })
            const form = (await PDFDocument.load(await printout.create(userId, YEAR, { editable: true }))).getForm()
            const text = (name: string) => {
              try {
                const field = form.getField(name)
                return field instanceof PDFTextField ? (field.getText() ?? '') : ''
              } catch {
                return '(Feld fehlt)'
              }
            }
            const wrong = Object.entries(scenario.pdf).filter(([name, value]) => text(name).replace(/[^\d]/g, '') !== value.replace(/[^\d]/g, ''))
            pdfLine = wrong.length === 0 ? `PDF: alle ${Object.keys(scenario.pdf).length} Felder richtig` : `PDF falsch: ${wrong.map(([name, value]) => `${name} soll ${value}, ist „${text(name)}“`).join('; ')}`
            expect.soft(wrong.map(([name]) => name), `${mode}: printed fields`).toEqual([])
          } else if (missing.length > 0) pdfLine = `Ausdruck fehlt: ${missing.join(', ')}`
        }

        const estimate = (await app.get(TaxEstimateService).getState(userId, YEAR)) as { kind: string; reason?: string }
        summaries.push(
          `- **${scenario.name} · ${mode}:** ${right}/${Object.keys(scenario.fields).length} Felder richtig · ${drafted} Entwürfe · ${notByModel > 0 ? `${notByModel}× nicht vom Modell beantwortet · ` : ''}Schätzung: ${estimate.kind}${estimate.reason ? ` (${estimate.reason})` : ''} · ${pdfLine}`,
        )
        expect.soft(notByModel, `${mode}: every message answered by the model`).toBe(0)
      })
    }
  }
})
