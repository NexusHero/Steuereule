// REQ-015 — the Minimal-Gate's question graph (product ADR-016, engineering ADR-0031 §1).
//
// This is the single source of "which screen comes next", imported by BOTH the web app and
// the API (ADR-0033). The client renders from it without a round trip; the server validates
// every incoming answer against it. A gate that only runs in the client would be exactly the
// defect class ADR-0021 names — a mechanism that appears to control behaviour and does not.
//
// Pure, deterministic, dependency-free (ADR-0004). Identifiers and messages are English
// (dev-process language); every customer-facing string lives in the i18n layer, not here.
// The answer VALUES are German because they are the persisted domain vocabulary, byte-equal
// to what product ADR-016/034 and the design-system reference define.

/** The three questions of the Minimal-Gate. Fixed at three by product ADR-016. */
export type QuestionId = 'job' | 'ausland' | 'kinder'

/** The two hard branches. Product ADR-016: "die einzigen harten Verzweigungen". */
export type GateId = 'gewerbe' | 'ch-only'

/**
 * Anything that can carry a stored answer. Gates are included deliberately: reaching a gate
 * and choosing to carry on is a fact about the user's tax year, it is auditable, and storing
 * it is what lets `nextStep` move past a gate instead of returning it forever.
 */
export type StepId = QuestionId | GateId

export type Step =
  | { readonly kind: 'question'; readonly id: QuestionId }
  | { readonly kind: 'gate'; readonly id: GateId }
  | { readonly kind: 'done' }

/** Stored answers, keyed by step. Sparse — a missing key means "not answered yet". */
export type Answers = Partial<Record<StepId, string>>

/** Accepted values for `job` (product ADR-016 + ADR-034: Rente is an option, not a branch). */
export const JOB_VALUES = ['Angestellt', 'Selbstständig', 'Beides', 'Rente'] as const

/** Accepted values for `ausland` (product ADR-016 → CH-gate, ADR-029). */
export const AUSLAND_VALUES = ['Ja, in die Schweiz', 'In ein anderes Land', 'Nein'] as const

/** Accepted values for `kinder`. */
export const KINDER_VALUES = ['Nein', '1 Kind', '2 oder mehr'] as const

/**
 * The single value a gate stores once the user has seen it and carries on. Gates offer no
 * choice in this slice: ADR-0032 keeps every "notify me" / "remember this" button out until
 * the thing it promises exists.
 */
export const GATE_ACKNOWLEDGED = 'weiter'

const QUESTION_VALUES: Readonly<Record<QuestionId, readonly string[]>> = {
  job: JOB_VALUES,
  ausland: AUSLAND_VALUES,
  kinder: KINDER_VALUES,
}

/** The questions, in the order product ADR-016 fixes them. */
export const QUESTION_ORDER: readonly QuestionId[] = ['job', 'ausland', 'kinder']

/**
 * `job` answers that put the user behind the Gewerbe gate (product ADR-028). Mirrors the
 * design-system reference's own condition — everything except Angestellt and Rente.
 */
function needsGewerbeGate(job: string): boolean {
  return job !== 'Angestellt' && job !== 'Rente'
}

/**
 * Behind the Gewerbe gate, "Selbstständig" is a full stop and "Beides" is not.
 *
 * Product ADR-028 is explicit about both halves: EÜR/Anlage G/S/Umsatzsteuer stay out of 1.0,
 * AND "bei 'Beides' sammeln wir deinen Angestellten-Teil komplett ein". A purely self-employed
 * return is entirely the part we cannot do — collecting more of it would be the half return
 * that ADR-028 refuses to ship.
 */
function isTerminalGate(answers: Answers): boolean {
  return answers.job === 'Selbstständig'
}

/**
 * The next screen for these answers. Total and deterministic: same answers, same step.
 *
 * Order: job → [gewerbe] → ausland → [ch-only] → kinder → done.
 */
export function nextStep(answers: Answers): Step {
  if (answers.job === undefined) return { kind: 'question', id: 'job' }

  if (needsGewerbeGate(answers.job)) {
    // A terminal gate is returned forever — there is deliberately no way past it.
    if (isTerminalGate(answers)) return { kind: 'gate', id: 'gewerbe' }
    if (answers.gewerbe === undefined) return { kind: 'gate', id: 'gewerbe' }
  }

  if (answers.ausland === undefined) return { kind: 'question', id: 'ausland' }

  // The CH-only gate drops the foreign part and carries on with the rest of the tax year —
  // "und dein restliches Steuerjahr sowieso" (product ADR-029, design-system reference).
  if (answers.ausland === 'In ein anderes Land' && answers['ch-only'] === undefined) {
    return { kind: 'gate', id: 'ch-only' }
  }

  if (answers.kinder === undefined) return { kind: 'question', id: 'kinder' }

  return { kind: 'done' }
}

/** The id of a step, or `undefined` for `done`. */
function stepId(step: Step): StepId | undefined {
  return step.kind === 'done' ? undefined : step.id
}

/**
 * Can `target` legitimately be written, given what is already answered?
 *
 * This is the server's admission check (#318's P2). It replays the graph from empty answers,
 * consuming only answers the path actually reaches — so an answer smuggled in for a step the
 * user could never have been shown is rejected, and a stored answer that is unreachable on
 * the current path is ignored rather than trusted.
 */
export function isReachable(answers: Answers, target: StepId): boolean {
  const seen = new Set<StepId>()
  let reached: Answers = {}

  for (;;) {
    const step = nextStep(reached)
    const id = stepId(step)
    if (id === undefined) return false // reached `done` without ever offering `target`
    if (id === target) return true

    const answer = answers[id]
    if (answer === undefined) return false // the user has not got that far yet

    // A terminal gate never advances; without this the loop would not end.
    if (seen.has(id)) return false
    seen.add(id)

    reached = { ...reached, [id]: answer }
  }
}

/** Is `value` an accepted answer for `step`? Gates accept only the acknowledgement. */
export function isValidAnswer(step: StepId, value: string): boolean {
  const allowed = QUESTION_VALUES[step as QuestionId]
  if (allowed !== undefined) return allowed.includes(value)
  return value === GATE_ACKNOWLEDGED
}

/**
 * How many QUESTIONS the user must still answer — what `TaxYear.openItems` is written from.
 *
 * Counts only questions, never gates: a gate is something we tell the user, not something we
 * are waiting on. Behind a terminal gate the count is 0, because nothing further can be
 * collected at all — an honest zero, not a finished one.
 *
 * This is a MINIMUM. Answers not yet given cannot open branches we can foresee, and in this
 * slice no branch adds a question, so the minimum is also exact. That stops being true when
 * the on-demand catalogue lands — ADR-0031 §3, and #318's own revisit trigger for deriving
 * `openItems` on read instead of storing it.
 */
export function remainingSteps(answers: Answers): number {
  if (isTerminalGate(answers)) return 0
  return QUESTION_ORDER.filter((id) => answers[id] === undefined).length
}
