// Real-case 2024: the user's own certificate showed the spouse's Ziffern 3, 7 and 13 afterwards.
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ChCertificateScanParseStrategy } from '../src/ch-certificate-scan/ch-certificate-scan.parse-strategy.js'
import { DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const USER = 'user-a'
const YEAR = 2024
const runtime: AiRuntimeConfigService = {
  resolveLimits: async () => DEFAULT_AI_TURN_LIMITS,
  isKillSwitchActive: async () => true,
  resolveSlot: async (slot) => ({ slot, enabled: false, provider: 'deterministic', model: 'x', apiKey: null }),
}
const cert = (holder: string, lines: string[]) =>
  ['A X Lohnausweis - Certificat de salaire', `D ${YEAR} E 01.01.${YEAR} 31.12.${YEAR}`, 'H', holder, ...lines, '15. Bemerkungen'].join('\n')

describe('two certificates of a couple', () => {
  it('writes the spouse’s Ziffern only into her record, also those the user’s certificate lacks', async () => {
    const kit = buildAdvisorTestKit()
    await kit.profileRepo.upsert(USER, { firstName: 'Kemal', lastName: 'Muster', steuerId: null, steuernummer: null })
    await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
    await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Anna', lastName: 'Muster' })
    const strategy = new ChCertificateScanParseStrategy(new DocumentParseRegistry(), runtime, kit.service, new AuditService(new FakeAuditRepository()), kit.linkService)
    const apply = async (res: Awaited<ReturnType<typeof strategy.parse>>) =>
      kit.service.applyBatch(USER, YEAR, { drafts: (res.assistantMessage?.meta?.actions ?? []).map((a) => ({ actionId: a.actionId })) })

    await apply(await strategy.parse(USER, { taxYear: YEAR, fileName: 'a.pdf', textSource: 'pdf_text', rawText: cert('Muster Kemal', ['1. Lohn 19.900', '8 Bruttolohn total = 19.900', '9. Beiträge AHV - 1.347', '10 Berufliche Vorsorge - 1.181', '11. Nettolohn = 17.372', '12. Quellensteuerabzug 896']) } as never))
    await apply(await strategy.parse(USER, { taxYear: YEAR, fileName: 'b.pdf', textSource: 'pdf_text', rawText: cert('Muster Anna', ['1. Lohn 99.784', '3. Unregelmässige Leistungen + 2.099', '7. Andere Leistungen + 853', '8 Bruttolohn total = 102.736', '9. Beiträge AHV - 5.205', '10 Berufliche Vorsorge - 4.316', '11. Nettolohn = 93.215', '12. Quellensteuerabzug 4.623', '13. Spesenvergütungen 25']) } as never))

    const own = await kit.chRepo.findForUserAndYear(USER, YEAR)
    const spouse = await kit.chRepo.findForUserAndYear(await kit.linkService.dataUser(USER, YEAR, 'B'), YEAR)
    expect(own?.fields['unregelmaessige-leistungen'] ?? null).toBeNull()
    expect(own?.fields['andere-leistungen'] ?? null).toBeNull()
    expect(own?.fields.lohn).toBe('19900')
    expect(spouse?.fields['unregelmaessige-leistungen']).toBe('2099')
  })
})
