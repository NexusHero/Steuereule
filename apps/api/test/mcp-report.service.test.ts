import { describe, expect, it, vi } from 'vitest'
import { McpReportService } from '../src/mcp/mcp-report.service.js'
import { passThroughTransactionRunner, type TransactionRunner } from '../src/common/transaction-runner.js'
import { PrismaTransactionRunner } from '../src/prisma/transaction.js'

const computed = (from: number, to: number) => ({
  kind: 'spanne' as const,
  result: { from, to },
  werbungskosten: 0,
  provision: { from: 0, to: 0 },
  specialExpenses: 0,
  taxableIncome: { from: 0, to: 0 },
  incomeTax: { from: 0, to: 0 },
  solidaritaetszuschlag: { from: 0, to: 0 },
  anrechnung: 0,
  churchTaxOpen: false,
})

/** The Prisma runner over a client stub: the only runner the simulation trusts to roll back. */
const rollingBack: TransactionRunner = new PrismaTransactionRunner({ $transaction: async (work) => work({}) })

function service(overrides: { estimate?: unknown; printout?: unknown; confirmation?: unknown; interview?: unknown; assessment?: unknown; transactions?: TransactionRunner } = {}) {
  const estimate = overrides.estimate ?? { getState: vi.fn().mockResolvedValue(computed(100, 100)) }
  const printout = overrides.printout ?? { check: vi.fn().mockResolvedValue({ missing: [] }) }
  const confirmation = overrides.confirmation ?? { overview: vi.fn().mockResolvedValue({ annexes: [] }), writeConfirmedByAdvisor: vi.fn(), readRawValues: vi.fn().mockResolvedValue({ 'stammdaten.kirchensteuerpflichtig': 'false' }) }
  const interview = overrides.interview ?? { getState: vi.fn().mockResolvedValue({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 }) }
  const assessment = overrides.assessment ?? { getState: vi.fn() }
  return new McpReportService(estimate as never, printout as never, confirmation as never, interview as never, assessment as never, overrides.transactions ?? rollingBack)
}

