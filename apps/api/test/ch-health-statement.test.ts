// A Swiss health insurer's statement (ADR-0080): basic-insurance premiums per insured person become drafts
// for the right person or child; a second insurer adds up, the same statement again adds nothing.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ChHealthStatementParseStrategy } from '../src/ch-certificate-scan/ch-health-statement.parse-strategy.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const USER = 'user-kv'
const YEAR = 2025

const perPerson = (name: string, premium: string) =>
  [
    'Helsana Versicherungen AG',
    'Auszug fur die Steuererklarung 2025',
    `${name}, 01.02.1990, Versicherten Nr. 100 000 ${name.length}`,
    'Versicherungszeitraum Versicherungspramien Betrag',
    `01.01.2025 - 30.06.2025 Pramie Grundversicherung (KVG) ${premium}`,
    `Total Versicherungspramien ${premium}`,
  ].join('\n')

const family = [
  'SWICA GESUNDHEITSORGANISATION',
  'ZUSAMMENSTELLUNG FÜR IHRE STEUERERKLÄRUNG 2025',
  ...[
    ['KEMAL MUSTER', '1001', "1'400.00"],
    ['ANNA MUSTER', '1002', "1'400.00"],
    ['LEA MUSTER', '1003', '300.00'],
  ].flatMap(([name, no, premium]) => [
    name!,
    `VERSICHERTEN-NR. ${no}`,
    'KOSTENZUSAMMENSTELLUNG FÜR 2025',
    `Prämien Grundversicherung/Prämienverbilligung   ${premium}   0.00   ${premium}`,
    `Prämientotal 2025   ${premium}`,
  ]),
].join('\n')

async function setUp(withRate = true) {
  const kit = buildAdvisorTestKit()
  await kit.profileRepo.upsert(USER, { firstName: 'Kemal', lastName: 'Muster', steuerId: null, steuernummer: null })
  await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
  await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Anna', lastName: 'Muster' })
  const child = await kit.childRepo.create(USER, YEAR, { firstName: 'Lea', lastName: 'Muster', geburtsdatum: '2022-01-01' })
  if (withRate) await kit.chRepo.setExchangeRate(USER, YEAR, { month: '2025', rate: 1.05, mode: 'jahresdurchschnitt' })
  const strategy = new ChHealthStatementParseStrategy(new DocumentParseRegistry(), kit.service, new AuditService(new FakeAuditRepository()), kit.linkService, kit.chRepo, kit.childRepo)
  return { kit, strategy, childId: child.id }
}

type Drafts = { field: string; newValue: string; person?: string; instance: string | null; screen: string; actionId: string }[]
const parse = async (strategy: ChHealthStatementParseStrategy, rawText: string) => {
  const res = (await strategy.parse(USER, { taxYear: YEAR, fileName: 'kk.pdf', rawText, textSource: 'pdf_text' } as never)) as unknown as {
    parsed: { summary: string }
    assistantMessage: { content: string; meta?: { actions?: Drafts } } | null
  }
  return res
}

