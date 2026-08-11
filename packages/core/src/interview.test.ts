import { describe, expect, it } from 'vitest'
import {
  buildStepIndex,
  ENTRIES,
  entryForStep,
  GATE_ACKNOWLEDGED,
  isReachable,
  isReachableFor,
  isValidAnswer,
  nextStep,
  nextStepFor,
  QUESTIONS,
  remainingSteps,
  remainingStepsFor,
  type Answers,
  type CatalogueEntry,
  type EntryStepId,
  type QuestionDeclaration,
  type Step,
  type StepId,
} from './interview'

// REQ-015 / #318 / REQ-016 / #321 — the trap this suite exists to avoid is named in #318's
// ticket: a test that asserts THAT a next step appears rather than WHICH one. Such a test
// stays green when the branch is completely wrong. Every case below names the identity of the
// step.
//
// Red paths (ADR-0021 — a control is only a control if it can fail):
//  - P1: remove the `Selbstständig`/`Beides` entries from `QUESTIONS.job.followUps` so `job`
//        always leads straight to `ausland` → every Selbstständig/Beides row below must go red.
//        RE-RUN for #321 (ADR-0021 amendment): #318's P1 was proven against the old
//        `needsGewerbeGate` function; that function no longer exists — `job`'s gate now comes
//        from `QUESTIONS.job.followUps` alone. Confirmed red against the new shape; see this
//        PR's evidence block for the exact command and output.
//  - P2: make `isReachable`/`isReachableFor` return true unconditionally → the whole "rejects
//        what the path never offered" block must go red. RE-RUN for #321 for the same reason as
//        P1 — `isReachable` is now `isReachableFor` bound through `STEP_INDEX`, not the old
//        hand-written 3-question loop.
//  - Q1 (#321): a SECOND catalogue entry, invented in this file, built from existing question
//        ids, must be fully usable through `nextStepFor`/`isReachableFor`/`remainingStepsFor`
//        alone — no production code (ENTRIES, QUESTIONS, or the engine) is touched for it.
//  - Q4 (#321): a gate hung directly in an entry's `.steps` (bypassing the type system, exactly
//        the prototype's `Interview.jsx:14,52` defect) must be rejected by `buildStepIndex`.
//  - D3 (#321): two entries claiming the same step id must be rejected by `buildStepIndex`.
//  - D5 (#321): an integer-typed step's range check must be provably breakable.

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

  it('every Minimal-Gate gate follows immediately on the answer that determines it (ADR-0031 §4)', () => {
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

  it('rejects a step that belongs to no declared entry at all (D3 — unknown ids are simply unreachable)', () => {
    expect(isReachable({}, 'vermietung' as StepId)).toBe(false)
  })

  it('is bound to the Minimal-Gate only — a Segment-2 id is never reachable through THIS function', () => {
    // Deliberate (see interview.ts's header comment): `isReachable` stays byte-identical to
    // #318, scoped to `ENTRIES['minimal-gate']`. A Segment-2 id is not even a valid `StepId`
    // here, so this can only be reached via an unsafe cast — exactly the shape
    // `interview.service.ts` uses today, and this proves it still resolves to false, not to a
    // silently-admitted Segment-2 write through the Segment-1 endpoint.
    expect(isReachable({}, 'partner' as StepId)).toBe(false)
    expect(isReachable({}, 'homeoffice' as StepId)).toBe(false)
  })
})

