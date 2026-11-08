import { describe, it, expect } from 'vitest'
import {
  ENTRIES,
  JOB_VALUES,
  FOREIGN_VALUES,
  KINDER_VALUES,
  MARITAL_STATUS_VALUES,
  isValidAnswer,
  nextStepFor,
  remainingStepsFor,
  incomeTax,
  splittingTariff,
  calculateWorkdays,
  type Answers,
} from '../index'

describe('Exhaustive Matrix & Fuzzing Suite', () => {
  describe('Interview Minimal-Gate: All 144 Permutations', () => {
    it('exhaustively navigates all 144 combinations of (job x ausland x kinder x familienstand) without crashing or looping', () => {
      const minimalGate = ENTRIES['minimal-gate']
      let totalCombinations = 0
      let terminalGatesCount = 0
      let completedCount = 0

      for (const job of JOB_VALUES) {
        for (const ausland of FOREIGN_VALUES) {
          for (const kinder of KINDER_VALUES) {
            for (const status of MARITAL_STATUS_VALUES) {
              totalCombinations++
              const answers: Answers = {}

              // 1. Initial step must be job
              let step = nextStepFor(minimalGate, answers)
              expect(step).toEqual({ kind: 'question', id: 'job' })
              expect(remainingStepsFor(minimalGate, answers)).toBeGreaterThan(0)

              // Answer job
              answers.job = job
              step = nextStepFor(minimalGate, answers)

              // If Selbstständig -> terminal gate
              if (job === 'Selbstständig') {
                expect(step).toEqual({ kind: 'gate', id: 'gewerbe' })
                terminalGatesCount++
                continue
              }

              // If Beides -> passable gate, acknowledge it
              if (job === 'Beides') {
                expect(step).toEqual({ kind: 'gate', id: 'gewerbe' })
                answers.gewerbe = 'weiter'
                step = nextStepFor(minimalGate, answers)
              }

              // Next must be ausland
              expect(step).toEqual({ kind: 'question', id: 'ausland' })
              answers.ausland = ausland
              step = nextStepFor(minimalGate, answers)

              // If In ein anderes Land -> ch-only gate
              if (ausland === 'In ein anderes Land') {
                expect(step).toEqual({ kind: 'gate', id: 'ch-only' })
                answers['ch-only'] = 'weiter'
                step = nextStepFor(minimalGate, answers)
              }

              // Next must be kinder
              expect(step).toEqual({ kind: 'question', id: 'kinder' })
              answers.kinder = kinder
              step = nextStepFor(minimalGate, answers)

              // Next must be familienstand
              expect(step).toEqual({ kind: 'question', id: 'familienstand' })
              answers.familienstand = status
              step = nextStepFor(minimalGate, answers)

              // Must be done!
              expect(step).toEqual({ kind: 'done' })
              expect(remainingStepsFor(minimalGate, answers)).toBe(0)
              completedCount++
            }
          }
        }
      }

      // Assert complete combinatorial counts
      expect(totalCombinations).toBe(144)
      // Selbstständig has 3 ausland x 3 kinder x 4 status = 36 terminal paths
      expect(terminalGatesCount).toBe(36)
      // Remaining 3 jobs (Angestellt, Beides, Rente) x 36 = 108 completed paths
      expect(completedCount).toBe(108)
    })
  })

  describe('Catalogue Permutations & Reachability', () => {
    it('verifies all 32 subsets of Lebenslagen questions with both Ja and Nein branches', () => {
      const entry = ENTRIES.lebenslagen
      const steps = ['dhf', 'umzug', 'abfindung', 'lohnersatz', 'nebenjob'] as const

      // Generate all 2^5 combinations (0 = Nein, 1 = Ja)
      for (let mask = 0; mask < 32; mask++) {
        const answers: Answers = {}
        for (const [i, stepKey] of steps.entries()) {
          const isJa = Boolean(mask & (1 << i))

          const step = nextStepFor(entry, answers)
          expect(step).toEqual({ kind: 'question', id: stepKey })

          if (isJa) {
            answers[stepKey] = 'Ja'
            // Should prompt for follow-up amount
            const followUpStep = nextStepFor(entry, answers)
            if (stepKey === 'dhf') {
              expect(followUpStep).toEqual({ kind: 'question', id: 'dhf-miete' })
              answers['dhf-miete'] = '800'
            } else if (stepKey === 'umzug') {
              expect(followUpStep).toEqual({ kind: 'question', id: 'umzug-kosten' })
              answers['umzug-kosten'] = '2500'
            } else if (stepKey === 'abfindung') {
              expect(followUpStep).toEqual({ kind: 'question', id: 'abfindung-betrag' })
              answers['abfindung-betrag'] = '15000'
            } else if (stepKey === 'lohnersatz') {
              expect(followUpStep).toEqual({ kind: 'question', id: 'lohnersatz-betrag' })
              answers['lohnersatz-betrag'] = '6000'
            } else if (stepKey === 'nebenjob') {
              // nebenjob form is an enum ('Minijob' or 'Nebenjob')
              answers.nebenjob = 'Nebenjob'
              const sideJobStep = nextStepFor(entry, answers)
              expect(sideJobStep).toEqual({ kind: 'question', id: 'nebenjob-brutto' })
              answers['nebenjob-brutto'] = '450'
            }
          } else {
            answers[stepKey] = stepKey === 'nebenjob' ? 'Nein' : 'Nein'
          }
        }

        const finalStep = nextStepFor(entry, answers)
        expect(finalStep).toEqual({ kind: 'done' })
        expect(remainingStepsFor(entry, answers)).toBe(0)
      }
    })

    it('validates boundaries on input validators', () => {
      // dhf-miete min 0, max 10000
      expect(isValidAnswer('dhf-miete', '0')).toBe(true)
      expect(isValidAnswer('dhf-miete', '10000')).toBe(true)
      expect(isValidAnswer('dhf-miete', '-1')).toBe(false)
      expect(isValidAnswer('dhf-miete', '10001')).toBe(false)
      expect(isValidAnswer('dhf-miete', 'abc')).toBe(false)

      // umzug-kosten min 0, max 100000
      expect(isValidAnswer('umzug-kosten', '100000')).toBe(true)
      expect(isValidAnswer('umzug-kosten', '100001')).toBe(false)
      expect(isValidAnswer('umzug-kosten', '-50')).toBe(false)

      // abfindung-betrag min 0, max 1000000
      expect(isValidAnswer('abfindung-betrag', '1000000')).toBe(true)
      expect(isValidAnswer('abfindung-betrag', '1000001')).toBe(false)
    })
  })

  describe('Tax Engine & Mathematical Edge-Cases', () => {
    it('handles boundary taxable income values from 0 to 100,000,000 € without NaN or negative tax', () => {
      const boundaryValues = [0, 1, 10_000, 11_604, 11_784, 17_005, 66_760, 277_825, 1_000_000, 100_000_000]

      for (const zve of boundaryValues) {
        const grundtarif = incomeTax(zve, 2026)
        const splittingtarif = splittingTariff(zve, 0, 2026)

        expect(Number.isFinite(grundtarif)).toBe(true)
        expect(Number.isFinite(splittingtarif)).toBe(true)
        expect(grundtarif).toBeGreaterThanOrEqual(0)
        expect(splittingtarif).toBeGreaterThanOrEqual(0)

        // Splittingtarif must be <= Grundtarif for any non-negative income
        expect(splittingtarif).toBeLessThanOrEqual(grundtarif)
      }
    })

    it('detects workdays and absence contradictions', () => {
      // 5 weekdays (Mon-Fri) in 2026 = ~261 potential workdays
      const workdays = [1, 2, 3, 4, 5] as const
      const normalResult = calculateWorkdays({
        year: 2026,
        workdays,
        publicHolidays: 10,
        vacationDays: 30,
        sickDays: 5,
        homeOfficeDays: 20,
      })

      expect(normalResult.kind).toBe('bestimmt')
      if (normalResult.kind === 'bestimmt') {
        expect(normalResult.workdays).toBeGreaterThan(0)
        expect(normalResult.commuteDays).toBeGreaterThan(0)
      }

      // Impossible combination: 200 vacation + 100 sick days on 250 workdays -> contradiction
      const contradictionResult = calculateWorkdays({
        year: 2026,
        workdays,
        publicHolidays: 10,
        vacationDays: 200,
        sickDays: 100,
        homeOfficeDays: 0,
      })

      expect(contradictionResult.kind).toBe('widerspruch')
    })
  })
})
