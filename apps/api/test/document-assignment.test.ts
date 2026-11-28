// Whose a document is (ADR-0092): the place of the upload decides, „Für wen?“ only in a household of
// several, a contradicting or unknown name is asked about, a document can be given to someone else with
// its values, a family statement is taken over per person, and a recorded amount is never added to or
// overwritten silently (finding N2). One rule for the masks, the Belege tab and the chat.
import { describe, expect, it } from 'vitest'
import type { AdvisorActionProposal } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { ChCertificateScanParseStrategy } from '../src/ch-certificate-scan/ch-certificate-scan.parse-strategy.js'
import { ChHealthStatementParseStrategy } from '../src/ch-certificate-scan/ch-health-statement.parse-strategy.js'
import { ChPensionStatementParseStrategy, ChPremiumLetterParseStrategy } from '../src/ch-certificate-scan/ch-letter.parse-strategy.js'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/llm/ai-runtime-config.service.js'
import { LstbScanParseStrategy } from '../src/lstb-scan/lstb-scan.parse-strategy.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import type { ParseReceiptDto } from '../src/receipt/dto/parse-receipt.dto.js'
import { AutoReceiptParseStrategy } from '../src/receipt/parse/auto-receipt-parse.strategy.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { ReceiptParseService } from '../src/receipt/receipt-parse.service.js'
import { ReceiptReassignService } from '../src/receipt/receipt-reassign.service.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { noSingleShotModel } from '../src/llm/single-shot-model.js'

const USER = 'user-zuordnung'
const YEAR = 2025

const offline: AiRuntimeConfigService = {
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => true,
  resolveSlot: async (slot) => ({ slot, enabled: false, provider: 'deterministic', model: 'x', apiKey: null }),
}

const lstbOf = (name: string, gross: string) =>
  [
    'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
    name,
    `3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.   ${gross}`,
    '4. Einbehaltene Lohnsteuer von 3.                         2.150,00',
    '23. a) Arbeitnehmeranteil zur gesetzlichen Rentenversicherung 1.953,00',
    '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 1.722,00',
    '26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung 315,00',
    '27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung 273,00',
  ].join('\n')

const family = (members: ReadonlyArray<readonly [string, string]>) =>
  [
    'SWICA GESUNDHEITSORGANISATION',
    'ZUSAMMENSTELLUNG FÜR IHRE STEUERERKLÄRUNG 2025',
    ...members.flatMap(([name, premium], i) => [
      name.toUpperCase(),
      `VERSICHERTEN-NR. 200000${i + 1}`,
      'KOSTENZUSAMMENSTELLUNG FÜR 2025',
      `Prämien Grundversicherung/Prämienverbilligung   ${premium}   0.00   ${premium}`,
      `Prämientotal 2025   ${premium}`,
    ]),
  ].join('\n')

const kitaForTwo = [
  'Kita Sonnenschein',
  'Jahresbescheinigung Elternbeiträge 2025',
  'Kind: Lio Sommer',
  'Betreuung ab 01.01.2025, monatlich 100,00 EUR',
  'Gesamt 2025: 1.200,00 EUR',
  'Kind: Ida Sommer',
  'Betreuung ab 01.03.2025, monatlich 300,00 EUR',
  'Gesamt 2025: 3.000,00 EUR',
].join('\n')

interface Options {
  readonly a?: { firstName: string; lastName: string } | null
  readonly b?: { firstName: string; lastName: string } | null
  readonly children?: readonly string[]
}

