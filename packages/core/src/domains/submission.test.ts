import { describe, expect, it } from 'vitest'
import { canRecordSubmission, canWithdrawSubmission, declaredPersonPositions, filedPositions, submissionDateProblem, type SubmissionEstimate } from './submission'
import type { PersonYearFacts, WageFacts } from './year-history'

// ADR-0098 §8: the return the user filed himself (paper or ELSTER), frozen when he says so in the cockpit.

const wage = (gross: number, wageTax: number, socialSecurity: number): WageFacts => ({
  gross,
  wageTax,
  solidaritaetszuschlag: 0,
  churchTax: 0,
  socialSecurity,
  source: 'lohnsteuerbescheinigung',
  exchangeRate: null,
})
const person = (w: WageFacts | null, parts: PersonYearFacts['declaredWorkExpenses']): PersonYearFacts => ({ wage: w, declaredWorkExpenses: parts })

const ESTIMATE: SubmissionEstimate = {
  provision: { from: 17_800, to: 18_200 },
  specialExpenses: 72,
  taxableIncome: { from: 70_800, to: 71_200 },
  incomeTax: { from: 12_000, to: 12_150 },
  solidaritaetszuschlag: { from: 0, to: 0 },
  anrechnung: 12_979,
  result: { from: 829, to: 979 },
}

describe('submissionDateProblem', () => {
  it('accepts a real date after the tax year ended and not after today', () => {
    expect(submissionDateProblem('2026-03-01', 2025, '2026-11-18')).toBeNull()
    expect(submissionDateProblem('2026-01-01', 2025, '2026-11-18')).toBeNull()
    expect(submissionDateProblem('2026-11-18', 2025, '2026-11-18')).toBeNull()
  })

  it('rejects what is not an ISO date that exists', () => {
    expect(submissionDateProblem('01.03.2026', 2025, '2026-11-18')).toBe('format')
    expect(submissionDateProblem('2026-02-30', 2025, '2026-11-18')).toBe('format')
  })

  it('rejects a day in the future: the user tells what he did, not what he plans', () => {
    expect(submissionDateProblem('2026-11-19', 2025, '2026-11-18')).toBe('in-der-zukunft')
  })

  it('rejects a day before the tax year ended: a return is filed after the year', () => {
    expect(submissionDateProblem('2025-12-31', 2025, '2026-11-18')).toBe('vor-jahresende')
  })
})

describe('the submission states (ADR-0039)', () => {
  it('records a submission over a draft or an earlier submission, never over a Bescheid or an Eckjahr', () => {
    expect(canRecordSubmission('entwurf')).toBe(true)
    expect(canRecordSubmission('pruefung')).toBe(true)
    expect(canRecordSubmission('eingereicht')).toBe(true)
    expect(canRecordSubmission('rueckfrage')).toBe(true)
    expect(canRecordSubmission('bescheid')).toBe(false)
    expect(canRecordSubmission('abgeschlossen')).toBe(false)
    expect(canRecordSubmission('extern-erledigt')).toBe(false)
  })

  it('withdraws only a submitted year', () => {
    expect(canWithdrawSubmission('eingereicht')).toBe(true)
    expect(canWithdrawSubmission('rueckfrage')).toBe(true)
    expect(canWithdrawSubmission('entwurf')).toBe(false)
    expect(canWithdrawSubmission('bescheid')).toBe(false)
  })
})

describe('declaredPersonPositions', () => {
  it('keys the gross wage and the Werbungskosten parts by column, with their sum', () => {
    expect(declaredPersonPositions('B', person(wage(39_000, 4_490, 8_110), { fahrtweg: 1_050, homeoffice: 720, arbeitsmittel: 160, sonstiges: 0 }))).toEqual({
      bruttoarbeitslohnB: 39_000,
      fahrtwegB: 1_050,
      homeofficeB: 720,
      arbeitsmittelB: 160,
      sonstigeWerbungskostenB: 0,
      werbungskostenB: 1_930,
    })
  })

  it('leaves out what is not known, never a 0', () => {
    expect(declaredPersonPositions('A', person(null, null))).toEqual({})
  })
})

