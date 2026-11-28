// Safety net (real-case finding C2): a partner's document uploaded in the chat while no Person B exists
// must not be written to Person A nor supersede A's drafts; it asks "Wessen Beleg ist das?" instead.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ChCertificateScanParseStrategy } from '../src/ch-certificate-scan/ch-certificate-scan.parse-strategy.js'
import { ChHealthStatementParseStrategy } from '../src/ch-certificate-scan/ch-health-statement.parse-strategy.js'
import { ChPensionStatementParseStrategy, ChPremiumLetterParseStrategy } from '../src/ch-certificate-scan/ch-letter.parse-strategy.js'
import { printedHolderName } from '../src/ch-certificate-scan/document-holder.js'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/llm/ai-runtime-config.service.js'
import { LstbScanParseStrategy } from '../src/lstb-scan/lstb-scan.parse-strategy.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { noSingleShotModel } from '../src/llm/single-shot-model.js'

const USER = 'user-a'
const YEAR = 2025

const offline: AiRuntimeConfigService = {
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => true,
  resolveSlot: async (slot) => ({ slot, enabled: false, provider: 'deterministic', model: 'x', apiKey: null }),
}

const lstbOf = (name: string | null, gross: string) =>
  [
    'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
    ...(name ? [name] : []),
    `3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.   ${gross}`,
    '4. Einbehaltene Lohnsteuer von 3.                         2.150,00',
    '23. a) Arbeitnehmeranteil zur gesetzlichen Rentenversicherung 1.953,00',
    '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 1.722,00',
    '26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung 315,00',
    '27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung 273,00',
  ].join('\n')

const lohnausweisText = (holder: string | null) =>
  ['A X Lohnausweis - Certificat de salaire', `D ${YEAR} E 01.01.${YEAR} 31.12.${YEAR}`, 'H', ...(holder ? [holder] : []), '1. Lohn 19.900', '8 Bruttolohn total = 19.900', '9. Beiträge AHV - 1.347', '10 Berufliche Vorsorge - 1.181', '11. Nettolohn = 17.372', '12. Quellensteuerabzug 896', '15. Bemerkungen'].join('\n')

const pensionTable = (holder: string | null) =>
  [
    'Pension Fund Beispiel',
    ...(holder ? ['Frau', holder] : []),
    `Übersicht über die obligatorischen und überobligatorischen Beiträge zur 2. Säule der schweizerischen Altersvorsorge ${YEAR}`,
    'Arbeitnehmer AN',
    "Obligatorisch 2'200.00 600.00 2'800.00",
    "TOTAL AN 4'000.00 800.00 4'800.00",
    'Arbeitgeber AG',
    "Obligatorisch 2'200.00 600.00 2'800.00",
    "TOTAL AG 6'500.00 800.00 7'300.00",
  ].join('\n')

const premiumLetter = (holder: string | null) =>
  [
    ...(holder ? [holder] : []),
    `Bestätigung Krankentaggeld- und Nichtberufsunfallversicherung ${YEAR}`,
    `Die Firma hat folgende Prämien im Jahr ${YEAR} für Sie geleistet:`,
    'Krankentaggeld:                      412,35 CHF',
    'Nichtberufsunfall:                   498,15 CHF',
  ].join('\n')

const healthOf = (name: string) =>
  ['Helsana Versicherungen AG', `Auszug fur die Steuererklarung ${YEAR}`, `${name}, 01.02.1990, Versicherten Nr. 100 000 1`, 'Versicherungszeitraum Versicherungspramien Betrag', '01.01.2025 - 30.06.2025 Pramie Grundversicherung (KVG) 1\'400.00', 'Total Versicherungspramien 1\'400.00'].join('\n')

async function setUp() {
  const kit = buildAdvisorTestKit()
  // The user is Elias Sommer; no Person B (no joint return, no spouse on record).
  await kit.profileRepo.upsert(USER, { firstName: 'Elias', lastName: 'Sommer', steuerId: null, steuernummer: null })
  const registry = new DocumentParseRegistry()
  const audit = new AuditService(new FakeAuditRepository())
  return {
    kit,
    lstb: new LstbScanParseStrategy(registry, offline, kit.staging, audit, new LstbService(kit.lstbRepo, audit, new FakeMarkingRepository()), kit.linkService, noSingleShotModel),
    lohnausweis: new ChCertificateScanParseStrategy(new DocumentParseRegistry(), offline, kit.staging, audit, kit.linkService, noSingleShotModel),
    pension: new ChPensionStatementParseStrategy(new DocumentParseRegistry(), kit.staging, audit, kit.linkService, kit.chRepo),
    premiums: new ChPremiumLetterParseStrategy(new DocumentParseRegistry(), kit.staging, audit, kit.linkService, kit.chRepo),
    health: new ChHealthStatementParseStrategy(new DocumentParseRegistry(), kit.staging, audit, kit.linkService, kit.chRepo, kit.childRepo),
  }
}