async function setUp(options: Options = {}) {
  const kit = buildAdvisorTestKit()
  const a = options.a === undefined ? { firstName: 'Elias', lastName: 'Sommer' } : options.a
  if (a !== null) await kit.profileRepo.upsert(USER, { ...a, steuerId: null, steuernummer: null })
  if (options.b) {
    await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
    await kit.linkService.updatePersonB(USER, YEAR, options.b)
  }
  const children: Record<string, string> = {}
  for (const firstName of options.children ?? []) {
    children[firstName] = (await kit.childRepo.create(USER, YEAR, { firstName, lastName: 'Sommer', geburtsdatum: '2020-01-01' })).id
  }
  await kit.chRepo.setExchangeRate(USER, YEAR, { month: '2025', rate: 1.05, mode: 'jahresdurchschnitt' })
  const audit = new AuditService(new FakeAuditRepository())
  const registry = new DocumentParseRegistry()
  const receipts = new FakeReceiptRepository()
  const auto = new AutoReceiptParseStrategy(offline, kit.staging, audit, noSingleShotModel)
  const parser = new ReceiptParseService(registry, auto, receipts, kit.staging)
  parser.onModuleInit()
  for (const strategy of [
    new LstbScanParseStrategy(registry, offline, kit.staging, audit, new LstbService(kit.lstbRepo, audit, new FakeMarkingRepository()), kit.linkService, noSingleShotModel),
    new ChCertificateScanParseStrategy(registry, offline, kit.staging, audit, kit.linkService, noSingleShotModel),
    new ChPensionStatementParseStrategy(registry, kit.staging, audit, kit.linkService, kit.chRepo),
    new ChPremiumLetterParseStrategy(registry, kit.staging, audit, kit.linkService, kit.chRepo),
    new ChHealthStatementParseStrategy(registry, kit.staging, audit, kit.linkService, kit.chRepo, kit.childRepo),
  ]) {
    strategy.onModuleInit()
  }
  const reassign = new ReceiptReassignService(receipts, parser, kit.staging, kit.drafts)
  const upload = async (rawText: string, extra: Partial<ParseReceiptDto> = {}) => {
    const receipt = await receipts.create(USER, { fileName: 'beleg.pdf' })
    const res = await parser.parseReceipt(USER, { taxYear: YEAR, fileName: 'beleg.pdf', rawText, textSource: 'pdf_text', receiptId: receipt.id, ...extra })
    return { res, receiptId: receipt.id }
  }
  const drafts = async (): Promise<AdvisorActionProposal[]> =>
    (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => [...(m.meta?.action ? [m.meta.action] : []), ...(m.meta?.actions ?? [])])
  const pending = async () => (await drafts()).filter((d) => d.status === 'pending')
  const applyAll = async (list: readonly AdvisorActionProposal[]) => kit.service.applyBatch(USER, YEAR, { drafts: list.map((d) => ({ actionId: d.actionId })) })
  return { kit, parser, receipts, reassign, upload, drafts, pending, applyAll, children }
}

describe('the place of the upload decides (decision 1)', () => {
  it('a document uploaded in B’s mask is B’s and is recorded as B’s', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { res, receiptId } = await t.upload(lstbOf('Nora Sommer', '21.000,00'), { kind: 'lstb', area: 'B' })
    expect(res.assignment).toMatchObject({ holder: { holder: 'B', name: 'Nora' }, question: null })
    expect((await t.pending()).every((d) => d.person === 'B')).toBe(true)
    expect((await t.receipts.findByIdForUser(USER, receiptId))?.holders).toEqual(['B'])
  })

  it('a document without a name in B’s mask is B’s too', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { res } = await t.upload(lstbOf('', '21.000,00'), { kind: 'lstb', area: 'B' })
    expect(res.assignment?.holder?.holder).toBe('B')
  })

  it('asks „Für wen?“ in the chat of a household of several, preselecting the person named, and stages nothing', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { res } = await t.upload(lstbOf('Nora Sommer', '21.000,00'))
    expect(res.assignment?.question).toMatchObject({ reason: 'which', preselected: 'B', options: [{ holder: 'A', name: 'Elias' }, { holder: 'B', name: 'Nora' }] })
    expect(res.stagedAction).toBeNull()
    expect(await t.drafts()).toHaveLength(0)
  })

  it('reads the document for the person the user chose', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { res } = await t.upload(lstbOf('Nora Sommer', '21.000,00'), { holder: 'B' })
    expect(res.assignment?.holder?.holder).toBe('B')
    expect((await t.pending()).find((d) => d.field === 'bruttoarbeitslohn')).toMatchObject({ person: 'B', newValue: '21000' })
  })

  it('a single person’s document is theirs without a question', async () => {
    const t = await setUp()
    const { res } = await t.upload(lstbOf('Elias Sommer', '36.000,00'))
    expect(res.assignment).toMatchObject({ holder: { holder: 'A' }, question: null })
    expect((await t.pending()).find((d) => d.field === 'bruttoarbeitslohn')?.newValue).toBe('36000')
  })

  it('a receipt of the joint return is never asked about', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { res } = await t.upload('Bestätigung über Geldzuwendungen im Sinne des § 10b EStG\nKinderhilfe Beispiel e.V.\nBetrag der Zuwendung: 300,00 EUR\nTag der Zuwendung: 01.12.2025')
    expect(res.assignment).toBeUndefined()
  })

  it('refuses a holder who is not in the household', async () => {
    const t = await setUp()
    await expect(t.upload(lstbOf('Elias Sommer', '36.000,00'), { holder: 'B' })).rejects.toMatchObject({ code: 'BELEG_HOLDER_UNKNOWN' })
  })
})

