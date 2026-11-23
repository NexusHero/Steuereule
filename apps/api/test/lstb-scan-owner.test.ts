// Escalation case (both spouses with a German employer first): an LStB uploaded in the chat is the
// user's, or Person B's when it names B; a name that fits nobody is asked about, never guessed.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { LstbScanParseStrategy } from '../src/lstb-scan/lstb-scan.parse-strategy.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { noSingleShotModel } from '../src/ki/single-shot-model.js'

const USER = 'user-a'
const YEAR = 2025

const offline: AiRuntimeConfigService = {
  async resolveLimits() {
    return DEFAULT_AI_TURN_LIMITS
  },
  async isKillSwitchActive() {
    return true
  },
  async resolveSlot(slot) {
    return { slot, enabled: false, provider: 'deterministic', model: 'deterministic-fallback', apiKey: null }
  },
}

const lstbOf = (name: string, gross: string) =>
  [
    'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025',
    name,
    '3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.   ' + gross,
    '4. Einbehaltene Lohnsteuer von 3.                         2.150,00',
    '23. a) Arbeitnehmeranteil zur gesetzlichen Rentenversicherung 1.953,00',
    '25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung 1.722,00',
    '26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung 315,00',
    '27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung 273,00',
  ].join('\n')

async function setup(joint: boolean) {
  const kit = buildAdvisorTestKit()
  await kit.profileRepo.upsert(USER, { firstName: 'Elias', lastName: 'Sommer', steuerId: null, steuernummer: null })
  if (joint) {
    await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
    await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Nora', lastName: 'Sommer' })
  }
  const audit = new AuditService(new FakeAuditRepository())
  const strategy = new LstbScanParseStrategy(new DocumentParseRegistry(), offline, kit.staging, audit, new LstbService(kit.lstbRepo, audit, new FakeMarkingRepository()), kit.linkService, noSingleShotModel)
  const parse = (rawText: string) => strategy.parse(USER, { taxYear: YEAR, kind: 'lstb', fileName: 'lstb.pdf', rawText, textSource: 'pdf_text' })
  return { kit, parse }
}

describe('whose LStB an upload in the chat is', () => {
  it('Person B’s, when it names B: the drafts write into B’s record', async () => {
    const { kit, parse } = await setup(true)
    const res = await parse(lstbOf('Nora Sommer', '21.000,00'))
    expect(res.lstb).toMatchObject({ person: 'B', personUnclear: false })
    expect(res.stagedAction?.person).toBe('B')
    await kit.service.applyBatch(USER, YEAR, { drafts: (res.lstb?.stagedActionIds ?? []).map((actionId) => ({ actionId })) })
    const spouse = await kit.linkService.dataUser(USER, YEAR, 'B')
    expect((await kit.lstbRepo.findForUserAndYear(spouse, YEAR))?.bruttoarbeitslohn).toBe('21000')
    expect(await kit.lstbRepo.findForUserAndYear(USER, YEAR)).toBeNull()
  })

  it('asks and drafts nothing when the name fits neither spouse', async () => {
    const { parse } = await setup(true)
    const res = await parse(lstbOf('Erika Fremd', '21.000,00'))
    expect(res.lstb).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
    expect(res.stagedAction).toBeNull()
  })

  it('the user’s own without a joint return, when it names them or carries no recognisable name', async () => {
    const { parse } = await setup(false)
    const named = await parse(lstbOf('Elias Sommer', '21.000,00'))
    expect(named.lstb).toMatchObject({ person: 'A', personUnclear: false })
    // The three values and the lines 23a, 25–27 and 24 (empty: 0).
    expect(named.lstb?.stagedActionIds).toHaveLength(8)
    expect((await parse(lstbOf('', '21.000,00'))).lstb).toMatchObject({ person: 'A', personUnclear: false })
  })

  it('asks instead of writing into the user’s record when, without a joint return, it names someone else (C2)', async () => {
    const { parse } = await setup(false)
    const res = await parse(lstbOf('Erika Fremd', '21.000,00'))
    expect(res.lstb).toMatchObject({ person: null, personUnclear: true, stagedActionIds: [] })
  })
})
