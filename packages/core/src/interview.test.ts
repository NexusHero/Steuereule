import { describe, expect, it } from 'vitest'
import {
  GATE_ACKNOWLEDGED,
  isReachable,
  isValidAnswer,
  nextStep,
  remainingSteps,
  type Answers,
  type Step,
  type StepId,
} from './interview'

// REQ-015 / #318 — the trap this suite exists to avoid is named in the ticket: a test that
// asserts THAT a next step appears rather than WHICH one. Such a test stays green when the
// branch is completely wrong. Every case below names the identity of the step.
//
// Red paths (ADR-0021 — a control is only a control if it can fail):
//  - P1: remove the `needsGewerbeGate` branch so `job` always leads to `ausland`
//        → every Selbstständig/Beides row below must go red. If they stay green, the suite
//          was the trap.
//  - P2: make `isReachable` return true unconditionally
//        → the whole "rejects what the path never offered" block must go red. Without it the
//          server has no admission check and both gates are client-side decoration.

const ANGESTELLT: Answers = { job: 'Angestellt' }

describe('nextStep — the identity of the next screen (product ADR-016)', () => {
  const cases: ReadonlyArray<readonly [string, Answers, Step]> = [
    ['nothing answered yet opens with the money-source question', {}, { kind: 'question', id: 'job' }],

    // Product ADR-016's three questions, straight through.
    ['Angestellt goes to the foreign-work question', ANGESTELLT, { kind: 'question', id: 'ausland' }],
    [
      'Rente goes to the foreign-work question too — it is an option, not a branch (ADR-034)',
      { job: 'Rente' },
      { kind: 'question', id: 'ausland' },
    ],

    // Gate 1 — Gewerbe (product ADR-028).
    ['Selbstständig hits the Gewerbe gate', { job: 'Selbstständig' }, { kind: 'gate', id: 'gewerbe' }],
    ['Beides hits the Gewerbe gate as well', { job: 'Beides' }, { kind: 'gate', id: 'gewerbe' }],
    [
      'Beides carries on to the foreign-work question once the gate is acknowledged',
      { job: 'Beides', gewerbe: GATE_ACKNOWLEDGED },
      { kind: 'question', id: 'ausland' },
    ],
    [
      'Selbstständig stays at the gate even after acknowledging it — it is a full stop (ADR-028)',
      { job: 'Selbstständig', gewerbe: GATE_ACKNOWLEDGED },
      { kind: 'gate', id: 'gewerbe' },
    ],

    // Gate 2 — CH-only (product ADR-016/029).
    [
      'another country hits the CH-only gate',
      { ...ANGESTELLT, ausland: 'In ein anderes Land' },
      { kind: 'gate', id: 'ch-only' },
    ],
    [
      'Switzerland does not — we cover it fully (ADR-029)',
      { ...ANGESTELLT, ausland: 'Ja, in die Schweiz' },
      { kind: 'question', id: 'kinder' },
    ],
    ['no foreign work does not either', { ...ANGESTELLT, ausland: 'Nein' }, { kind: 'question', id: 'kinder' }],
    [
      'the CH-only gate drops the foreign part and carries on with the rest of the year',
      { ...ANGESTELLT, ausland: 'In ein anderes Land', 'ch-only': GATE_ACKNOWLEDGED },
      { kind: 'question', id: 'kinder' },
    ],

    ['all three answered is done', { ...ANGESTELLT, ausland: 'Nein', kinder: '1 Kind' }, { kind: 'done' }],
  ]

  it.each(cases)('%s', (_name, answers, expected) => {
    expect(nextStep(answers)).toEqual(expected)
  })

  it('is deterministic — the same answers always give the same step', () => {
    const answers: Answers = { job: 'Beides' }
    expect(nextStep(answers)).toEqual(nextStep(answers))
  })

  it('every gate follows immediately on the answer that determines it (ADR-0031 §4)', () => {
    // The design-system prototype breaks this: its Ausland gate fires on question 9 of 9
    // (Interview.jsx:14, 52). Asserted here so the ordering cannot regress into that shape.
    const determines: ReadonlyArray<readonly [StepId, Answers, Answers]> = [
      ['gewerbe', {}, { job: 'Selbstständig' }],
      ['ch-only', ANGESTELLT, { ...ANGESTELLT, ausland: 'In ein anderes Land' }],
    ]

    for (const [gate, before, after] of determines) {
      expect(nextStep(before)).not.toEqual({ kind: 'gate', id: gate })
      expect(nextStep(after)).toEqual({ kind: 'gate', id: gate })
    }
  })
})