describe('a name that contradicts the place of the upload (decision 2)', () => {
  it('asks briefly when the document in B’s mask names A', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { res } = await t.upload(lstbOf('Elias Sommer', '36.000,00'), { kind: 'lstb', area: 'B' })
    expect(res.assignment?.question).toMatchObject({ reason: 'contradiction', preselected: 'A', area: { holder: 'B', name: 'Nora' }, printedName: 'Elias Sommer' })
    expect(res.parsed.summary).toBe('Der Beleg lautet auf Elias Sommer, du bist bei Nora – für wen?')
    expect(await t.drafts()).toHaveLength(0)
  })
})

describe('somebody outside the household (decision 3) and a nameless A (N1)', () => {
  it('offers to create Person B for a stranger’s certificate', async () => {
    const t = await setUp()
    const { res } = await t.upload(lstbOf('Jonas Weber', '21.000,00'))
    expect(res.assignment?.question).toMatchObject({ reason: 'unknown', offerCreate: ['B'], printedName: 'Jonas Weber' })
    expect(res.parsed.summary).toContain('Jonas Weber')
    expect(await t.drafts()).toHaveLength(0)
  })

  it('offers to create a child for a Kita notice when no child is recorded', async () => {
    const t = await setUp()
    const { res } = await t.upload('Kita Sonnenschein\nJahresbescheinigung Elternbeiträge\nBetreuung für das Kind Mia Sommer\nDer Elternbeitrag beträgt ab 01.01.2025 monatlich 100,00 EUR.\nGesamt 2025: 1.200,00 EUR')
    expect(res.assignment?.question).toMatchObject({ reason: 'unknown', offerCreate: ['kind'], printedName: 'Mia Sommer', options: [] })
  })

  it('asks „Bist du …?“ once while A has no name, and never puts a partner’s document at A silently (N1)', async () => {
    const t = await setUp({ a: null })
    const { res } = await t.upload(lstbOf('Nora Sommer', '21.000,00'))
    expect(res.assignment?.question).toMatchObject({ reason: 'confirmSelf', printedName: 'Nora Sommer', offerCreate: ['B'] })
    expect(res.parsed.summary).toBe('Der Beleg lautet auf Nora Sommer. Bist du das?')
    expect(await t.drafts()).toHaveLength(0)
    // „Ja, das bin ich“: the user's choice reads it for A.
    const yes = await t.upload(lstbOf('Nora Sommer', '21.000,00'), { holder: 'A' })
    expect(yes.res.assignment?.holder?.holder).toBe('A')
  })
})

