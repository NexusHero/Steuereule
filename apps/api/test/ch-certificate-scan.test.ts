// The Swiss salary certificate read from an upload: every Ziffer as a draft for the right person,
// the form's sums as the check, the head (name, AHV number) never sent to a model.
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ChCertificateScanParseStrategy } from '../src/ch-certificate-scan/ch-certificate-scan.parse-strategy.js'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { looksLikeChSalaryCertificate } from '../src/receipt/receipt-parse.service.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const USER = 'user-a'
const YEAR = 2025

class RecordingModel extends BaseChatModel {
  readonly seen: string[] = []
  constructor(private readonly answer: string) {
    super({})
  }
  _llmType(): string {
    return 'recording-test'
  }
  async _generate(messages: BaseMessage[], _o: this['ParsedCallOptions'], _r?: CallbackManagerForLLMRun): Promise<ChatResult> {
    this.seen.push(messages.map((m) => String(m.content)).join('\n'))
    return { generations: [{ text: this.answer, message: new AIMessage(this.answer) }] }
  }
}

const runtime = (enabled: boolean): AiRuntimeConfigService => ({
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => !enabled,
  resolveSlot: async (slot) => ({ slot, enabled, provider: enabled ? 'google-genai' : 'deterministic', model: 'test-model', apiKey: enabled ? 'test-only-key' : null }),
})

/** An invented certificate in the layout of the official form. */
function certificate(holder: string, quellensteuer = '4.321'): string {
  return [
    'A     X          Lohnausweis - Certificat de salaire - Certificato di salario',
    '      756.1234.5678.97                                 01.02.1990',
    `D     ${YEAR}                          E      01.01.${YEAR}                 31.12.${YEAR}                              G        X       Repas à la cantine`,
    'H',
    '          - PERSÖNLICH -',
    `          ${holder}`,
    '          Beispielweg 3',
    ' 1. Lohn soweit nicht unter Ziffer 2-7 aufzuführen                                       100.000',
    ' 8 Bruttolohn total / Rente - Salaire brut total / Rente                       =                  100.000',
    ' 9. Beiträge AHV/IV/EO/ALV/NBUV - Cotisations AVS/AI/APG/AC/AANP              -                      6.900',
    '10 Berufliche Vorsorge        2. Säule 10.1 Ordentliche Beiträge               -                      6.000',
    '11. Nettolohn / Rente - Salaire net / Rente                                    =                   87.100',
    `12. Quellensteuerabzug - Retenue de l'impôt à la source                                          ${quellensteuer}`,
    '15. Bemerkungen',
  ].join('\n')
}

async function setUp(options: { spouse?: boolean; model?: RecordingModel } = {}) {
  const kit = buildAdvisorTestKit()
  await kit.profileRepo.upsert(USER, { firstName: 'Kemal', lastName: 'Muster', steuerId: null, steuernummer: null })
  if (options.spouse) {
    await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
    await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Jürgen', lastName: 'Muster' })
  }
  const registry = new DocumentParseRegistry()
  const strategy = new ChCertificateScanParseStrategy(
    registry,
    runtime(options.model !== undefined),
    kit.service,
    new AuditService(new FakeAuditRepository()),
    kit.linkService,
    options.model ? () => options.model! : undefined,
  )
  return { kit, strategy }
}

const parse = (strategy: ChCertificateScanParseStrategy, rawText: string, extra: Record<string, unknown> = {}) =>
  strategy.parse(USER, { taxYear: YEAR, fileName: 'lohnausweis.pdf', rawText, textSource: 'pdf_text', ...extra } as never)