describe('the health insurer’s statement', () => {
  it('drafts each partner’s premiums in CHF and the child’s in euros at the Lohnausweis rate', async () => {
    const { kit, strategy, childId } = await setUp()
    const res = await parse(strategy, family)
    const all = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? [])
    expect(all.map((d) => [d.screen, d.field, d.newValue, d.person ?? 'A', d.instance])).toEqual([
      ['chLohnausweis', 'krankenkasseChf', '1400', 'A', null],
      ['kind', 'healthBasicEur', '315', 'A', childId],
      ['chLohnausweis', 'krankenkasseChf', '1400', 'B', null],
    ])
    expect(res.assistantMessage?.content).toContain('Grundversicherung')
  })

  it('adds a second insurer in the year to the first, and counts the same statement only once', async () => {
    const { kit, strategy } = await setUp()
    await parse(strategy, perPerson('Kemal Muster', "2'000.00"))
    const drafts = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? [])
    await kit.service.applyBatch(USER, YEAR, { drafts: drafts.map((d) => ({ actionId: d.actionId })) })
    expect((await kit.chRepo.findForUserAndYear(USER, YEAR))?.krankenkasseChf).toBe('2000')

    const again = await parse(strategy, perPerson('Kemal Muster', "2'000.00"))
    expect(again.assistantMessage).toBeNull()
    expect(again.parsed.summary).toContain('schon gezählt')

    await parse(strategy, family)
    const latest = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? []).filter((d) => d.status === 'pending')
    expect(latest.find((d) => d.field === 'krankenkasseChf' && !d.person)?.newValue).toBe('3400')
  })

  it('converts the child’s premiums at the official annual average while no rate is chosen, to be checked (ADR-0086)', async () => {
    const { kit, strategy } = await setUp(false)
    const res = await parse(strategy, family)
    const child = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? []).find((d) => d.field === 'healthBasicEur')
    // 300 CHF at the 2025 annual average 1,065.
    expect(child).toMatchObject({ newValue: '320', confidenceStatus: 'pruefen' })
    expect(res.assistantMessage?.content).toContain('amtlichen Jahresdurchschnitt')
  })

  it('counts the self-borne costs into the Krankheitskosten once, in euros at the Lohnausweis rate (escalation case)', async () => {
    const { kit, strategy } = await setUp()
    const withOwn = family.replace("KOSTENZUSAMMENSTELLUNG FÜR 2025\nPrämien Grundversicherung/Prämienverbilligung   1'400.00   0.00   1'400.00\nPrämientotal 2025   1'400.00", "KOSTENZUSAMMENSTELLUNG FÜR 2025\nPrämien Grundversicherung/Prämienverbilligung   1'400.00   0.00   1'400.00\nTotal Ihres Kostenanteils für 2025   300.00\nPrämientotal 2025   1'400.00")
    expect(withOwn).not.toBe(family)
    const res = await parse(strategy, withOwn)
    const drafts = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? [])
    // 300 CHF at 1,05.
    expect(drafts.filter((d) => d.screen === 'interview').map((d) => [d.field, d.newValue])).toEqual([
      ['gesundheit-gate', 'Ja'],
      ['gesundheit-betrag', '315'],
    ])
    expect(res.assistantMessage?.content).toContain('zu euren Krankheitskosten gerechnet')
    await kit.service.applyBatch(USER, YEAR, { drafts: drafts.map((d) => ({ actionId: d.actionId })) })

    await parse(strategy, withOwn)
    const pending = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? []).filter((d) => d.status === 'pending')
    expect(pending.filter((d) => d.field === 'gesundheit-betrag')).toEqual([])
  })

  it('names the children’s converted premiums once, not once per child', async () => {
    const { kit, strategy } = await setUp(false)
    await kit.childRepo.create(USER, YEAR, { firstName: 'Ben', lastName: 'Muster', geburtsdatum: '2023-01-01' })
    const twoKids = family.replace('LEA MUSTER', 'LEA MUSTER').concat("\nBEN MUSTER\nVERSICHERTEN-NR. 1004\nKOSTENZUSAMMENSTELLUNG FÜR 2025\nPrämien Grundversicherung/Prämienverbilligung   300.00   0.00   300.00\nPrämientotal 2025   300.00")
    const res = await parse(strategy, twoKids)
    expect(res.assistantMessage?.content.match(/amtlichen Jahresdurchschnitt/g)).toHaveLength(1)
    expect(res.assistantMessage?.content).toContain('Die Prämien der Kinder')
  })

  it('lets a dentist’s invoice add to the self-borne costs still waiting, not replace them', async () => {
    const { kit, strategy } = await setUp()
    const withOwn = family.replace("Prämientotal 2025   1'400.00", "Total Ihres Kostenanteils für 2025   300.00\nPrämientotal 2025   1'400.00")
    await parse(strategy, withOwn)
    const invoice = await kit.service.stageReceiptProposal(USER, YEAR, {
      screen: 'interview',
      field: 'gesundheit-betrag',
      newValue: '1700',
      companionFields: { 'gesundheit-gate': 'Ja' },
      label: 'Krankheitskosten (Summe im Jahr)',
      reason: 'Zahnarztrechnung.',
      sourceId: 'estg-33',
      summaryText: 'Zahnarztrechnung gelesen.',
      receiptId: null,
      countedItems: [{ ref: '0invoice', amountKey: '0invoice' }],
      engine: { mode: 'deterministic_fallback', provider: 'deterministic' },
    })
    // 300 CHF at 1,05 = 315 € waiting, plus 1.700 € for the invoice.
    expect(invoice.action).toMatchObject({ field: 'gesundheit-betrag', newValue: '2015' })
    const counted = await kit.service.countedReceiptItems(USER, YEAR, { screen: 'interview', field: 'gesundheit-betrag' })
    expect(counted.map((c) => c.ref)).toContain('0invoice')
    expect(counted.length).toBeGreaterThan(1)
  })

  it('applies the invoice after the statement’s drafts were taken over, though both open „Krankheitskosten: Ja“', async () => {
    const { kit, strategy } = await setUp()
    const withOwn = family.replace("Prämientotal 2025   1'400.00", "Total Ihres Kostenanteils für 2025   300.00\nPrämientotal 2025   1'400.00")
    await parse(strategy, withOwn)
    const invoice = await kit.service.stageReceiptProposal(USER, YEAR, {
      screen: 'interview',
      field: 'gesundheit-betrag',
      newValue: '1700',
      companionFields: { 'gesundheit-gate': 'Ja' },
      label: 'Krankheitskosten (Summe im Jahr)',
      reason: 'Zahnarztrechnung.',
      sourceId: 'estg-33',
      summaryText: 'Zahnarztrechnung gelesen.',
      receiptId: null,
      engine: { mode: 'deterministic_fallback', provider: 'deterministic' },
    })
    const statementDrafts = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? []).filter((d) => d.status === 'pending')
    await kit.service.applyBatch(USER, YEAR, { drafts: statementDrafts.map((d) => ({ actionId: d.actionId })) })
    await kit.service.applyAction(USER, YEAR, invoice.action.actionId)
    const answers = Object.fromEntries((await kit.interviewRepo.findAllForUserAndYear(USER, YEAR)).map((a) => [a.questionId, a.value]))
    expect(answers).toMatchObject({ 'gesundheit-gate': 'Ja', 'gesundheit-betrag': '2015' })
  })
})