describe('another person for a document (decision 4)', () => {
  it('moves the values: taken back at A, written for B', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { receiptId } = await t.upload(lstbOf('Nora Sommer', '21.000,00'), { holder: 'A' })
    await t.applyAll(await t.pending())
    expect((await t.kit.lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('21000')

    const moved = await t.reassign.reassign(USER, receiptId, { taxYear: YEAR, holder: 'B', rawText: lstbOf('Nora Sommer', '21.000,00'), textSource: 'pdf_text' })
    // The three values and the lines 23a, 25–27 and 24 (empty: 0) each are a draft.
    expect(moved).toMatchObject({ holders: ['B'], takenBack: 8, applied: 8, waiting: 0 })
    expect((await t.kit.lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn ?? null).toBeNull()
    const bUser = await t.kit.linkService.dataUser(USER, YEAR, 'B')
    expect((await t.kit.lstbRepo.findForUserAndYear(bUser, YEAR))?.bruttoarbeitslohn).toBe('21000')
    expect((await t.receipts.findByIdForUser(USER, receiptId))?.holders).toEqual(['B'])
  })

  it('keeps at the person before what was changed since by hand', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { receiptId } = await t.upload(lstbOf('Nora Sommer', '21.000,00'), { holder: 'A' })
    await t.applyAll(await t.pending())
    await t.kit.lstbRepo.setField(USER, YEAR, 'bruttoarbeitslohn', '22000')
    const moved = await t.reassign.reassign(USER, receiptId, { taxYear: YEAR, holder: 'B' })
    expect(moved).toMatchObject({ holders: ['B'], takenBack: 8, parse: null })
    const after = await t.kit.lstbRepo.findForUserAndYear(USER, YEAR)
    expect(after?.bruttoarbeitslohn).toBe('22000')
    expect(after?.lohnsteuer ?? null).toBeNull()
  })

  it('a first assignment only prepares the drafts', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' } })
    const { receiptId } = await t.upload(lstbOf('Nora Sommer', '21.000,00'))
    const res = await t.reassign.reassign(USER, receiptId, { taxYear: YEAR, holder: 'B', rawText: lstbOf('Nora Sommer', '21.000,00') })
    expect(res).toMatchObject({ takenBack: 0, applied: 0, waiting: 8 })
  })

  it('refuses another account’s document and a stranger as holder', async () => {
    const t = await setUp()
    await expect(t.reassign.reassign(USER, 'nope', { taxYear: YEAR, holder: 'A' })).rejects.toMatchObject({ code: 'BELEG_NOT_FOUND' })
    const { receiptId } = await t.upload(lstbOf('Elias Sommer', '36.000,00'))
    await expect(t.reassign.reassign(USER, receiptId, { taxYear: YEAR, holder: 'B' })).rejects.toMatchObject({ code: 'BELEG_HOLDER_UNKNOWN' })
  })
})

describe('a document for several people (decision 5)', () => {
  it('takes only the holder’s lines of a family statement and offers the others', async () => {
    const t = await setUp({ b: { firstName: 'Nora', lastName: 'Sommer' }, children: ['Lio'] })
    const statement = family([['Elias Sommer', "2'100.00"], ['Nora Sommer', "1'950.00"], ['Lio Sommer', '480.00']])
    const { res, receiptId } = await t.upload(statement, { holder: 'A' })
    expect((await t.pending()).map((d) => [d.person ?? 'A', d.field, d.newValue])).toEqual([['A', 'krankenkasseChf', '2100']])
    expect(res.assignment?.alsoFor.map((p) => p.holder)).toEqual(['B', `kind:${t.children.Lio}`])

    const forB = await t.parser.parseReceipt(USER, { taxYear: YEAR, fileName: 'kk.pdf', rawText: statement, textSource: 'pdf_text', receiptId, holder: 'B', alsoFor: true })
    expect((await t.pending()).filter((d) => d.person === 'B').map((d) => [d.field, d.newValue])).toEqual([['krankenkasseChf', '1950']])
    expect(forB.assignment?.alsoFor.map((p) => p.holder)).toEqual([`kind:${t.children.Lio}`])
    expect((await t.receipts.findByIdForUser(USER, receiptId))?.holders).toEqual(['A', 'B'])
  })

  it('reads one child’s lines of a Kita certificate for two children', async () => {
    const t = await setUp({ children: ['Lio', 'Ida'] })
    const first = await t.upload(kitaForTwo)
    expect(first.res.assignment?.question).toMatchObject({ reason: 'which', preselected: `kind:${t.children.Lio}` })
    const { res } = await t.upload(kitaForTwo, { holder: `kind:${t.children.Ida}` })
    const ida = (await t.pending()).filter((d) => d.instance === t.children.Ida)
    expect(ida.map((d) => [d.field, d.newValue])).toEqual([
      ['childcareFrom', '01.03.2025'],
      ['childcareTo', '31.12.2025'],
      ['childcareEur', '3000'],
    ])
    expect(res.assignment?.alsoFor.map((p) => p.holder)).toEqual([`kind:${t.children.Lio}`])
  })
})

