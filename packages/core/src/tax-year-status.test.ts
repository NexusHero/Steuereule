import { describe, expect, it } from 'vitest'
import {
  isAssessmentTransitionAllowed,
  isTransitionAllowed,
  nextAssessmentStates,
  nextStates,
  type AssessmentStatus,
  type TaxYearStatus,
} from './tax-year-status'

// ADR-018 — the lifecycle state machine. The two REAL edge states (rueckfrage,
// extern-erledigt) are what this suite exists to pin down: they must be genuine states
// with genuine transitions, not badges. The two NON-states (technical failure, missed
// deadline) are asserted by their ABSENCE from the transition table.

describe('the ADR-018 main flow (Entwurf → Prüfung → Eingereicht → Bescheid → Abgeschlossen)', () => {
  const happyPath: readonly [TaxYearStatus, TaxYearStatus][] = [
    ['entwurf', 'pruefung'],
    ['pruefung', 'eingereicht'],
    ['eingereicht', 'bescheid'],
    ['bescheid', 'abgeschlossen'],
  ]

  it.each(happyPath)('%s → %s is legal', (from, after) => {
    expect(isTransitionAllowed(from, after)).toBe(true)
  })
})

describe('rueckfrage — a REAL state between eingereicht and bescheid, reachable in both directions', () => {
  it('eingereicht → rueckfrage is legal (Finanzamt requests documents)', () => {
    expect(isTransitionAllowed('eingereicht', 'rueckfrage')).toBe(true)
  })

  it('rueckfrage ⇄ eingereicht: resolving the request returns to eingereicht', () => {
    expect(isTransitionAllowed('rueckfrage', 'eingereicht')).toBe(true)
  })

  it('rueckfrage → bescheid is legal (the request resolves straight into a Bescheid)', () => {
    expect(isTransitionAllowed('rueckfrage', 'bescheid')).toBe(true)
  })
})

describe('extern-erledigt — a REAL parallel exit (ADR-018: archive, not a dead end)', () => {
  it('is reachable from entwurf and pruefung', () => {
    expect(isTransitionAllowed('entwurf', 'extern-erledigt')).toBe(true)
    expect(isTransitionAllowed('pruefung', 'extern-erledigt')).toBe(true)
  })

  it('is NOT reachable once eingereicht — you cannot file via us AND mark it externally done', () => {
    expect(isTransitionAllowed('eingereicht', 'extern-erledigt')).toBe(false)
  })

  it('is terminal', () => {
    expect(nextStates('extern-erledigt')).toEqual([])
  })
})

describe('the two NON-states stay non-states (ADR-018)', () => {
  it('a technical submission failure is NOT a state: pruefung has no "failed" successor', () => {
    // The failed attempt stays 'pruefung' + a toast; it is not representable as a state,
    // so no transition may ever carry it into one.
    for (const after of nextStates('pruefung')) {
      expect(after).not.toContain('failed')
    }
    expect(nextStates('pruefung')).toEqual(['eingereicht', 'entwurf', 'extern-erledigt'])
  })

  it('a missed deadline is NOT a state: entwurf has no "verspätet" successor', () => {
    // The missed deadline stays 'entwurf' + a warning banner; it is not a state.
    expect(nextStates('entwurf')).toEqual(['pruefung', 'extern-erledigt'])
  })
})

describe('editing is allowed: pruefung can return to entwurf', () => {
  it('pruefung → entwurf is legal (the user reopens a draft to fix something)', () => {
    expect(isTransitionAllowed('pruefung', 'entwurf')).toBe(true)
  })
})

describe('terminal states admit nothing further', () => {
  it.each(['abgeschlossen', 'extern-erledigt'] as const)('%s is terminal', (from) => {
    expect(nextStates(from)).toEqual([])
  })
})

describe('illegal jumps are rejected', () => {
  it.each([
    ['entwurf', 'bescheid'],
    ['entwurf', 'eingereicht'],
    ['entwurf', 'rueckfrage'],
    ['bescheid', 'entwurf'],
    ['abgeschlossen', 'entwurf'],
    ['rueckfrage', 'entwurf'],
  ] as const)('%s → %s is illegal', (from, after) => {
    expect(isTransitionAllowed(from, after)).toBe(false)
  })
})

describe('the bescheid phase sub-state machine (ADR-009, ticket 10.3)', () => {
  const happyPath: readonly [AssessmentStatus, AssessmentStatus][] = [
    ['eingegangen', 'geprüft'],
    ['geprüft', 'einspruch-eingelegt'],
  ]

  it.each(happyPath)('%s → %s is legal', (from, after) => {
    expect(isAssessmentTransitionAllowed(from, after)).toBe(true)
  })

  it('einspruch-eingelegt is terminal within the phase', () => {
    expect(nextAssessmentStates('einspruch-eingelegt')).toEqual([])
  })

  it('kein stiller Übergang — illegal jumps are rejected', () => {
    expect(isAssessmentTransitionAllowed('eingegangen', 'einspruch-eingelegt')).toBe(false) // must be geprüft first
    expect(isAssessmentTransitionAllowed('geprüft', 'eingegangen')).toBe(false) // no re-open
    expect(isAssessmentTransitionAllowed('einspruch-eingelegt', 'geprüft')).toBe(false)
    expect(isAssessmentTransitionAllowed('einspruch-eingelegt', 'eingegangen')).toBe(false)
  })

  it.each([
    ['eingegangen', 'eingegangen'],
    ['geprüft', 'geprüft'],
    ['einspruch-eingelegt', 'einspruch-eingelegt'],
  ] as const)('%s → %s (Selbstschleife) is forbidden — a state never re-enters itself', (from, after) => {
    expect(isAssessmentTransitionAllowed(from, after)).toBe(false)
  })
})