describe('filedPositions', () => {
  it('takes the facts as they are and the tax figures from the estimate, one value per range', () => {
    const positions = filedPositions({
      filingType: 'zusammen',
      people: {
        A: person(wage(54_900, 8_489, 11_420), { fahrtweg: 1_320, homeoffice: 1_260, arbeitsmittel: 380, sonstiges: 0 }),
        B: person(wage(39_000, 4_490, 8_110), { fahrtweg: 1_050, homeoffice: 720, arbeitsmittel: 160, sonstiges: 0 }),
      },
      estimate: ESTIMATE,
    })
    expect(positions).toEqual({
      bruttoarbeitslohnA: 54_900,
      fahrtwegA: 1_320,
      homeofficeA: 1_260,
      arbeitsmittelA: 380,
      sonstigeWerbungskostenA: 0,
      werbungskostenA: 2_960,
      bruttoarbeitslohnB: 39_000,
      fahrtwegB: 1_050,
      homeofficeB: 720,
      arbeitsmittelB: 160,
      sonstigeWerbungskostenB: 0,
      werbungskostenB: 1_930,
      vorsorgeaufwand: 18_000,
      sonderausgaben: 72,
      zuVersteuerndesEinkommen: 71_000,
      festgesetzteSteuer: 12_075,
      solidaritaetszuschlag: 0,
      anrechnung: 12_979,
      erstattung: 904,
    })
  })

  it('has no Person B column in a single return', () => {
    const positions = filedPositions({
      filingType: 'einzel',
      people: { A: person(wage(48_200, 7_457, 9_880), null), B: person(wage(1, 1, 1), null) },
      estimate: null,
    })
    expect(positions).toEqual({ bruttoarbeitslohnA: 48_200 })
  })

  it('without an estimate freezes only the facts: no tax figure is made up', () => {
    const positions = filedPositions({ filingType: 'einzel', people: { A: person(wage(48_200, 7_457, 9_880), null), B: null }, estimate: null })
    expect(positions.zuVersteuerndesEinkommen).toBeUndefined()
    expect(positions.erstattung).toBeUndefined()
  })

  it('credits the wage tax only: prepayments are no „Anrechnung“ of the Bescheid, whichever way the estimate carried them', () => {
    const breakdown = { persons: [{ workExpensesEur: 1_230, grossWageEur: 48_200, wageTaxEur: 7_457 }], householdReductionEur: 0 }
    // Carried inside the credit (business paths) and beside it (the other paths): the declared credit is the same.
    for (const anrechnung of [7_457 + 500, 7_457]) {
      const positions = filedPositions({
        filingType: 'einzel',
        people: { A: person(wage(48_200, 7_457, 9_880), null), B: null },
        estimate: { ...ESTIMATE, anrechnung, prepayments: 500, breakdown },
      })
      expect(positions.anrechnung).toBe(7_457)
    }
  })

  it('takes the wage of German and Swiss employers together and the Werbungskosten the estimate used', () => {
    const positions = filedPositions({
      filingType: 'einzel',
      // The facts know only one of the two certificates; the estimate counted both.
      people: { A: person(wage(20_000, 2_500, 4_000), { fahrtweg: 400, homeoffice: 0, arbeitsmittel: 0, sonstiges: 0 }), B: null },
      estimate: { ...ESTIMATE, breakdown: { persons: [{ workExpensesEur: 3_000, grossWageEur: 110_000, wageTaxEur: 6_500 }], householdReductionEur: 0 } },
    })
    expect(positions.bruttoarbeitslohnA).toBe(110_000)
    // The total includes what the parts do not carry: the lump sum and half the accident insurance premium.
    expect(positions.werbungskostenA).toBe(3_000)
    expect(positions.fahrtwegA).toBe(400)
    expect(positions.anrechnung).toBe(6_500)
  })

  it('declares § 35a once the estimate let it reduce the tax, and leaves it out otherwise', () => {
    const base = { filingType: 'einzel', people: { A: person(null, null), B: null } } as const
    expect(filedPositions({ ...base, estimate: { ...ESTIMATE, breakdown: { persons: [], householdReductionEur: 1_200 } } }).steuerermaessigung35a).toBe(1_200)
    expect(filedPositions({ ...base, estimate: { ...ESTIMATE, breakdown: { persons: [], householdReductionEur: 0 } } }).steuerermaessigung35a).toBeUndefined()
  })

  it('takes both spouses from the breakdown in a joint return', () => {
    const positions = filedPositions({
      filingType: 'zusammen',
      people: { A: person(null, null), B: person(null, null) },
      estimate: {
        ...ESTIMATE,
        breakdown: {
          persons: [
            { workExpensesEur: 1_230, grossWageEur: 82_000, wageTaxEur: 9_890 },
            { workExpensesEur: 1_230, grossWageEur: 48_000, wageTaxEur: 10_420 },
          ],
          householdReductionEur: 0,
        },
      },
    })
    expect(positions).toMatchObject({ bruttoarbeitslohnA: 82_000, werbungskostenA: 1_230, bruttoarbeitslohnB: 48_000, werbungskostenB: 1_230, anrechnung: 20_310 })
  })

  it('freezes the church tax only once it is known', () => {
    const withChurch = filedPositions({
      filingType: 'einzel',
      people: { A: person(wage(48_200, 7_457, 9_880), null), B: null },
      estimate: { ...ESTIMATE, churchTax: { kind: 'spanne', due: { from: 900, to: 1_000 }, withheld: 950, capOnApplication: false } },
    })
    expect(withChurch.kirchensteuer).toBe(950)
    const none = filedPositions({ filingType: 'einzel', people: { A: person(null, null), B: null }, estimate: { ...ESTIMATE, churchTax: { kind: 'none' } } })
    expect(none.kirchensteuer).toBe(0)
    const open = filedPositions({ filingType: 'einzel', people: { A: person(null, null), B: null }, estimate: { ...ESTIMATE, churchTax: { kind: 'offen', reason: 'konfession-fehlt' } } })
    expect(open.kirchensteuer).toBeUndefined()
  })

  it('keeps a Nachzahlung negative', () => {
    const positions = filedPositions({ filingType: 'einzel', people: { A: person(null, null), B: null }, estimate: { ...ESTIMATE, result: { from: -401, to: -301 } } })
    expect(positions.erstattung).toBe(-351)
  })
})