type Parser = { parse: (u: string, d: never) => Promise<unknown> }
const run = async (s: Parser, rawText: string) =>
  (await s.parse(USER, { taxYear: YEAR, fileName: 'x.pdf', rawText, textSource: 'pdf_text' } as never)) as {
    lstb?: { person: string | null; personUnclear: boolean; stagedActionIds: string[] }
    chLohnausweis?: { person: string | null; personUnclear: boolean; stagedActionIds: string[] }
    chLetter?: { person: string | null; personUnclear: boolean; stagedActionIds: string[] }
    stagedAction: unknown
    assistantMessage: { meta?: { actions?: { actionId: string }[] } } | null
  }
const pendingActions = async (kit: Awaited<ReturnType<typeof setUp>>['kit']) => (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? [])

describe('a partner’s LStB in the chat without Person B', () => {
  it('asks whose it is and stages nothing for A', async () => {
    const { kit, lstb } = await setUp()
    const res = await run(lstb, lstbOf('Nora Sommer', '21.000,00'))
    expect(res.lstb).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
    expect(res.stagedAction).toBeNull()
    expect(await pendingActions(kit)).toHaveLength(0)
  })

  it('leaves A’s own waiting drafts untouched', async () => {
    const { kit, lstb } = await setUp()
    const own = await run(lstb, lstbOf('Elias Sommer', '30.000,00'))
    expect(own.lstb).toMatchObject({ person: 'A', personUnclear: false })
    const before = await pendingActions(kit)
    expect(before.length).toBeGreaterThan(0)
    await run(lstb, lstbOf('Nora Sommer', '21.000,00'))
    expect(await pendingActions(kit)).toEqual(before)
    await kit.service.applyBatch(USER, YEAR, { drafts: (own.lstb?.stagedActionIds ?? []).map((actionId) => ({ actionId })) })
    expect((await kit.lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('30000')
  })

  it('stays A’s when the user’s own name is on it, or when no name is recognisable', async () => {
    const { lstb } = await setUp()
    expect((await run(lstb, lstbOf('Elias Sommer', '21.000,00'))).lstb).toMatchObject({ person: 'A', personUnclear: false })
    expect((await run(lstb, lstbOf(null, '21.000,00'))).lstb).toMatchObject({ person: 'A', personUnclear: false })
  })
})

describe('a partner’s Swiss documents in the chat without Person B', () => {
  it('Lohnausweis: asks and stages nothing; A’s own stays A', async () => {
    const { kit, lohnausweis } = await setUp()
    const own = await run(lohnausweis, lohnausweisText('Sommer Elias'))
    expect(own.chLohnausweis).toMatchObject({ person: 'A', personUnclear: false })
    const before = await pendingActions(kit)
    const res = await run(lohnausweis, lohnausweisText('Sommer Nora'))
    expect(res.chLohnausweis).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
    expect(await pendingActions(kit)).toEqual(before)
    expect((await run(lohnausweis, lohnausweisText(null))).chLohnausweis).toMatchObject({ person: 'A', personUnclear: false })
  })

  it('pension fund statement: asks and stages nothing; A’s own stays A', async () => {
    const { kit, pension } = await setUp()
    expect((await run(pension, pensionTable('Elias Sommer'))).chLetter).toMatchObject({ person: 'A', personUnclear: false })
    const before = await pendingActions(kit)
    const res = await run(pension, pensionTable('Nora Sommer'))
    expect(res.chLetter).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
    expect(await pendingActions(kit)).toEqual(before)
    expect((await run(pension, pensionTable(null))).chLetter).toMatchObject({ person: 'A', personUnclear: false })
  })

  it('employer’s premium letter: asks and stages nothing; A’s own stays A', async () => {
    const { kit, premiums } = await setUp()
    expect((await run(premiums, premiumLetter('Elias Sommer'))).chLetter).toMatchObject({ person: 'A', personUnclear: false })
    const before = await pendingActions(kit)
    const res = await run(premiums, premiumLetter('Nora Sommer'))
    expect(res.chLetter).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
    expect(await pendingActions(kit)).toEqual(before)
  })

  it('health statement: a partner’s premiums are never staged for A', async () => {
    const { kit, health } = await setUp()
    await run(health, healthOf('Elias Sommer'))
    const before = await pendingActions(kit)
    expect(before.length).toBeGreaterThan(0)
    const res = await run(health, healthOf('Nora Sommer'))
    expect(res.stagedAction).toBeNull()
    expect(await pendingActions(kit)).toEqual(before)
  })
})

describe('printedHolderName', () => {
  it('finds a name line or a labelled name, not headings', () => {
    expect(printedHolderName('Lohnsteuerbescheinigung 2025\nNora Sommer\n3. Bruttoarbeitslohn 1')).toBe('Nora Sommer')
    expect(printedHolderName('Name, Vorname: Sommer Nora')).toBe('Sommer Nora')
    expect(printedHolderName('Elektronische Lohnsteuerbescheinigung\nPension Fund Beispiel')).toBeNull()
  })
})
