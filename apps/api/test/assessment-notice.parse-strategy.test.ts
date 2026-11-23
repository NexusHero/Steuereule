// Reading the Steuerbescheid through the one upload pipeline (ADR-0097, ADR-0098 §4): the core reads the
// Besteuerungsgrundlagen, the owl stages them as drafts for the Bescheid's year (Zero-Write), and taking
// them over for a year without a declaration makes it an Eckjahr.
import { describe, expect, it } from 'vitest'
import { AssessmentNoticeParseStrategy } from '../src/assessment-scan/assessment-notice.parse-strategy.js'
import { AuditService } from '../src/audit/audit.service.js'
import { DocumentParseRegistry } from '../src/receipt/parse/document-parse.registry.js'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const USER = 'user-a'
const OPEN_YEAR = 2026

const notice = (year: number) =>
  [
    'Finanzamt Musterstadt                                     07.06.2022',
    `Bescheid für ${year} über Einkommensteuer, Solidaritätszuschlag und Kirchensteuer`,
    'festgesetzt werden                6.410,00 €       0,00 €       0,00 €',
    'Werbungskosten                    1.850',
    'zu versteuerndes Einkommen       39.120',
    'Erstattung                          280,00 €',
    'Erläuterungen',
    'Die Aufwendungen für Arbeitsmittel wurden gekürzt.',
  ].join('\n')

function setUp() {
  const kit = buildAdvisorTestKit()
  const strategy = new AssessmentNoticeParseStrategy(new DocumentParseRegistry(), kit.staging, new AuditService(new FakeAuditRepository()), kit.assessmentRepo)
  const parse = (rawText: string, extra: Record<string, unknown> = {}) =>
    strategy.parse(USER, { taxYear: OPEN_YEAR, fileName: 'bescheid.pdf', rawText, textSource: 'pdf_text', ...extra } as never)
  return { kit, parse }
}

describe('the Steuerbescheid reader', () => {
  it('stages the read positions as drafts for the year the Bescheid is for, not the open one', async () => {
    const { kit, parse } = setUp()
    const res = await parse(notice(2021))
    expect(res.draftsTaxYear).toBe(2021)
    const drafts = res.assistantMessage?.meta?.actions ?? []
    expect(drafts.map((d) => [d.screen, d.field, d.newValue])).toEqual([
      ['assessment', 'werbungskostenA', '1850'],
      ['assessment', 'zuVersteuerndesEinkommen', '39120'],
      ['assessment', 'festgesetzteSteuer', '6410'],
      ['assessment', 'solidaritaetszuschlag', '0'],
      ['assessment', 'kirchensteuer', '0'],
      ['assessment', 'erstattung', '280'],
      ['assessment', 'assessmentDate', '2022-06-07'],
      ['assessment', 'erlaeuterungen', 'Die Aufwendungen für Arbeitsmittel wurden gekürzt.'],
    ])
    // Zero-Write: nothing is in the Bescheid until the user takes the drafts over.
    expect(await kit.assessmentRepo.findForUserAndYear(USER, 2021)).toBeNull()
  })

  it('names what it could not read instead of staging 0', async () => {
    const { parse } = setUp()
    const res = await parse(notice(2021))
    expect(res.assessmentNotice?.notRead).toContain('sonderausgaben')
    expect(res.assessmentNotice?.read).not.toContain('sonderausgaben')
    expect((res.assistantMessage?.meta?.actions ?? []).some((d) => d.field === 'sonderausgaben')).toBe(false)
  })

  it('says when taking it over creates an Eckjahr, and creates it on apply', async () => {
    const { kit, parse } = setUp()
    const res = await parse(notice(2021))
    expect(res.assessmentNotice?.createsEckjahr).toBe(true)
    expect(res.assistantMessage?.content).toContain('extern erledigt')
    await kit.service.applyBatch(USER, 2021, { drafts: (res.assistantMessage?.meta?.actions ?? []).map((d) => ({ actionId: d.actionId })) })
    expect(kit.assessmentRepo.externalYears.has(`${USER}::2021`)).toBe(true)
    expect((await kit.assessmentRepo.findForUserAndYear(USER, 2021))?.fields.erstattung).toBe('280')
  })

  it('offers a scanned Bescheid to be checked', async () => {
    const { parse } = setUp()
    const res = await parse(notice(2021), { textSource: 'ocr' })
    expect((res.assistantMessage?.meta?.actions ?? []).every((d) => d.confidenceStatus === 'pruefen')).toBe(true)
  })
})