describe('the Swiss salary certificate from an upload', () => {
  it('drafts every Ziffer for the user and writes nothing before they apply', async () => {
    const { kit, strategy } = await setUp()
    const res = await parse(strategy, certificate('Muster Kemal'))
    expect(res.chLohnausweis).toMatchObject({ person: 'A', personUnclear: false, checks: { gross: 'ok', net: 'ok' }, canteen: true, missing: [] })
    const drafts = res.assistantMessage?.meta?.actions ?? []
    expect(drafts.map((d) => [d.field, d.newValue])).toEqual([
      ['lohn', '100000'],
      ['bruttolohn-total', '100000'],
      ['ahv-beitraege', '6900'],
      ['berufliche-vorsorge', '6000'],
      ['nettolohn', '87100'],
      ['quellensteuer', '4321'],
    ])
    expect(drafts.every((d) => d.screen === 'chLohnausweis' && d.person === undefined)).toBe(true)
    expect(await kit.chRepo.findForUserAndYear(USER, YEAR)).toBeNull()
    expect(res.assistantMessage?.content).not.toContain('Kemal')
  })

  it('drafts the family allowances the remarks name for the Anlage N-Gre, into B’s mask for B (ADR-0088)', async () => {
    const { kit, strategy } = await setUp({ spouse: true })
    const withAllowances = certificate('Muster Jürgen').replace('15. Bemerkungen', "15. Bemerkungen   Kinderzulagen CHF 2'580, im Lohn enthalten")
    await parse(strategy, withAllowances)
    const drafts = (await kit.advisorRepo.listForUserAndYear(USER, YEAR)).flatMap((m) => m.meta?.actions ?? [])
    expect(drafts.find((d) => d.field === 'familienzulagenChf')).toMatchObject({ newValue: '2580', person: 'B' })
    await kit.service.applyBatch(USER, YEAR, { drafts: drafts.map((d) => ({ actionId: d.actionId })) })
    const spouse = await kit.linkService.dataUser(USER, YEAR, 'B')
    expect((await kit.chRepo.findForUserAndYear(spouse, YEAR))?.nGre.familienzulagenChf).toBe('2580')
  })

  it('puts the spouse’s certificate into Person B’s mask, by the name on it', async () => {
    const { kit, strategy } = await setUp({ spouse: true })
    const res = await parse(strategy, certificate('Muster Juergen'))
    expect(res.chLohnausweis?.person).toBe('B')
    const drafts = res.assistantMessage?.meta?.actions ?? []
    expect(drafts.every((d) => d.person === 'B')).toBe(true)
    await kit.service.applyBatch(USER, YEAR, { drafts: drafts.map((d) => ({ actionId: d.actionId })) })
    const spouse = await kit.linkService.dataUser(USER, YEAR, 'B')
    expect((await kit.chRepo.findForUserAndYear(spouse, YEAR))?.fields['bruttolohn-total']).toBe('100000')
    expect(await kit.chRepo.findForUserAndYear(USER, YEAR)).toBeNull()
  })

  it('asks whose certificate it is when the name fits neither, and stages nothing', async () => {
    const { strategy } = await setUp({ spouse: true })
    const res = await parse(strategy, certificate('Someone Else'))
    expect(res.chLohnausweis).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
    expect(res.assistantMessage).toBeNull()
    const chosen = await parse(strategy, certificate('Someone Else'), { person: 'B' })
    expect(chosen.chLohnausweis?.person).toBe('B')
    expect(chosen.chLohnausweis?.stagedActionIds.length).toBeGreaterThan(0)
  })

  it('never offers a scan’s figures as read', async () => {
    const { strategy } = await setUp()
    const res = await parse(strategy, certificate('Muster Kemal'), { textSource: 'ocr' })
    expect(res.chLohnausweis?.fields.every((f) => f.status === 'pruefen' && f.reason === 'ocr_source')).toBe(true)
  })

  it('stages nothing for another tax year', async () => {
    const { strategy } = await setUp()
    const res = await strategy.parse(USER, { taxYear: 2024, fileName: 'x.pdf', rawText: certificate('Muster Kemal'), textSource: 'pdf_text' } as never)
    expect(res.chLohnausweis).toMatchObject({ yearConflict: { documentYear: YEAR, activeYear: 2024 }, stagedActionIds: [] })
  })

  it('lets a model fill a Ziffer the rule could not read, shown only the Ziffer rows', async () => {
    const model = new RecordingModel(JSON.stringify({ quellensteuer: 4321, lohn: 5 }))
    const { strategy } = await setUp({ model })
    const res = await parse(strategy, certificate('Muster Kemal', 'vier 4321 x'))
    expect(model.seen).toHaveLength(1)
    for (const secret of ['Kemal', 'Muster', '756.1234', '01.02.1990', 'Beispielweg']) expect(model.seen[0]).not.toContain(secret)
    const qst = res.chLohnausweis?.fields.find((f) => f.field === 'quellensteuer')
    expect(qst).toMatchObject({ value: 4321, status: 'pruefen', reason: 'llm_suggested' })
    expect(res.chLohnausweis?.fields.find((f) => f.field === 'lohn')?.value).toBe(100000)
  })
})

describe('looksLikeChSalaryCertificate', () => {
  it('knows the form by its titles, not by a mention', () => {
    expect(looksLikeChSalaryCertificate(certificate('Muster Kemal'))).toBe(true)
    expect(looksLikeChSalaryCertificate('Rechnung: Kopie Lohnausweis angefordert, 20 CHF')).toBe(false)
  })
})