describe('McpReportService (ADR-0052 amendment 2)', () => {
  it('a printout check that fails is no "ready to print" and no go-ahead to pay', async () => {
    const report = await service({ printout: { check: vi.fn().mockRejectedValue(new Error('no forms')) } }).report('u', 2025)
    expect(report.printout.ready).toBe(false)
    expect(report.nextSteps.join(' ')).not.toContain('zahllink_anfordern')
  })

  it('names the go-ahead only when the printout is checked, everything is confirmed and the interview is done', async () => {
    const report = await service().report('u', 2025)
    expect(report.printout.ready).toBe(true)
    expect(report.nextSteps.join(' ')).toContain('zahllink_anfordern')
  })

  it('never simulates without a real transaction: the write would stay', async () => {
    const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn() }
    const result = await service({ confirmation, transactions: passThroughTransactionRunner }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result.ok).toBe(false)
    expect(confirmation.writeConfirmedByAdvisor).not.toHaveBeenCalled()
  })

  it('computes the delta between the estimate before and after the entry', async () => {
    const estimate = { getState: vi.fn().mockResolvedValueOnce(computed(100, 100)).mockResolvedValueOnce(computed(250, 250)) }
    const result = await service({ estimate }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result).toEqual({ ok: true, beforeRefundEur: 100, afterRefundEur: 250, deltaEur: 150 })
  })

  it('does not hand an internal error message to the external assistant', async () => {
    const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn().mockRejectedValue(new Error('PrismaClientKnownRequestError: relation "Lstb" at db-internal:5432')) }
    const result = await service({ confirmation }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('Prisma')
    expect(JSON.stringify(result)).not.toContain('db-internal')
  })

  it('openQuestions names the next interview question with its answers, and nothing once the interview is done', async () => {
    const open = { getState: vi.fn(async (_u: string, _y: number, entry?: string) => (entry === 'minimal-gate' ? { answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 } : { answers: {}, nextStep: { kind: 'done' }, openItems: 0 })) }
    const result = await service({ interview: open }).openQuestions('u', 2025)
    expect(result.openQuestions).toBe(3)
    expect(result.next?.id).toBe('job')
    expect(result.next?.answers).toContain('Angestellt')
    expect((await service().openQuestions('u', 2025)).next).toBeNull()
  })

  it('a report with open questions, gaps and unconfirmed annexes names each next step and no go-ahead', async () => {
    const report = await service({
      estimate: { getState: vi.fn().mockRejectedValue(new Error('down')) },
      printout: { check: vi.fn().mockResolvedValue({ missing: ['kapital'] }) },
      confirmation: { readRawValues: vi.fn().mockResolvedValue({ 'stammdaten.kirchensteuerpflichtig': 'false' }), overview: vi.fn().mockResolvedValue({ annexes: [{ annex: 'N', unconfirmed: 2 }, { annex: 'KAP', unconfirmed: 0 }] }) },
      interview: { getState: vi.fn().mockResolvedValue({ answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 1 }) },
    }).report('u', 2025)
    expect(report.estimate).toEqual({ kind: 'unavailable' })
    expect(report.unconfirmed).toEqual([{ annex: 'N', count: 2 }])
    expect(report.printout).toMatchObject({ checked: true, ready: false })
    expect(report.nextSteps).toHaveLength(3)
    expect(report.nextSteps.join(' ')).not.toContain('zahllink_anfordern')
  })

  it('says why there is no delta when the estimate becomes possible only now, or not yet', async () => {
    const open = { kind: 'offen' as const, missing: ['lstb'] }
    const firstTime = { getState: vi.fn().mockResolvedValueOnce(open).mockResolvedValueOnce(computed(100, 100)) }
    const notYet = { getState: vi.fn().mockResolvedValue(open) }
    const first = await service({ estimate: firstTime }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    const later = await service({ estimate: notYet }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(first).toMatchObject({ ok: false, reason: expect.stringContaining('erstmals') })
    expect(later).toMatchObject({ ok: false, reason: expect.stringContaining('vollständig') })
  })

  it('never simulates inside a transaction that is already running: the rollback would not reach its commit', async () => {
    const outer = new PrismaTransactionRunner({ $transaction: async (work) => work({}) })
    const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn() }
    const result = await outer.run(() => service({ confirmation, transactions: outer }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000'))
    expect(result.ok).toBe(false)
    expect(confirmation.writeConfirmedByAdvisor).not.toHaveBeenCalled()
  })

  it('trusts only a runner that rolls back, never one that does not say so', async () => {
    const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn() }
    const unknown: TransactionRunner = { run: (work) => work(), rollsBack: false, isActive: () => false }
    const result = await service({ confirmation, transactions: unknown }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result.ok).toBe(false)
    expect(confirmation.writeConfirmedByAdvisor).not.toHaveBeenCalled()
  })

  it('openQuestions walks every interview area, not only the basic questions', async () => {
    const byEntry: Record<string, unknown> = {
      'minimal-gate': { answers: {}, nextStep: { kind: 'done' }, openItems: 0 },
      sonderausgaben: { answers: {}, nextStep: { kind: 'question', id: 'spenden' }, openItems: 5 },
      vorauszahlungen: { answers: {}, nextStep: { kind: 'question', id: 'vorauszahlungen-gate' }, openItems: 1 },
    }
    const interview = { getState: vi.fn(async (_u: string, _y: number, entry?: string) => byEntry[entry ?? 'minimal-gate'] ?? { answers: {}, nextStep: { kind: 'done' }, openItems: 0 }) }
    const result = await service({ interview }).openQuestions('u', 2024)
    expect(result.openQuestions).toBe(6)
    expect(result.next?.id).toBe('spenden')
    expect(result.bereiche.map((b) => b.bereich)).toEqual(['sonderausgaben', 'vorauszahlungen'])
    expect(result.bereiche[0]).toMatchObject({ offen: 5, naechste: { id: 'spenden', answers: ['Ja', 'Nein'] } })
  })

  it('openQuestions does not ask a married couple the questions for single parents (§ 24b EStG)', async () => {
    const interview = { getState: vi.fn(async (_u: string, _y: number, entry?: string) => (entry === 'alleinerziehend' ? { answers: { familienstand: 'Verheiratet' }, nextStep: { kind: 'question', id: 'ae-weitere-person' }, openItems: 2 } : { answers: { familienstand: 'Verheiratet' }, nextStep: { kind: 'done' }, openItems: 0 })) }
    const result = await service({ interview }).openQuestions('u', 2024)
    expect(result.bereiche).toEqual([])
    expect(result.openQuestions).toBe(0)
  })

  describe('breakdown (#545)', () => {
    const withBreakdown = {
      ...computed(-3677.49, -3677.49),
      werbungskosten: 3371,
      provision: { from: 27029, to: 27029 },
      specialExpenses: 3909,
      taxableIncome: { from: 173018, to: 173018 },
      incomeTax: { from: 53364, to: 53364 },
      solidaritaetszuschlag: { from: 1667.49, to: 1667.49 },
      anrechnung: 24603,
      prepayments: 26751,
      breakdown: {
        persons: [{ incomeEur: 90000, workExpensesEur: 1230, creditedTaxEur: 19770 }, { incomeEur: 105000, workExpensesEur: 2141, creditedTaxEur: 4833 }],
        totalIncomeEur: 195000,
        extraordinaryBurdenEur: 0,
        childAllowance: { allowanceEur: 9540, childBenefitEur: 3000, used: true },
        tariffTax: { from: 51394, to: 51394 },
        householdReductionEur: 1200,
        capitalFlatTaxEur: 170,
      },
    }

    it('lays out the way from the income to the result in the app’s own figures', async () => {
      const result = await service({ estimate: { getState: vi.fn().mockResolvedValue(withBreakdown) } }).breakdown('u', 2024)
      expect(result).toMatchObject({
        ok: true,
        personen: [{ person: 'A', einkuenfteEur: 90000, werbungskostenEur: 1230 }, { person: 'B', einkuenfteEur: 105000 }],
        summeDerEinkuenfteEur: 195000,
        zuVersteuerndesEinkommenEur: 173018,
        tariflicheEinkommensteuerEur: 51394,
        steuerermaessigung35aEur: 1200,
        hinzugerechnetesKindergeldEur: 3000,
        abgeltungsteuerEur: 170,
        einkommensteuerEur: 53364,
        vorauszahlungenEur: 26751,
        ergebnisEur: -3677.49,
      })
    })

    it('says what is missing while there is no estimate yet', async () => {
      const result = await service({ estimate: { getState: vi.fn().mockResolvedValue({ kind: 'offen', missing: ['lstb'] }) } }).breakdown('u', 2024)
      expect(result).toEqual({ ok: false, grund: 'offen', fehlt: ['lstb'] })
    })
  })

  describe('church tax in the report (#543)', () => {
    const withMasterData = (values: Record<string, string | null>) => ({ overview: vi.fn().mockResolvedValue({ annexes: [] }), writeConfirmedByAdvisor: vi.fn(), readRawValues: vi.fn().mockResolvedValue(values) })

    it('asks for the yes/no while nothing is known', async () => {
      const report = await service({ confirmation: withMasterData({ 'stammdaten.religion': null, 'stammdaten.kirchensteuerpflichtig': null }) }).report('u', 2024)
      expect(report.nextSteps.join(' ')).toContain('stammdaten.kirchensteuerpflichtig')
    })

    it('names the missing confession of a liable person as the user’s task', async () => {
      const report = await service({ confirmation: withMasterData({ 'stammdaten.religion': null, 'stammdaten.kirchensteuerpflichtig': 'true' }) }).report('u', 2024)
      expect(report.nextSteps.join(' ')).toContain('Konfession fehlt')
    })

    it('says that the user’s confession wins when it contradicts the yes/no', async () => {
      const report = await service({ confirmation: withMasterData({ 'stammdaten.religion': 'RK', 'stammdaten.kirchensteuerpflichtig': 'false' }) }).report('u', 2024)
      expect(report.nextSteps.join(' ')).toContain('widerspricht')
    })

    it('is silent when the yes/no is set and nothing contradicts it', async () => {
      const report = await service({ confirmation: withMasterData({ 'stammdaten.religion': null, 'stammdaten.kirchensteuerpflichtig': 'false' }) }).report('u', 2024)
      expect(report.nextSteps.join(' ')).not.toContain('irchensteuer')
    })
  })

  describe('comparing a notice with the submitted return (#546)', () => {
    const row = (position: string, declared: number | null, assessed: number | null, role: 'own' | 'followOn' = 'own') => ({
      position,
      label: position,
      role,
      person: null,
      declared,
      assessed,
      difference: declared === null || assessed === null ? null : assessed - declared,
      status: declared === null || assessed === null ? 'not_read' : declared === assessed ? 'same' : 'deviation',
      explanation: 'Erläuterung des Finanzamts mit Freitext',
      shortReason: 'kurz',
    })
    const diff = {
      year: 2024,
      filingType: 'zusammen',
      groups: [
        { group: 'vorsorge', rows: [row('vorsorgeaufwand', 27029, 26785)] },
        { group: 'werbungskostenB', rows: [row('werbungskostenB', 2141, 2047)] },
        { group: 'steuer', rows: [row('erstattung', -3677, -4060, 'followOn')] },
      ],
      ownDeviations: [{ ...row('vorsorgeaufwand', 27029, 26785), refundEffect: -120 }, { ...row('werbungskostenB', 2141, 2047), refundEffect: -40 }],
      followOnChain: [],
      totalRefundEffect: -383,
      singleEffectsSum: -160,
      effectsDifferFromTotal: true,
      generalExplanations: ['Freitext'],
      counts: { positions: 3, same: 0, deviations: 2, notRead: 0 },
    }
    const state = (over: Record<string, unknown> = {}) => ({
      positions: [{ id: 'erstattung', kind: 'erfasst', value: -4060 }],
      assessmentDate: '2026-10-26',
      frist: { assessmentDate: '2026-10-26', deadlineEnd: '2026-11-26', remainingDays: 6, running: true },
      diff,
      ...over,
    })
    const compare = (assessmentState: unknown) => service({ assessment: { getState: vi.fn().mockResolvedValue(assessmentState) } }).compareAssessment('u', 2024)

    it('takes each position from the diff against the submitted version, with the effect on the refund', async () => {
      const result = await compare(state())
      expect(result.ok).toBe(true)
      const rows = Object.fromEntries((result.positionen as { position: string }[]).map((r) => [r.position, r]))
      expect(rows.vorsorgeaufwand).toMatchObject({ erklaerungEur: 27029, bescheidEur: 26785, abweichungEur: -244, wirkungAufErstattungEur: -120 })
      expect(rows.werbungskostenB).toMatchObject({ erklaerungEur: 2141, bescheidEur: 2047, abweichungEur: -94, wirkungAufErstattungEur: -40 })
      expect(rows.erstattung).toMatchObject({ erklaerungEur: -3677, bescheidEur: -4060, abweichungEur: -383 })
      expect(rows.erstattung).not.toHaveProperty('wirkungAufErstattungEur')
      expect(result.gesamtwirkungAufErstattungEur).toBe(-383)
      expect(result.wirkungenSummierenSichNicht).toBe(true)
    })

    it('keeps the appeal deadline of the notice', async () => {
      const result = await compare(state())
      expect(result.einspruchsfrist).toEqual({ bescheidVom: '2026-10-26', endetAm: '2026-11-26', verbleibendeTage: 6, laeuft: true })
    })

    it('never passes the free text of the notice on (ADR-0052 amendment 3, 5)', async () => {
      expect(JSON.stringify(await compare(state()))).not.toContain('Freitext')
    })

    it('says that no notice is entered', async () => {
      const result = await compare(state({ diff: null, positions: [{ id: 'erstattung', kind: 'offen' }], assessmentDate: null }))
      expect(result).toMatchObject({ ok: false })
      expect(result.grund).toContain('kein Bescheid')
    })

    it('says that there is no submitted version to compare against, instead of comparing with the live estimate', async () => {
      const result = await compare(state({ diff: null }))
      expect(result).toMatchObject({ ok: false })
      expect(result.grund).toContain('abgegeben')
    })
  })

  describe('check: what closes each gap of the printout (#547)', () => {
    it('names the field, the person or child and who has to act, with the child’s instance', async () => {
      const printout = { check: vi.fn().mockResolvedValue({ missing: ['kinder'] }) }
      const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn(), readRawValues: vi.fn().mockResolvedValue({}) }
      const result = await service({ printout, confirmation }).check('u', 2024, { spouse: null, childIds: ['kind-uuid-1'] })
      const fragen = result.fragen as { betrifft: string; instance?: string; screen: string; werTraegtEin: string }[]
      expect(fragen.length).toBeGreaterThan(0)
      expect(fragen.every((q) => q.screen !== 'kind' || q.instance === 'kind-uuid-1')).toBe(true)
      expect(fragen.some((q) => q.werTraegtEin === 'du')).toBe(true)
      expect(JSON.stringify(result)).not.toContain('keywords')
    })

    it('asks where a daily benefit recorded before the question came from, with the AHV hint (ADR-0072, Punkt 5)', async () => {
      const values: Record<string, string> = { 'chLohnausweis.bruttolohn-total': '90000', 'chLohnausweis.ahv-beitraege': '5380', 'chLohnausweis.steuerfreiesKrankentaggeldChf': '6000', 'interview.einkuenfte': 'Nein', 'interview.vorauszahlungen-gate': 'Nein' }
      const confirmation = {
        overview: vi.fn(),
        writeConfirmedByAdvisor: vi.fn(),
        readRawValues: vi.fn(async (_user: string, _year: number, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, values[key] ?? null]))),
      }
      const result = await service({ printout: { check: vi.fn().mockResolvedValue({ missing: [] }) }, confirmation }).check('u', 2025, { spouse: null, childIds: [] })
      const fragen = result.fragen as { screen: string; feld: string; frage: string; werTraegtEin: string }[]
      const source = fragen.find((q) => q.feld === 'taggeldQuelle')
      expect(source).toMatchObject({ screen: 'chLohnausweis', werTraegtEin: 'du' })
      expect(source!.frage).toContain('Woher kam das Taggeld im Bruttolohn (Ziffer 8)')
      expect(source!.frage).toContain('Lohnfortzahlung des Arbeitgebers ohne Versicherung')
      expect(source!.frage).toContain('Hinweis zur Plausibilität (keine Entscheidung)')
      expect(source!.frage).toContain('ohne das Taggeld')
    })

    it('lists what no entry closes (a confirmation, a form the app does not print)', async () => {
      const printout = { check: vi.fn().mockResolvedValue({ missing: ['unbestaetigt.anlageN'] }) }
      const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn(), readRawValues: vi.fn().mockResolvedValue({}) }
      const result = await service({ printout, confirmation }).check('u', 2024, { spouse: null, childIds: [] })
      expect(result.nurNutzer).toEqual([expect.stringContaining('unbestaetigt.anlageN')])
    })
  })
})