describe('entryForStep + isReachableFor (D3) — the cross-entry derivation R2 opts into explicitly', () => {
  it('derives the owning entry from a bare step id, for both Segment-1 and Segment-2 ids', () => {
    expect(entryForStep('job')).toBe('minimal-gate')
    expect(entryForStep('gewerbe')).toBe('minimal-gate')
    expect(entryForStep('partner')).toBe('segment-2')
    expect(entryForStep('krypto-gate')).toBe('segment-2')
    expect(entryForStep('vermietung' as EntryStepId)).toBeUndefined()
  })

  it('composes with isReachableFor to admit a Segment-2 write without a client-supplied scope', () => {
    const admit = (answers: Answers, target: EntryStepId): boolean => {
      const entryId = entryForStep(target)
      return entryId !== undefined && isReachableFor(ENTRIES[entryId], answers, target)
    }
    expect(admit({}, 'partner')).toBe(true)
    expect(admit({}, 'homeoffice')).toBe(false)
    expect(admit({ partner: 'Ja' }, 'homeoffice')).toBe(true)
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

  it('rejects an entirely unknown step id', () => {
    expect(isValidAnswer('vermietung' as StepId, 'Ja')).toBe(false)
  })

  describe('D5 — the integer value form (#321: weg, tage)', () => {
    it('accepts an in-range integer literal', () => {
      expect(isValidAnswer('weg', '0')).toBe(true)
      expect(isValidAnswer('weg', '28')).toBe(true)
      expect(isValidAnswer('weg', '999')).toBe(true)
      expect(isValidAnswer('tage', '260')).toBe(true)
    })

    it('rejects a value outside the declared range', () => {
      expect(isValidAnswer('weg', '1000')).toBe(false)
      expect(isValidAnswer('weg', '-1')).toBe(false)
      expect(isValidAnswer('tage', '367')).toBe(false)
    })

    it('rejects anything that is not a plain base-10 integer literal', () => {
      expect(isValidAnswer('weg', '28km')).toBe(false)
      expect(isValidAnswer('weg', '28.5')).toBe(false)
      expect(isValidAnswer('weg', '')).toBe(false)
      expect(isValidAnswer('weg', ' 28')).toBe(false)
      expect(isValidAnswer('weg', '+28')).toBe(false)
      expect(isValidAnswer('weg', '028')).toBe(false)
    })

    // ADR-0021 — proving this is provably breakable, not merely present. Corrupting the range
    // check (`n >= form.min && n <= form.max` weakened to always `true`) makes the
    // out-of-range case above pass when it must fail — i.e. the preceding
    // 'rejects a value outside the declared range' test goes red. Confirmed manually; see this
    // PR's evidence block for the exact mutation and output.
  })
})

describe('remainingSteps — what TaxYear.openItems is written from (Minimal-Gate)', () => {
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

  it('is zero behind a terminal gate even before the gate itself is answered', () => {
    // job alone already determines the terminal branch — ausland/kinder can never be reached,
    // so they must not be counted as "still to answer" either.
    expect(remainingSteps({ job: 'Selbstständig' })).toBe(0)
  })
})

// ------------------------------------------------------------------------------------------
// #321 — Segment 2, through the SAME engine (ADR-0031 §3 / §4)
// ------------------------------------------------------------------------------------------

describe('Segment 2 (#321) — same engine, entry-derived answers, over ENTRIES["segment-2"]', () => {
  const entry = ENTRIES['segment-2']

  it('opens with partner, straight through the six base questions when nothing branches', () => {
    expect(nextStepFor(entry, {})).toEqual({ kind: 'question', id: 'partner' })
    expect(nextStepFor(entry, { partner: 'Nein' })).toEqual({ kind: 'question', id: 'homeoffice' })
    expect(remainingStepsFor(entry, {})).toBe(6)
    expect(remainingStepsFor(entry, { partner: 'Nein' })).toBe(5)
  })

  it('Q2 — einkuenfte: Kapitalerträge opens kap-depot, identity of the step, not merely its existence', () => {
    const answers: Answers = {
      partner: 'Nein',
      homeoffice: 'Nie',
      weg: '0',
      tage: '200',
      fortbildung: 'Nein',
      einkuenfte: 'Kapitalerträge',
    }
    expect(nextStepFor(entry, answers)).toEqual({ kind: 'question', id: 'kap-depot' })
  })

  it('Q2 — einkuenfte: Vermietung opens vermietung-art, not kap-depot', () => {
    const answers: Answers = {
      partner: 'Nein',
      homeoffice: 'Nie',
      weg: '0',
      tage: '200',
      fortbildung: 'Nein',
      einkuenfte: 'Vermietung',
    }
    expect(nextStepFor(entry, answers)).toEqual({ kind: 'question', id: 'vermietung-art' })
  })

  it('Q2 — einkuenfte: Nein opens neither branch — straight to done', () => {
    const answers: Answers = {
      partner: 'Nein',
      homeoffice: 'Nie',
      weg: '0',
      tage: '200',
      fortbildung: 'Nein',
      einkuenfte: 'Nein',
    }
    expect(nextStepFor(entry, answers)).toEqual({ kind: 'done' })
    expect(remainingStepsFor(entry, answers)).toBe(0)
  })

  it('Q2 — einkuenfte: Beides opens BOTH branches, in a fixed order (kap-depot first)', () => {
    const answered: Answers = {
      partner: 'Nein',
      homeoffice: 'Nie',
      weg: '0',
      tage: '200',
      fortbildung: 'Nein',
      einkuenfte: 'Beides',
    }
    expect(nextStepFor(entry, answered)).toEqual({ kind: 'question', id: 'kap-depot' })
    // Both are already-certain future obligations regardless of asking order — remainingSteps
    // must count BOTH, not just the one nextStep happens to show first.
    expect(remainingStepsFor(entry, answered)).toBe(2)

    const kapAnswered: Answers = { ...answered, 'kap-depot': 'Deutscher Broker' }
    expect(nextStepFor(entry, kapAnswered)).toEqual({ kind: 'question', id: 'vermietung-art' })
    expect(remainingStepsFor(entry, kapAnswered)).toBe(1)
  })

  // The five base questions, fully answered, harmlessly — the common prefix every branch
  // below needs before `einkuenfte` (and anything past it) is reachable at all: `isReachableFor`
  // replays the WHOLE path from empty, same as #318's P2, not just the single triggering answer.
  const BASE_ANSWERED: Answers = { partner: 'Nein', homeoffice: 'Nie', weg: '0', tage: '200', fortbildung: 'Nein' }

  it('Q3 — the crypto gate is server-side: kap-depot: Krypto is reachable, krypto-gate only after it', () => {
    const beforeKap: Answers = { ...BASE_ANSWERED, einkuenfte: 'Kapitalerträge' }
    expect(isReachableFor(entry, beforeKap, 'krypto-gate')).toBe(false)

    const afterKap: Answers = { ...beforeKap, 'kap-depot': 'Krypto' }
    expect(isReachableFor(entry, afterKap, 'krypto-gate')).toBe(true)
    // The crypto gate is passable, not terminal — acknowledging it must carry on to fortbildung
    // (the next unanswered base step), not stay stuck.
    const acknowledged: Answers = { ...afterKap, 'krypto-gate': GATE_ACKNOWLEDGED }
    expect(nextStepFor(entry, acknowledged)).toEqual({ kind: 'done' })
  })

  it('Q3 — the sale/furnished-short-term gate is server-side: vermietung-gate only after vermietung-art: Verkauf oder möbliert', () => {
    const before: Answers = { ...BASE_ANSWERED, einkuenfte: 'Vermietung' }
    expect(isReachableFor(entry, before, 'vermietung-gate')).toBe(false)

    const after: Answers = { ...before, 'vermietung-art': 'Verkauf oder möbliert' }
    expect(isReachableFor(entry, after, 'vermietung-gate')).toBe(true)
    // Not reachable at all when a non-gating vermietung-art answer was given instead.
    const einfach: Answers = { ...before, 'vermietung-art': 'Einfach' }
    expect(isReachableFor(entry, einfach, 'vermietung-gate')).toBe(false)
  })

  it('Q5 — leaving the entry mid-way and returning: answers already given persist and remain reachable', () => {
    const partial: Answers = { partner: 'Ja', homeoffice: 'Fast immer' }
    expect(nextStepFor(entry, partial)).toEqual({ kind: 'question', id: 'weg' })
    expect(isReachableFor(entry, partial, 'partner')).toBe(true)
    expect(isReachableFor(entry, partial, 'homeoffice')).toBe(true)
    expect(remainingStepsFor(entry, partial)).toBe(4)
  })
})

// ------------------------------------------------------------------------------------------
// #321 Q1 — the catalogue seam itself: a THIRD entry, invented right here, using nothing but
// the exported generic engine and existing question ids. No production code (ENTRIES,
// QUESTIONS, ENGINE) is touched for this test to pass — that is the whole point (ADR-0031 §3).
// ------------------------------------------------------------------------------------------

describe('Q1 (#321) — a test-invented catalogue entry is fully usable by its declaration alone', () => {
  // Reuses three EXISTING question ids (job, kinder, partner), in a novel order and a novel
  // combination no production entry declares — proving the engine is driven purely by
  // `CatalogueEntry.steps` + `QUESTIONS`, not by any hidden knowledge of "the six" or "the
  // three". If a special case for Segment 1 or Segment 2 had crept into `walk`/`countRemaining`
  // /`isReachableFor`, this entry would misbehave even though nothing about it is malformed.
  const invented: CatalogueEntry = { id: 'q1-invented-entry' as never, steps: ['kinder', 'job', 'partner'] }

  it('walks in the declared order, independent of every real entry', () => {
    expect(nextStepFor(invented, {})).toEqual({ kind: 'question', id: 'kinder' })
    expect(nextStepFor(invented, { kinder: 'Nein' })).toEqual({ kind: 'question', id: 'job' })
    // job's own gate follow-up still fires — the invented entry inherits it "for free" because
    // the gate is declared on the QUESTION, not on any entry.
    expect(nextStepFor(invented, { kinder: 'Nein', job: 'Selbstständig' })).toEqual({ kind: 'gate', id: 'gewerbe' })
    expect(nextStepFor(invented, { kinder: 'Nein', job: 'Angestellt' })).toEqual({ kind: 'question', id: 'partner' })
    expect(nextStepFor(invented, { kinder: 'Nein', job: 'Angestellt', partner: 'Ja' })).toEqual({ kind: 'done' })
  })

  it('reachability and remaining-count both honour the invented order, not the real entries’ order', () => {
    expect(isReachableFor(invented, {}, 'job')).toBe(false) // kinder comes first HERE
    expect(isReachableFor(invented, { kinder: 'Nein' }, 'job')).toBe(true)
    expect(remainingStepsFor(invented, {})).toBe(3)
    expect(remainingStepsFor(invented, { kinder: 'Nein', job: 'Selbstständig' })).toBe(0) // terminal still applies
  })

  it('buildStepIndex accepts it and attributes every one of its steps (including job’s follow-up gate) to it', () => {
    const index = buildStepIndex({ invented })
    expect(index.get('kinder')).toBe('invented')
    expect(index.get('job')).toBe('invented')
    expect(index.get('partner')).toBe('invented')
    expect(index.get('gewerbe')).toBe('invented') // job's followUp, walked transitively
  })
})

// ------------------------------------------------------------------------------------------
// #321 Q4 / D2 — "a gate is declared as a follow-up of the question that determines it, never
// as a bare position in an entry's own step list" — proven structurally, across ALL real
// entries, plus the deliberate break the prototype's own defect (`Interview.jsx:14,52`) is.
// ------------------------------------------------------------------------------------------

describe('Q4 / D2 (#321) — ADR-0031 §4 as a structural gate, not a rule someone has to remember', () => {
  /** Every declared (determining question, answer, gate) triple, derived from QUESTIONS itself. */
  function allDeterminedGates(): ReadonlyArray<readonly [EntryStepId, string, EntryStepId]> {
    const rows: Array<readonly [EntryStepId, string, EntryStepId]> = []
    for (const [questionId, decl] of Object.entries(QUESTIONS) as ReadonlyArray<[EntryStepId, QuestionDeclaration]>) {
      if (decl.followUps === undefined) continue
      for (const [answerValue, targets] of Object.entries(decl.followUps)) {
        for (const target of targets) {
          const targetId = typeof target === 'string' ? target : target.step
          if (QUESTIONS[targetId].kind === 'gate') rows.push([questionId, answerValue, targetId])
        }
      }
    }
    return rows
  }

  // The context each determining question itself needs to be reachable at all — `isReachableFor`
  // replays the WHOLE path from empty (#318's P2), so a gate nested behind an earlier branch
  // (krypto-gate behind kap-depot behind einkuenfte) needs that earlier branch answered too,
  // not just its own immediate trigger. Keyed by the GATE, not the question, since that is
  // this test's own unit of iteration.
  const GATE_PREFIXES: Readonly<Partial<Record<EntryStepId, Answers>>> = {
    gewerbe: {}, // job is the Minimal-Gate's first question — no earlier context needed
    'ch-only': { job: 'Angestellt' }, // ausland is the second question
    'krypto-gate': { partner: 'Nein', homeoffice: 'Nie', weg: '0', tage: '200', fortbildung: 'Nein', einkuenfte: 'Kapitalerträge' },
    'vermietung-gate': { partner: 'Nein', homeoffice: 'Nie', weg: '0', tage: '200', fortbildung: 'Nein', einkuenfte: 'Vermietung' },
  }

  it('every gate in the registry is unreachable before, and reachable immediately after, the answer that determines it', () => {
    const rows = allDeterminedGates()
    // Sanity: this must actually cover something, or the property below is vacuous (ADR-0021
    // — "a check that iterates the same array the implementation produces asserts nothing").
    expect(rows.length).toBeGreaterThanOrEqual(4) // gewerbe, ch-only, krypto-gate, vermietung-gate
    // Every gate the registry declares must have a prefix above — an omission here would make
    // that gate's row silently use `{}`, which is a real gap, not a pass (ADR-0021 amendment §1:
    // the existence branch, not just the validity branch).
    for (const [, , gateId] of rows) {
      expect(GATE_PREFIXES[gateId], `GATE_PREFIXES is missing an entry for "${gateId}"`).toBeDefined()
    }

    for (const [questionId, answerValue, gateId] of rows) {
      const entryId = entryForStep(gateId)
      expect(entryId, `entryForStep found no owner for "${gateId}"`).toBeDefined()
      const entry = ENTRIES[entryId!]
      const prefix = GATE_PREFIXES[gateId] ?? {}
      const before: Answers = prefix
      const after: Answers = { ...prefix, [questionId]: answerValue }
      expect(isReachableFor(entry, before, gateId)).toBe(false)
      expect(isReachableFor(entry, after, gateId)).toBe(true)
    }
  })

  it('buildStepIndex rejects a gate hung directly in an entry’s .steps — the prototype’s own defect, reproduced deliberately', () => {
    // `as never` bypasses `CatalogueEntry.steps`'s `readonly QuestionId[]` type on purpose —
    // this is exactly the shape the type system already makes unrepresentable through normal
    // authoring; this test proves the RUNTIME guard also catches the same shape reached via a
    // bypass (e.g. an `any`-typed caller), same defect class as Interview.jsx:14,52 (the
    // Ausland gate firing on question 9 of 9 instead of immediately after `ausland`).
    const malformed: CatalogueEntry = {
      id: 'malformed' as never,
      steps: ['job', 'ausland', 'kinder', 'gewerbe'] as never,
    }
    expect(() => buildStepIndex({ malformed })).toThrow(/is a gate but appears directly in entry "malformed"\.steps/)
  })

  it('the real ENTRIES table is well-formed — buildStepIndex(ENTRIES) does not throw (this is what module load already relies on)', () => {
    expect(() => buildStepIndex(ENTRIES)).not.toThrow()
  })
})

// ------------------------------------------------------------------------------------------
// #321 D3 — entries partition the question-id space.
// ------------------------------------------------------------------------------------------

describe('D3 (#321) — entries must partition the question-id space', () => {
  it('buildStepIndex throws when two entries claim the same step id', () => {
    const a: CatalogueEntry = { id: 'a' as never, steps: ['job'] }
    const b: CatalogueEntry = { id: 'b' as never, steps: ['job', 'kinder'] }
    expect(() => buildStepIndex({ a, b })).toThrow(/"job" is claimed by both entry "a" and entry "b"/)
  })

  it('does not throw when entries share no step ids', () => {
    const a: CatalogueEntry = { id: 'a' as never, steps: ['job'] }
    const b: CatalogueEntry = { id: 'b' as never, steps: ['kinder'] }
    expect(() => buildStepIndex({ a, b })).not.toThrow()
  })

  it('the real ENTRIES table partitions cleanly — minimal-gate and segment-2 share no step id', () => {
    const minimalGateIds = new Set(ENTRIES['minimal-gate'].steps)
    const segmentTwoIds = new Set(ENTRIES['segment-2'].steps)
    for (const id of minimalGateIds) expect(segmentTwoIds.has(id)).toBe(false)
  })

  it('rejects a step referenced by an entry with no QUESTIONS declaration', () => {
    const a: CatalogueEntry = { id: 'a' as never, steps: ['not-a-real-question' as never] }
    expect(() => buildStepIndex({ a })).toThrow(/has no QUESTIONS declaration/)
  })

  it('rejects a followUp target with no declaration — a typo inside a followUps value, not in an entry’s own .steps', () => {
    // The real `QUESTIONS` registry is `Record<EntryStepId, ...>` — exhaustive by construction,
    // so this exact mistake cannot exist there. Proven here against an injected registry
    // instead (buildStepIndex's optional second parameter), which is what makes the check
    // provable at all (ADR-0021) rather than merely plausible.
    const customQuestions: Readonly<Partial<Record<EntryStepId, QuestionDeclaration>>> = {
      // Reuses the real 'partner' id as the key merely because SOME real `EntryStepId` is
      // required by the type — its declaration is entirely overridden here, on purpose.
      partner: {
        id: 'partner',
        kind: 'question',
        form: { kind: 'enum', values: ['Ja'] },
        followUps: { Ja: ['typo-target' as never] },
      },
    }
    const a: CatalogueEntry = { id: 'a' as never, steps: ['partner'] }
    expect(() => buildStepIndex({ a }, customQuestions)).toThrow(/"typo-target" is referenced by entry "a" but has no QUESTIONS declaration/)
  })
})
