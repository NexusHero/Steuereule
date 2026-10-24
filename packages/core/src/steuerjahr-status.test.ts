import { describe, expect, it } from 'vitest'
import {
  istBescheidUebergangErlaubt,
  istUebergangErlaubt,
  naechsteBescheidZustaende,
  naechsteZustaende,
  type BescheidStatus,
  type SteuerjahrStatus,
} from './steuerjahr-status'

// ADR-018 — the lifecycle state machine. The two REAL edge states (rueckfrage,
// extern-erledigt) are what this suite exists to pin down: they must be genuine states
// with genuine transitions, not badges. The two NON-states (technical failure, missed
// deadline) are asserted by their ABSENCE from the transition table.

describe('the ADR-018 main flow (Entwurf → Prüfung → Eingereicht → Bescheid → Abgeschlossen)', () => {
  const happyPath: readonly [SteuerjahrStatus, SteuerjahrStatus][] = [
    ['entwurf', 'pruefung'],
    ['pruefung', 'eingereicht'],
    ['eingereicht', 'bescheid'],
    ['bescheid', 'abgeschlossen'],
  ]

  it.each(happyPath)('%s → %s is legal', (von, nach) => {
    expect(istUebergangErlaubt(von, nach)).toBe(true)
  })
})

describe('rueckfrage — a REAL state between eingereicht and bescheid, reachable in both directions', () => {
  it('eingereicht → rueckfrage is legal (Finanzamt requests documents)', () => {
    expect(istUebergangErlaubt('eingereicht', 'rueckfrage')).toBe(true)
  })

  it('rueckfrage ⇄ eingereicht: resolving the request returns to eingereicht', () => {
    expect(istUebergangErlaubt('rueckfrage', 'eingereicht')).toBe(true)
  })

  it('rueckfrage → bescheid is legal (the request resolves straight into a Bescheid)', () => {
    expect(istUebergangErlaubt('rueckfrage', 'bescheid')).toBe(true)
  })
})

describe('extern-erledigt — a REAL parallel exit (ADR-018: archive, not a dead end)', () => {
  it('is reachable from entwurf and pruefung', () => {
    expect(istUebergangErlaubt('entwurf', 'extern-erledigt')).toBe(true)
    expect(istUebergangErlaubt('pruefung', 'extern-erledigt')).toBe(true)
  })

  it('is NOT reachable once eingereicht — you cannot file via us AND mark it externally done', () => {
    expect(istUebergangErlaubt('eingereicht', 'extern-erledigt')).toBe(false)
  })

  it('is terminal', () => {
    expect(naechsteZustaende('extern-erledigt')).toEqual([])
  })
})

describe('the two NON-states stay non-states (ADR-018)', () => {
  it('a technical submission failure is NOT a state: pruefung has no "failed" successor', () => {
    // The failed attempt stays 'pruefung' + a toast; it is not representable as a state,
    // so no transition may ever carry it into one.
    for (const nach of naechsteZustaende('pruefung')) {
      expect(nach).not.toContain('failed')
    }
    expect(naechsteZustaende('pruefung')).toEqual(['eingereicht', 'entwurf', 'extern-erledigt'])
  })

  it('a missed deadline is NOT a state: entwurf has no "verspätet" successor', () => {
    // The missed deadline stays 'entwurf' + a warning banner; it is not a state.
    expect(naechsteZustaende('entwurf')).toEqual(['pruefung', 'extern-erledigt'])
  })
})

describe('editing is allowed: pruefung can return to entwurf', () => {
  it('pruefung → entwurf is legal (the user reopens a draft to fix something)', () => {
    expect(istUebergangErlaubt('pruefung', 'entwurf')).toBe(true)
  })
})

describe('terminal states admit nothing further', () => {
  it.each(['abgeschlossen', 'extern-erledigt'] as const)('%s is terminal', (von) => {
    expect(naechsteZustaende(von)).toEqual([])
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
  ] as const)('%s → %s is illegal', (von, nach) => {
    expect(istUebergangErlaubt(von, nach)).toBe(false)
  })
})

describe('the bescheid phase sub-state machine (ADR-009, ticket 10.3)', () => {
  const happyPath: readonly [BescheidStatus, BescheidStatus][] = [
    ['eingegangen', 'geprüft'],
    ['geprüft', 'einspruch-eingelegt'],
  ]

  it.each(happyPath)('%s → %s is legal', (von, nach) => {
    expect(istBescheidUebergangErlaubt(von, nach)).toBe(true)
  })

  it('einspruch-eingelegt is terminal within the phase', () => {
    expect(naechsteBescheidZustaende('einspruch-eingelegt')).toEqual([])
  })

  it('kein stiller Übergang — illegal jumps are rejected', () => {
    expect(istBescheidUebergangErlaubt('eingegangen', 'einspruch-eingelegt')).toBe(false) // must be geprüft first
    expect(istBescheidUebergangErlaubt('geprüft', 'eingegangen')).toBe(false) // no re-open
    expect(istBescheidUebergangErlaubt('einspruch-eingelegt', 'geprüft')).toBe(false)
    expect(istBescheidUebergangErlaubt('einspruch-eingelegt', 'eingegangen')).toBe(false)
  })
})