describe('isReachable — the server admission check (#318 P2)', () => {
  it('accepts the step the user is actually standing on', () => {
    expect(isReachable({}, 'job')).toBe(true)
    expect(isReachable(ANGESTELLT, 'ausland')).toBe(true)
    expect(isReachable({ ...ANGESTELLT, ausland: 'Nein' }, 'kinder')).toBe(true)
  })

  it('rejects a step the user has not reached yet', () => {
    expect(isReachable({}, 'ausland')).toBe(false)
    expect(isReachable({}, 'kinder')).toBe(false)
  })

  it('rejects an answer smuggled in without the answers that lead to it', () => {
    // No `job`, so `ausland` was never offered — yet the payload claims to answer `kinder`.
    expect(isReachable({ ausland: 'Nein' }, 'kinder')).toBe(false)
  })

  it('rejects everything behind a terminal gate', () => {
    // The sharpest case: a self-employed user cannot write ANY further answer, acknowledged
    // gate or not. Without this, the Gewerbe gate is a screen and not a control.
    expect(isReachable({ job: 'Selbstständig' }, 'ausland')).toBe(false)
    expect(isReachable({ job: 'Selbstständig', gewerbe: GATE_ACKNOWLEDGED }, 'ausland')).toBe(false)
    expect(isReachable({ job: 'Selbstständig', gewerbe: GATE_ACKNOWLEDGED }, 'kinder')).toBe(false)
  })

  it('requires a passable gate to be acknowledged before what follows it', () => {
    expect(isReachable({ job: 'Beides' }, 'ausland')).toBe(false)
    expect(isReachable({ job: 'Beides', gewerbe: GATE_ACKNOWLEDGED }, 'ausland')).toBe(true)
  })

  it('accepts a gate only on the path that actually opens it', () => {
    expect(isReachable({ ...ANGESTELLT, ausland: 'In ein anderes Land' }, 'ch-only')).toBe(true)
    expect(isReachable({ ...ANGESTELLT, ausland: 'Nein' }, 'ch-only')).toBe(false)
    expect(isReachable(ANGESTELLT, 'gewerbe')).toBe(false)
  })

  it('rejects anything once the interview is done', () => {
    const finished: Answers = { ...ANGESTELLT, ausland: 'Nein', kinder: 'Nein' }
    expect(isReachable(finished, 'gewerbe')).toBe(false)
  })
})

describe('isValidAnswer', () => {
  it('accepts the values product ADR-016/034 define', () => {
    expect(isValidAnswer('job', 'Rente')).toBe(true)
    expect(isValidAnswer('ausland', 'In ein anderes Land')).toBe(true)
    expect(isValidAnswer('kinder', '2 oder mehr')).toBe(true)
  })

  it('rejects a value outside the option set', () => {
    expect(isValidAnswer('job', 'Freiberuflich')).toBe(false)
    expect(isValidAnswer('kinder', '3')).toBe(false)
  })

  it('accepts only the acknowledgement on a gate', () => {
    expect(isValidAnswer('gewerbe', GATE_ACKNOWLEDGED)).toBe(true)
    expect(isValidAnswer('ch-only', GATE_ACKNOWLEDGED)).toBe(true)
    expect(isValidAnswer('gewerbe', 'Angestellt')).toBe(false)
  })
})

describe('remainingSteps — what TaxYear.openItems is written from', () => {
  it('counts the questions still to answer', () => {
    expect(remainingSteps({})).toBe(3)
    expect(remainingSteps(ANGESTELLT)).toBe(2)
    expect(remainingSteps({ ...ANGESTELLT, ausland: 'Nein' })).toBe(1)
    expect(remainingSteps({ ...ANGESTELLT, ausland: 'Nein', kinder: 'Nein' })).toBe(0)
  })

  it('does not count gates — a gate is something we tell the user, not something we await', () => {
    expect(remainingSteps({ job: 'Beides', gewerbe: GATE_ACKNOWLEDGED })).toBe(2)
  })

  it('is zero behind a terminal gate — an honest zero, not a finished one', () => {
    expect(remainingSteps({ job: 'Selbstständig' })).toBe(0)
  })
})