describe('an amount already there (decision 6, N2)', () => {
  it('does not add a family statement’s premium to the same premium told in the chat (N2)', async () => {
    const t = await setUp()
    // The chat recorded 2.100 CHF (an applied owl draft, no document).
    await t.kit.service.stageDocumentDrafts(USER, YEAR, {
      screen: 'chLohnausweis', person: 'A', digestUserId: USER, receiptId: null, engine: { mode: 'deterministic_fallback', provider: 'deterministic' }, summaryText: 'Chat', sourceId: 'estg-10-1-3',
      fields: [{ field: 'krankenkasseChf', label: 'Krankenkasse', value: 2100, status: 'ok', reason: null }],
    })
    await t.applyAll(await t.pending())
    await t.upload(family([['Elias Sommer', "2'100.00"]]))
    expect((await t.pending()).map((d) => [d.field, d.newValue, d.combination])).toEqual([['krankenkasseChf', '2100', undefined]])
  })

  it('asks „zusätzlich oder ersetzen?“ for a different amount from another source, and applies the choice', async () => {
    const t = await setUp()
    await t.upload(lstbOf('Elias Sommer', '36.000,00'))
    await t.applyAll(await t.pending())
    await t.upload(lstbOf('Elias Sommer', '21.000,00'))
    const gross = (await t.pending()).filter((d) => d.field === 'bruttoarbeitslohn')
    expect(gross.map((d) => [d.combination, d.newValue])).toEqual([
      ['add', '57000'],
      ['replace', '21000'],
    ])
    expect(gross[0]!.alternativeGroup).toBe(gross[1]!.alternativeGroup)
    expect(gross[0]!.reason).toContain('aus einem anderen Beleg')
    await t.kit.service.applyAction(USER, YEAR, gross[0]!.actionId)
    expect((await t.kit.lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('57000')
    expect((await t.drafts()).find((d) => d.actionId === gross[1]!.actionId)?.status).toBe('superseded')
  })

  it('says when the value there was typed by hand or told in the chat', async () => {
    const t = await setUp()
    await t.kit.lstbRepo.setField(USER, YEAR, 'bruttoarbeitslohn', '30000')
    await t.upload(lstbOf('Elias Sommer', '21.000,00'))
    const add = (await t.pending()).find((d) => d.field === 'bruttoarbeitslohn' && d.combination === 'add')
    expect(add?.reason).toContain('von Hand oder im Chat eingetragen')
  })

  it('the LStB mask keeps its own choice: no alternatives there', async () => {
    const t = await setUp()
    await t.upload(lstbOf('Elias Sommer', '36.000,00'))
    await t.applyAll(await t.pending())
    await t.upload(lstbOf('Elias Sommer', '21.000,00'), { kind: 'lstb', area: 'A' })
    expect((await t.pending()).some((d) => d.combination !== undefined)).toBe(false)
  })
})
