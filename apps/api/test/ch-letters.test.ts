// The Swiss letters beside the Lohnausweis (ADR-0075): the pension fund's statement and the
// employer's premium letter become N-Gre drafts for the right person, checked against Ziffer 10.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ChPensionStatementParseStrategy, ChPremiumLetterParseStrategy } from '../src/ch-certificate-scan/ch-letter.parse-strategy.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const USER = 'user-a'
const YEAR = 2025

const pensionTable = (holder: string, year = YEAR) =>
  [
    'Pension Fund Beispiel',
    'Frau',
    holder,
    `Übersicht über die obligatorischen und überobligatorischen Beiträge zur 2. Säule der schweizerischen Altersvorsorge ${year}`,
    'Arbeitnehmer AN',
    "Obligatorisch 2'200.00 600.00 2'800.00",
    "Überobligatorisch 1'800.00 200.00 2'000.00",
    "TOTAL AN 4'000.00 800.00 4'800.00",
    'Arbeitgeber AG',
    "Obligatorisch 2'200.00 600.00 2'800.00",
    "Überobligatorisch 4'300.00 200.00 4'500.00",
    "TOTAL AG 6'500.00 800.00 7'300.00",
  ].join('\n')

const premiumLetter = (holder: string, full: boolean) =>
  [
    holder,
    `Bestätigung Krankentaggeld- und Nichtberufsunfallversicherung ${YEAR}`,
    `Die Firma hat folgende Prämien im Jahr ${YEAR} für Sie geleistet:`,
    'Krankentaggeld:                      412,35 CHF',
    'Nichtberufsunfall:                   498,15 CHF',
    ...(full ? ['Die Beispiel AG zahlt die volle Prämie und verrechnet keinen Anteil an den Mitarbeitenden weiter.'] : []),
  ].join('\n')

async function setUp() {
  const kit = buildAdvisorTestKit()
  await kit.profileRepo.upsert(USER, { firstName: 'Kemal', lastName: 'Muster', steuerId: null, steuernummer: null })
  await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
  await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Anna', lastName: 'Muster' })
  const registry = new DocumentParseRegistry()
  const audit = new AuditService(new FakeAuditRepository())
  return {
    kit,
    pension: new ChPensionStatementParseStrategy(registry, kit.service, audit, kit.linkService, kit.chRepo),
    premiums: new ChPremiumLetterParseStrategy(registry, kit.service, audit, kit.linkService, kit.chRepo),
  }
}

const parse = (strategy: { parse: (u: string, d: never) => Promise<unknown> }, rawText: string, extra: Record<string, unknown> = {}) =>
  strategy.parse(USER, { taxYear: YEAR, fileName: 'brief.pdf', rawText, textSource: 'pdf_text', ...extra } as never) as Promise<{
    chLetter: { person: string | null; personUnclear: boolean; fields: { field: string; value: number; status: string; reason: string | null }[]; stagedActionIds: string[]; yearConflict: unknown }
    assistantMessage: { content: string; meta?: { actions?: { field: string; newValue: string; person?: string; actionId: string }[] } } | null
  }>

describe('the pension fund statement', () => {
  it('drafts the mandatory parts and the employer total for the person named on it', async () => {
    const { kit, pension } = await setUp()
    const res = await parse(pension, pensionTable('Anna Muster'))
    expect(res.chLetter.person).toBe('B')
    const drafts = res.assistantMessage?.meta?.actions ?? []
    expect(drafts.map((d) => [d.field, d.newValue, d.person])).toEqual([
      ['pkArbeitnehmerChf', '2800', 'B'],
      ['pkArbeitgeberChf', '2800', 'B'],
      ['pkArbeitgeberGesamtChf', '7300', 'B'],
    ])
    await kit.service.applyBatch(USER, YEAR, { drafts: drafts.map((d) => ({ actionId: d.actionId })) })
    const spouse = await kit.linkService.dataUser(USER, YEAR, 'B')
    expect((await kit.chRepo.findForUserAndYear(spouse, YEAR))?.nGre.pkArbeitgeberGesamtChf).toBe('7300')
  })

  it('checks the employee total against Ziffer 10 of the Lohnausweis already entered', async () => {
    const { kit, pension } = await setUp()
    const spouse = await kit.linkService.dataUser(USER, YEAR, 'B')
    await kit.chRepo.setField(spouse, YEAR, 'berufliche-vorsorge', '4800')
    expect((await parse(pension, pensionTable('Anna Muster'))).assistantMessage?.content).toContain('passen zu Ziffer 10')
    await kit.chRepo.setField(spouse, YEAR, 'berufliche-vorsorge', '5900')
    const off = await parse(pension, pensionTable('Anna Muster'))
    expect(off.assistantMessage?.content).toContain('weichen von Ziffer 10')
    expect(off.chLetter.fields.find((f) => f.field === 'pkArbeitgeberGesamtChf')).toMatchObject({ status: 'pruefen', reason: 'plausibility_conflict' })
  })

  it('stages nothing for a statement of another year', async () => {
    const { pension } = await setUp()
    const res = await parse(pension, pensionTable('Anna Muster', 2024))
    expect(res.chLetter).toMatchObject({ yearConflict: { documentYear: 2024, activeYear: YEAR }, stagedActionIds: [] })
  })

  it('asks whose it is when the name fits neither person', async () => {
    const { pension } = await setUp()
    expect((await parse(pension, pensionTable('Someone Else'))).chLetter).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
  })
})

describe('the employer’s premium letter', () => {
  it('drafts what the employer paid and asks whether that is the whole premium', async () => {
    const { premiums } = await setUp()
    const res = await parse(premiums, premiumLetter('Kemal Muster', false))
    expect(res.chLetter.person).toBe('A')
    expect((res.assistantMessage?.meta?.actions ?? []).map((d) => [d.field, d.newValue])).toEqual([
      ['krankentaggeldArbeitgeberChf', '412'],
      ['nbuvArbeitgeberChf', '498'],
    ])
    expect(res.assistantMessage?.content).toContain('Zahlt dein Arbeitgeber sie ganz?')
  })

  it('adds 100 % when the letter says the employer pays the full premium', async () => {
    const { premiums } = await setUp()
    const res = await parse(premiums, premiumLetter('Kemal Muster', true))
    expect((res.assistantMessage?.meta?.actions ?? []).map((d) => d.field)).toEqual([
      'krankentaggeldArbeitgeberChf',
      'nbuvArbeitgeberChf',
      'krankentaggeldArbeitgeberProzent',
      'nbuvArbeitgeberProzent',
    ])
  })

  it('drafts 100 % for sickness pay when the person’s own premium is 0 in the mask, and still asks about NBU', async () => {
    const { kit, premiums } = await setUp()
    await kit.chRepo.setNGre(USER, YEAR, { krankentaggeldChf: '0' } as never)
    const res = await parse(premiums, premiumLetter('Kemal Muster', false))
    expect((res.assistantMessage?.meta?.actions ?? []).map((d) => d.field)).toContain('krankentaggeldArbeitgeberProzent')
    expect((res.assistantMessage?.meta?.actions ?? []).map((d) => d.field)).not.toContain('nbuvArbeitgeberProzent')
    expect(res.assistantMessage?.content).toContain('die NBU-Prämie')
  })

  it('never offers a scan’s figures as read', async () => {
    const { premiums } = await setUp()
    const res = await parse(premiums, premiumLetter('Kemal Muster', false), { textSource: 'ocr' })
    expect(res.chLetter.fields.every((f) => f.status === 'pruefen' && f.reason === 'ocr_source')).toBe(true)
  })
})
