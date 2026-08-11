// REQ-015 — the Minimal-Gate's question graph (#318); #321 — the on-demand catalogue's entry
// layer built on top of it (Segment 2 declared here, not yet admitted server-side — that is R2's
// job). #321's own requirement is Suhay's to create once its ticket is refined (ADR-0025); until
// it exists, cite `#321` alone, not a REQ id. Product ADR-016, engineering ADR-0031/0033.
// Imported by BOTH the web app and the API (ADR-0033). The client
// renders from it without a round trip; the server validates every incoming answer against it.
// A gate that only runs in the client is exactly the defect class ADR-0021 names — a mechanism
// that appears to control behaviour and does not.
//
// Pure, deterministic, dependency-free (ADR-0004). Identifiers and messages are English
// (dev-process language); every customer-facing string lives in the i18n layer, not here. The
// answer VALUES are German because they are the persisted domain vocabulary, byte-equal to what
// Produkt-ADR-016/031/034 and the design-system reference define.
//
// --------------------------------------------------------------------------------------------
// #321 R1 — the catalogue seam (Musti's build plan, issue #321). Five rulings, D1-D5:
//
//   D1 — There is ONE walker over a declared `CatalogueEntry`, and the Minimal-Gate is entry
//        one (`ENTRIES['minimal-gate']`). There is no "interview path" vs. "catalogue path" —
//        this is what turns ADR-0031 §3 ("a catalogue entry is a named set of question ids, not
//        a second code path") from a claim someone has to remember into a structural fact:
//        Segment 2 (`ENTRIES['segment-2']`) is built through the exact same engine
//        (`nextStepFor`/`isReachableFor`/`remainingStepsFor`).
//
//   D2 — A gate is declared as a FOLLOW-UP of the question that determines it, never as a bare
//        position in an entry's own step list. `CatalogueEntry.steps` is typed
//        `readonly EntryQuestionId[]` — a gate id literally does not fit there, and
//        `buildStepIndex` below re-asserts the same rule at runtime (defense in depth against a
//        cast bypassing the type). This is what makes ADR-0031 §4 (no gate fires later than the
//        question that determines it) unrepresentable to violate, rather than a rule someone has
//        to remember — the prototype breaks exactly this at `Interview.jsx:14,52`.
//
//   D3 — Entries partition the question-id space; the SERVER derives the owning entry from a
//        bare `questionId` (`entryForStep`, via `STEP_INDEX`) rather than trusting a
//        client-supplied scope — the same instinct ADR-0007 applies to identity.
//        `buildStepIndex` throws if two entries ever claim the same step id.
//
//   D4 — Coupling (Produkt-ADR-006, #321's `partner`) never enters this module. `isReachable`/
//        `isReachableFor` and `remainingSteps`/`remainingStepsFor` replay one person's own
//        stored rows only; nothing here reads a second user's answers, and nothing here needs
//        to. See R5's own tests for the "feed a partner's rows into the replay" red path — the
//        correct behaviour here is that this module has no surface for a second user's data at
//        all.
//
//   D5 — `isValidAnswer` accepts a declared VALUE FORM per step: `enum` (the original,
//        unchanged behaviour) or `integer` with an inclusive range. `weg` and `tage` are
//        integer-typed; the column stays `String` (no migration — see schema.prisma).
//
// ADR-0021 amendment (Musti, forthcoming engineering ADR at R1's landing): this file relocates
// the code #318's P1/P2 breaks were run against — `needsGewerbeGate`/`isTerminalGate` are gone,
// replaced by the generic `walk`/`countRemaining` engine reading `QUESTIONS['job'].followUps`.
// A proof is a statement about a CODE SHAPE, not a name; the old proof is void until re-run
// against this shape. Both breaks were re-run for this change — see this PR's evidence block.
//
// TWO TYPE TIERS, deliberately, and this is the load-bearing design choice of this file:
//
//  - `QuestionId` / `GateId` / `StepId` / `Step` — the MINIMAL-GATE's own, UNCHANGED since #318
//    (3 questions, 2 gates). `nextStep`, `remainingSteps` and `isReachable` keep these exact
//    pre-#321 names, signatures, VALUES and — this is the part that matters — RETURN/PARAMETER
//    TYPES. They are now thin bindings onto the generic engine bound to `ENTRIES['minimal-gate']`,
//    re-expressed but behaviourally identical (review F3/F4: proven by breaking each control and
//    observing the failure, not argued). Every Segment-1 constant (`JOB_VALUES`, `AUSLAND_VALUES`,
//    `KINDER_VALUES`, `QUESTION_ORDER`, `GATE_ACKNOWLEDGED`) is unchanged too.
//    `isValidAnswer` is the one deliberate exception — see its own doc comment: its parameter
//    widened to `EntryStepId` (R2/R3/R4 need it for Segment-2 answers) and its behaviour changed
//    on the Segment-1 surface too, closing a real hole #318 left open (review F4).
//  - `EntryQuestionId` / `EntryGateId` / `EntryStepId` / `EntryStep` — every step declared
//    ANYWHERE in the catalogue (Minimal-Gate + Segment 2 today). The generic engine
//    (`CatalogueEntry`, `QUESTIONS`, `nextStepFor`, `isReachableFor`, `remainingStepsFor`,
//    `buildStepIndex`, `entryForStep`) is expressed over THIS wider domain.
//
// This is not cosmetic. An earlier draft of this file widened `QuestionId`/`StepId` themselves
// to cover Segment 2, and that broke `apps/mobile-web/src/screens/interview/InterviewScreen.tsx`'s
// exhaustive `Record<QuestionId, ...>` — a compile error for six ids that screen doesn't render
// yet (Kaan's K3, not R1's, to add). That is the whole, sufficient reason for the split (review
// F2, verified independently: `tsc -p tsconfig.check.json` is green in both `apps/mobile-web` and
// `apps/api` with zero edits beyond this file).
//
// NOT a reason for the split, and deliberately not claimed as one (review F2 — checked and
// disproved, not merely dropped): widening `StepId` would NOT have let a Segment-2 id through the
// Segment-1 endpoint. `interview.service.ts` casts (`dto.questionId as StepId`), and a cast is
// erased at runtime — the union's width has no effect at that call site regardless of its
// signature. What actually refuses a Segment-2 id there is that `isReachable` binds
// `ENTRIES['minimal-gate']` unconditionally (see its own doc comment below) — that binding, not
// `StepId`'s narrowness, is the control. If R2 needs a check against a wrongly-scoped
// Segment-2/Segment-1 write, it has to add one; this file's type split does not supply it.
// The cross-entry derivation D3 asks for is real and tested (`entryForStep` + `isReachableFor`),
// under names R2 opts into deliberately rather than inheriting silently.
// --------------------------------------------------------------------------------------------

/** The three questions of the Minimal-Gate. Fixed at three by product ADR-016. */
export type MinimalGateQuestionId = 'job' | 'ausland' | 'kinder'

/** The two hard branches of the Minimal-Gate. Product ADR-016: "die einzigen harten Verzweigungen". */
export type MinimalGateGateId = 'gewerbe' | 'ch-only'

/**
 * Segment 2's six questions (ADR-0031 §2) plus its two follow-up-only branch questions
 * (`kap-depot`, `vermietung-art`) — reachable only via `einkuenfte`'s `followUps`, never listed
 * in `ENTRIES['segment-2'].steps` directly (D2).
 */
export type SegmentTwoQuestionId =
  | 'partner'
  | 'homeoffice'
  | 'weg'
  | 'tage'
  | 'fortbildung'
  | 'einkuenfte'
  | 'kap-depot'
  | 'vermietung-art'

/** Segment 2's two honesty gates (product ADR-032/033) — both passable, neither terminal. */
export type SegmentTwoGateId = 'krypto-gate' | 'vermietung-gate'

// ---- Back-compat tier (#318, UNCHANGED) -----------------------------------------------------

/** The Minimal-Gate's own question ids. Byte-identical to #318 — see the header comment. */
export type QuestionId = MinimalGateQuestionId

/** The Minimal-Gate's own gate ids. Byte-identical to #318. */
export type GateId = MinimalGateGateId

/**
 * Anything that can carry a stored Minimal-Gate answer. Gates are included deliberately:
 * reaching a gate and choosing to carry on is a fact about the user's tax year, it is
 * auditable, and storing it is what lets `nextStep` move past a gate instead of returning it
 * forever.
 */
export type StepId = QuestionId | GateId

export type Step =
  | { readonly kind: 'question'; readonly id: QuestionId }
  | { readonly kind: 'gate'; readonly id: GateId }
  | { readonly kind: 'done' }

// ---- Catalogue tier (#321, every entry) -----------------------------------------------------

export type EntryQuestionId = MinimalGateQuestionId | SegmentTwoQuestionId
export type EntryGateId = MinimalGateGateId | SegmentTwoGateId

/** Any step declared in ANY entry — the generic engine's own domain (D1/D3). */
export type EntryStepId = EntryQuestionId | EntryGateId

export type EntryStep =
  | { readonly kind: 'question'; readonly id: EntryQuestionId }
  | { readonly kind: 'gate'; readonly id: EntryGateId }
  | { readonly kind: 'done' }

/**
 * Stored answers, keyed by any step declared in any entry. Sparse — a missing key means "not
 * answered yet". Deliberately the WIDE (`EntryStepId`) domain even though `nextStep`/
 * `isReachable`/etc. only ever read the Minimal-Gate's own five keys out of it: a single
 * `InterviewAnswer` row set is shared across every entry for the same (userId, steuerjahr) —
 * see `schema.prisma`'s `InterviewAnswer` — so a real `answers` object legitimately carries
 * Segment-2 keys too, and this type has to admit them to stay honest about that.
 */
export type Answers = Partial<Record<EntryStepId, string>>

/** Accepted values for `job` (product ADR-016 + ADR-034: Rente is an option, not a branch). */
export const JOB_VALUES = ['Angestellt', 'Selbstständig', 'Beides', 'Rente'] as const

/** Accepted values for `ausland` (product ADR-016 → CH-gate, ADR-029). */
export const AUSLAND_VALUES = ['Ja, in die Schweiz', 'In ein anderes Land', 'Nein'] as const

/** Accepted values for `kinder`. */
export const KINDER_VALUES = ['Nein', '1 Kind', '2 oder mehr'] as const

/** Accepted values for `partner` (product ADR-006 — the fact only; coupling/invitation live outside `core`, D4). */
export const PARTNER_VALUES = ['Ja', 'Nein'] as const

/** Accepted values for `homeoffice`, byte-equal to `Interview.jsx:9`'s `optionen`. */
export const HOMEOFFICE_VALUES = ['Nie', '1–2 Tage pro Woche', 'Fast immer'] as const

/** Accepted values for `fortbildung`. */
export const FORTBILDUNG_VALUES = ['Ja', 'Nein'] as const

/** Accepted values for `einkuenfte` (Produkt-ADR-032/033 — the branch that opens `kap-depot`/`vermietung-art`). */
export const EINKUENFTE_VALUES = ['Nein', 'Kapitalerträge', 'Vermietung', 'Beides'] as const

/** Accepted values for `kap-depot` (Produkt-ADR-032 — both broker kinds ship; crypto gates). */
export const KAP_DEPOT_VALUES = ['Deutscher Broker', 'Ausländischer Broker', 'Krypto'] as const

/** Accepted values for `vermietung-art` (Produkt-ADR-033 — several objects ship; sale/furnished-short-term gates). */
export const VERMIETUNG_ART_VALUES = ['Einfach', 'Mehrere', 'Verkauf oder möbliert'] as const

/** The Minimal-Gate's questions, in the order product ADR-016 fixes them. Unchanged from #318. */
export const QUESTION_ORDER: readonly MinimalGateQuestionId[] = ['job', 'ausland', 'kinder']

/**
 * The single value a gate stores once the user has seen it and carries on. Gates offer no
 * choice in this slice: ADR-0032 keeps every "notify me" / "remember this" button out until
 * the thing it promises exists.
 */
export const GATE_ACKNOWLEDGED = 'weiter'

// --------------------------------------------------------------------------------------------
// The entry layer (D1-D5)
// --------------------------------------------------------------------------------------------

/** D5 — the two value forms a step's answer can be checked against. The column stays `String`. */
export type ValueForm =
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number }

/**
 * D2 — a follow-up is either a plain step id (reachable once its own answer is given, and
 * passable once that answer is itself given) or a step marked `terminal`. A `terminal`
 * follow-up is returned as the next step FOREVER once reached, regardless of whether it has
 * itself been answered — this is what makes the Gewerbe gate a full stop for
 * `job === 'Selbstständig'` (product ADR-028) while staying passable for `'Beides'`, without a
 * second, hand-written "is this terminal" predicate outside the declaration.
 */
export type FollowUpTarget = EntryStepId | { readonly step: EntryStepId; readonly terminal: true }

export interface QuestionDeclaration {
  readonly id: EntryStepId
  readonly kind: 'question' | 'gate'
  readonly form: ValueForm
  /**
   * D2 — keyed by THIS step's own answer value. A gate is declared here, under the question
   * whose answer determines it, never as a member of an entry's own `steps` list.
   */
  readonly followUps?: Readonly<Record<string, readonly FollowUpTarget[]>>
  /**
   * F1 fix (review of #341) — the follow-up chain for an answer that `followUps` above has NO
   * key for. Defaults CLOSED: `walk`/`countRemaining` fall through to this, not to "no
   * follow-up", the moment `followUps` is declared at all. Absent (`undefined`) is only safe for
   * a step whose `followUps` is itself absent — nothing to default for. This is what makes an
   * allow-list (a `followUps` key per gating value) behave like `main`'s original deny-list
   * (`job !== 'Angestellt' && job !== 'Rente'`) for values the allow-list does not name: mirrors
   * #318's own default, so the NEXT value added to a gated question's value set is gated by
   * construction rather than by whoever remembers to update `followUps` too. See `job`'s own
   * declaration below and the "Gewerbe gate default" test group, which goes red the moment
   * `JOB_VALUES` grows without a matching decision in `GEWERBE_GATE_DECISIONS`.
   */
  readonly defaultFollowUp?: readonly FollowUpTarget[]
}

/**
 * The single registry of every declared step, across every entry. `Record<EntryStepId, ...>` is
 * exhaustive by construction — TypeScript refuses to compile if an `EntryStepId` is ever added
 * to the union above without a matching declaration here.
 */
export const QUESTIONS: Readonly<Record<EntryStepId, QuestionDeclaration>> = {
  // ---- Minimal-Gate (segment 1, #318) ----------------------------------------------------
  job: {
    id: 'job',
    kind: 'question',
    form: { kind: 'enum', values: JOB_VALUES },
    followUps: {
      // Selbstständig is a full stop (product ADR-028) — the gate is `terminal`.
      Selbstständig: [{ step: 'gewerbe', terminal: true }],
      // Beides is explicitly passable — Produkt-ADR-028's "collect the employee part".
      Beides: ['gewerbe'],
      // Angestellt and Rente are the ONLY two values product ADR-028/034 exempt from the Gewerbe
      // gate — declared explicitly (empty branch) rather than left absent, because `defaultFollowUp`
      // below now gates anything with no key here. An absent key would silently exempt a value
      // nobody decided to exempt; review F1 (#341) is exactly that failure mode.
      Angestellt: [],
      Rente: [],
    },
    // F1 fix — default CLOSED: any job value that is not one of the four keys above (i.e. any
    // FUTURE value added to JOB_VALUES without a matching decision here) gates, non-terminal,
    // same as `main`'s original deny-list default (`job !== 'Angestellt' && job !== 'Rente'`
    // was true, and `isTerminalGate` was false, for any value other than the two named exemptions
    // and 'Selbstständig'). Terminal-ness is NOT the default — only 'Selbstständig' is terminal,
    // by explicit declaration above.
    defaultFollowUp: ['gewerbe'],
  },
  ausland: {
    id: 'ausland',
    kind: 'question',
    form: { kind: 'enum', values: AUSLAND_VALUES },
    followUps: {
      'In ein anderes Land': ['ch-only'],
    },
  },
  kinder: { id: 'kinder', kind: 'question', form: { kind: 'enum', values: KINDER_VALUES } },
  gewerbe: { id: 'gewerbe', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },
  'ch-only': { id: 'ch-only', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },

  // ---- Segment 2 (#321, ADR-0031 §2 — the catalogue's first entry) -----------------------
  partner: { id: 'partner', kind: 'question', form: { kind: 'enum', values: PARTNER_VALUES } },
  homeoffice: { id: 'homeoffice', kind: 'question', form: { kind: 'enum', values: HOMEOFFICE_VALUES } },
  // Simple integer forms for now (D5), and BOTH ranges below are open placeholders, not sourced
  // rulings (review F6): `weg`'s 0-999 km one-way is not cited from anywhere — nobody has ruled
  // on it — and `tage`'s 0-366 is the same kind of placeholder, doubly so, because #337's
  // exactness ruling (issue #321 discussion, 2026-08-11) will replace `tage`'s single row with
  // the calculator's own multi-row shape (work-week pattern, vacation days, sick days, computed
  // result, plus Bundesland/municipality/weekday pattern) once #337 exists — that is R4's
  // declaration to make, not R1's. Until either row gets a cited source or a #337-equivalent
  // ruling, treat both ranges as open, not authoritative; this entry keeps the base entry's step
  // list and Q1/K3's "no screen-side change" claim true today regardless.
  weg: { id: 'weg', kind: 'question', form: { kind: 'integer', min: 0, max: 999 } },
  tage: { id: 'tage', kind: 'question', form: { kind: 'integer', min: 0, max: 366 } },
  fortbildung: { id: 'fortbildung', kind: 'question', form: { kind: 'enum', values: FORTBILDUNG_VALUES } },
  einkuenfte: {
    id: 'einkuenfte',
    kind: 'question',
    form: { kind: 'enum', values: EINKUENFTE_VALUES },
    followUps: {
      Kapitalerträge: ['kap-depot'],
      Vermietung: ['vermietung-art'],
      // Q2 (issue #321) — "Beides" opens BOTH branches, in this fixed order. The prototype
      // (`Interview.jsx:48,50`) only ever routes "Beides" to the Vermietung branch and never to
      // the KAP branch at all — not authoritative for this, same split as #318/ADR-0031.
      Beides: ['kap-depot', 'vermietung-art'],
    },
  },
  'kap-depot': {
    id: 'kap-depot',
    kind: 'question',
    form: { kind: 'enum', values: KAP_DEPOT_VALUES },
    followUps: {
      // Produkt-ADR-032 — crypto is not 1.0; everything else (DE or foreign broker) is.
      Krypto: ['krypto-gate'],
    },
  },
  'krypto-gate': { id: 'krypto-gate', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },
  'vermietung-art': {
    id: 'vermietung-art',
    kind: 'question',
    form: { kind: 'enum', values: VERMIETUNG_ART_VALUES },
    followUps: {
      // Produkt-ADR-033 — sale / furnished-short-term stays out; several ordinary objects are in.
      'Verkauf oder möbliert': ['vermietung-gate'],
    },
  },
  'vermietung-gate': { id: 'vermietung-gate', kind: 'gate', form: { kind: 'enum', values: [GATE_ACKNOWLEDGED] } },
}

/** D1 — the two entries that exist today. `EntryId` grows as later Lebenslagen arrive (ADR-0031 §3). */
export type EntryId = 'minimal-gate' | 'segment-2'

export interface CatalogueEntry {
  readonly id: EntryId
  /**
   * D2 — ORDERING ONLY, and only ever question ids: a gate id does not typecheck here, which
   * is what makes "hang a gate at the end of an entry" (the prototype's `Interview.jsx:14,52`
   * defect) unrepresentable rather than merely discouraged. `buildStepIndex` re-checks this at
   * runtime for anything that reaches it via a type-system bypass (e.g. a test).
   */
  readonly steps: readonly EntryQuestionId[]
}

export const ENTRIES: Readonly<Record<EntryId, CatalogueEntry>> = {
  'minimal-gate': { id: 'minimal-gate', steps: ['job', 'ausland', 'kinder'] },
  'segment-2': { id: 'segment-2', steps: ['partner', 'homeoffice', 'weg', 'tage', 'fortbildung', 'einkuenfte'] },
}

function targetId(target: FollowUpTarget): EntryStepId {
  return typeof target === 'string' ? target : target.step
}

function isTerminalTarget(target: FollowUpTarget): boolean {
  return typeof target !== 'string' && target.terminal === true
}

/**
 * D3 — builds the reverse index ("which entry owns this step id") that lets the SERVER derive
 * the owning entry from a bare `questionId` instead of trusting a client-supplied scope. Walks
 * every entry's declared `steps` AND every step transitively reachable through `followUps`, so
 * a gate/branch question reachable only via a follow-up (e.g. `kap-depot`, `krypto-gate`) is
 * indexed too, not only the entry's own top-level list.
 *
 * Generic over the entry-id type deliberately (`TEntryId extends string`, not the closed
 * `EntryId` union) — so a TEST can call this directly with synthetic, entirely made-up entries
 * to prove D3's partition rule and D2/§4's "no bare gate in `.steps`" rule, without touching
 * `ENTRIES` or any other production declaration. `questions` defaults to the real `QUESTIONS`
 * registry (every production caller gets this for free) but is overridable, so a test can also
 * exercise "a followUp references a step with no declaration at all" — a typo in a `followUps`
 * value — without needing an undeclared id to exist in the real, exhaustively-typed registry
 * (which the `Record<EntryStepId, ...>` type makes impossible by construction).
 *
 * Throws on:
 *  - two entries claiming the same step id (D3's partition rule);
 *  - a step referenced anywhere (an entry's `steps`, any `followUps` target, or a
 *    `defaultFollowUp` target) with no matching declaration in `questions`;
 *  - a step of kind `'gate'` appearing directly in an entry's own `steps` list (D2/ADR-0031 §4
 *    — the runtime half of what `CatalogueEntry.steps`'s type already prevents at compile time).
 */
export function buildStepIndex<TEntryId extends string>(
  entries: Readonly<Record<TEntryId, CatalogueEntry>>,
  questions: Readonly<Partial<Record<EntryStepId, QuestionDeclaration>>> = QUESTIONS,
): ReadonlyMap<EntryStepId, TEntryId> {
  const index = new Map<EntryStepId, TEntryId>()

  function claim(id: EntryStepId, entryId: TEntryId): void {
    const owner = index.get(id)
    if (owner !== undefined && owner !== entryId) {
      throw new Error(
        `catalogue seam (D3): "${id}" is claimed by both entry "${owner}" and entry "${entryId}" — ` +
          'entries must partition the question-id space.',
      )
    }
    index.set(id, entryId)
  }

  function walkDeclared(ids: readonly FollowUpTarget[], entryId: TEntryId): void {
    for (const target of ids) {
      const id = targetId(target)
      claim(id, entryId)

      const decl = questions[id]
      if (decl === undefined) {
        throw new Error(`catalogue seam: "${id}" is referenced by entry "${entryId}" but has no QUESTIONS declaration.`)
      }
      if (decl.followUps !== undefined) {
        for (const branch of Object.values(decl.followUps)) {
          walkDeclared(branch, entryId)
        }
      }
      // F1 fix — `defaultFollowUp` is a real follow-up chain too (the one an undeclared answer
      // value falls to); index it the same way, so a typo'd or gate-in-.steps defect inside it is
      // caught structurally rather than only at `walk`/`countRemaining` runtime.
      if (decl.defaultFollowUp !== undefined) {
        walkDeclared(decl.defaultFollowUp, entryId)
      }
    }
  }

  for (const entryId of Object.keys(entries) as TEntryId[]) {
    const entry = entries[entryId]
    for (const id of entry.steps) {
      const decl = questions[id]
      if (decl === undefined) {
        throw new Error(`catalogue seam: "${id}" is listed in entry "${entryId}".steps but has no QUESTIONS declaration.`)
      }
      if (decl.kind !== 'question') {
        throw new Error(
          `catalogue seam (ADR-0031 §4): "${id}" is a gate but appears directly in entry "${entryId}".steps — ` +
            "a gate must only be reachable as a follow-up of the question that determines it, never as a bare " +
            "position in an entry's own step list.",
        )
      }
    }
    walkDeclared(entry.steps, entryId)
  }

  return index
}

/** The real, production index — built (and therefore validated) once, at module load. */
const STEP_INDEX: ReadonlyMap<EntryStepId, EntryId> = buildStepIndex(ENTRIES)

/**
 * D3 — which entry owns `step`, or `undefined` if it belongs to none. This is the primitive R2
 * needs to admit a write for an arbitrary catalogue questionId (deriving the entry from the id
 * rather than trusting a client-supplied scope) without reaching into `STEP_INDEX` directly.
 */
export function entryForStep(step: EntryStepId): EntryId | undefined {
  return STEP_INDEX.get(step)
}

function stepFor(id: EntryStepId): EntryStep {
  const decl = QUESTIONS[id]
  // `decl.kind` is the only thing TS's structural narrowing here can't tie back to `id`'s own
  // branch of the `EntryStepId` union — the two casts below are exactly as safe as `decl.kind`
  // itself, which QUESTIONS[id] (D3's exhaustive Record) guarantees matches `id`'s real kind.
  return decl.kind === 'gate' ? { kind: 'gate', id: id as EntryGateId } : { kind: 'question', id: id as EntryQuestionId }
}

/**
 * D1 — the one walker. Total and deterministic: same `entry` + same `answers`, same `EntryStep`.
 * Walks `ids` (an entry's `steps`, or a resolved `followUps` branch) left to right: the first
 * step in the chain without a stored answer is the next step; a `terminal` follow-up is
 * returned forever, regardless of its own stored answer (D2). Once a chain resolves fully
 * (every step in it answered, and it has no dangling follow-up), the walk continues to the
 * NEXT sibling in `ids` — which is how a gate slots in immediately after the question that
 * determines it without disturbing the entry's own ordering.
 *
 * F1 fix — the branch for a given answer is `followUps[answer]` if that OWN key exists (review
 * F9: "exists" means `Object.hasOwn`, not `!== undefined` — see `branchFor`), else
 * `defaultFollowUp` if the declaration has one, else no follow-up at all. A question that
 * declares `followUps` but no matching key for the answer given does NOT silently pass through
 * (that was #341 review F1: an allow-list with no default is fail-OPEN) — it falls to
 * `defaultFollowUp`, which the question's own author must decide. Only a question with neither
 * `followUps` nor `defaultFollowUp` truly has no follow-up semantics.
 */
function branchFor(decl: QuestionDeclaration, answer: string): readonly FollowUpTarget[] {
  const followUps = decl.followUps
  // F9 fix (review of #341) — `decl.followUps` is a plain object literal, so `!== undefined`
  // alone is NOT "is this answer declared": every `Object.prototype` key (`constructor`,
  // `toString`, `__proto__`, `valueOf`, ...) resolves to an inherited member instead of
  // `undefined`, which used to return that inherited value (a function, not a step array) as
  // the branch and crash the caller ("ids is not iterable") rather than falling through to
  // `defaultFollowUp` as this comment always claimed. `Object.hasOwn` restricts "declared" to an
  // OWN key, so those four answers now correctly fall through to `defaultFollowUp`.
  const declared = followUps !== undefined && Object.hasOwn(followUps, answer) ? followUps[answer] : undefined
  if (declared !== undefined) return declared
  return decl.defaultFollowUp ?? []
}

function walk(ids: readonly FollowUpTarget[], answers: Answers): EntryStep {
  for (const target of ids) {
    const id = targetId(target)
    if (isTerminalTarget(target)) return stepFor(id)

    const answer = answers[id]
    if (answer === undefined) return stepFor(id)

    const decl = QUESTIONS[id]
    const branch = branchFor(decl, answer)
    const next = walk(branch, answers)
    if (next.kind !== 'done') return next
  }
  return { kind: 'done' }
}

/** The generic engine (D1) — the next screen for `entry` given `answers`. */
export function nextStepFor(entry: CatalogueEntry, answers: Answers): EntryStep {
  return walk(entry.steps, answers)
}

/**
 * Can `target` legitimately be written within `entry`, given what is already answered?
 *
 * This is the server's admission check (#318's P2, re-expressed over entries for #321). It
 * replays `entry`'s graph from empty answers, consuming only answers the path actually
 * reaches — so an answer smuggled in for a step the user could never have been shown is
 * rejected, and a stored answer that is unreachable on the current path is ignored rather than
 * trusted.
 */
export function isReachableFor(entry: CatalogueEntry, answers: Answers, target: EntryStepId): boolean {
  const seen = new Set<EntryStepId>()
  let reached: Answers = {}

  for (;;) {
    const step = nextStepFor(entry, reached)
    const id = step.kind === 'done' ? undefined : step.id
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

/** Sentinel: "everything beyond this point is unreachable" (a terminal gate was found). */
const TERMINAL_STOP = Symbol('terminal-stop')

function countRemaining(ids: readonly FollowUpTarget[], answers: Answers): number | typeof TERMINAL_STOP {
  let total = 0
  for (const target of ids) {
    if (isTerminalTarget(target)) return TERMINAL_STOP

    const id = targetId(target)
    const decl = QUESTIONS[id]
    const answer = answers[id]

    if (answer === undefined) {
      // Not yet answered — count it if it's a question (never a gate), but we cannot see past
      // it: its own follow-ups depend on an answer we don't have. Independent SIBLINGS in `ids`
      // are still fully counted (see below) — they are already-certain future obligations
      // (e.g. `einkuenfte: 'Beides'` certainly opens BOTH `kap-depot` and `vermietung-art`,
      // regardless of which one is asked first), not unknowable content.
      if (decl.kind === 'question') total += 1
      continue
    }

    // F1 fix — same fallback as `walk`/`branchFor`: an answer with no explicit `followUps` key
    // falls to `defaultFollowUp`, not silently to "no further branch".
    const sub = countRemaining(branchFor(decl, answer), answers)
    if (sub === TERMINAL_STOP) return TERMINAL_STOP
    total += sub
  }
  return total
}

/**
 * How many QUESTIONS within `entry` the user must still answer — what `TaxYear.openItems` is
 * written from. Counts only questions, never gates: a gate is something we tell the user, not
 * something we are waiting on. Zero behind a terminal gate — an honest zero, not a finished
 * one: nothing further can ever be collected on that path, so any sibling steps counted
 * elsewhere in the SAME computation are discarded too (`TERMINAL_STOP` propagates to the top).
 *
 * A genuine graph replay (not a flat count): once a branch-opening answer is known
 * (`einkuenfte: 'Vermietung'`), the questions it opens are counted too. It is still a MINIMUM
 * in the strict sense that content behind an as-yet-unanswered step cannot be foreseen — but
 * that is now the only source of imprecision, not "no branch in this entry can add a
 * question" (#318's own note, which stopped being true the moment Segment 2 landed). Call this
 * fresh on every read rather than caching it (R3, ADR-0033 Consequences / #321's C3c) — the
 * count is only ever accurate for the `answers` it was computed from.
 */
export function remainingStepsFor(entry: CatalogueEntry, answers: Answers): number {
  const result = countRemaining(entry.steps, answers)
  return result === TERMINAL_STOP ? 0 : result
}

// --------------------------------------------------------------------------------------------
// Back-compatible Segment-1 bindings — see the header comment for why these keep #318's exact
// narrow types. Each is the generic engine bound to `ENTRIES['minimal-gate']`; the casts down
// to the narrow `Step`/`StepId` types are sound because that entry's declared steps and every
// step its `followUps` can reach are, by construction, exactly `MinimalGateQuestionId` /
// `MinimalGateGateId` — nothing else is reachable from it.
// --------------------------------------------------------------------------------------------

/** The next screen of the Minimal-Gate for these answers. Order: job → [gewerbe] → ausland → [ch-only] → kinder → done. */
export function nextStep(answers: Answers): Step {
  return nextStepFor(ENTRIES['minimal-gate'], answers) as Step
}

/** The Minimal-Gate's own `remainingStepsFor` binding — see that function's doc for the semantics. */
export function remainingSteps(answers: Answers): number {
  return remainingStepsFor(ENTRIES['minimal-gate'], answers)
}

/**
 * The Minimal-Gate's own admission check (#318 P2), re-expressed over the generic engine but
 * bound to `ENTRIES['minimal-gate']` — byte-identical behaviour to #318, on purpose (see the
 * header comment on why this does NOT derive its entry from `target` the way D3 otherwise
 * would): a Segment-2 id is simply not a valid `StepId` here, so it can never be reachable
 * through this function, exactly as it could never be reachable before #321 existed.
 *
 * The cross-entry version D3 asks for — deriving the owning entry from an arbitrary
 * `EntryStepId` — is `entryForStep` + `isReachableFor`, exported separately for R2 to use where
 * it deliberately wants that behaviour (a new Segment-2 route), not inherited here.
 */
export function isReachable(answers: Answers, target: StepId): boolean {
  return isReachableFor(ENTRIES['minimal-gate'], answers, target)
}

function isAccepted(form: ValueForm, value: string): boolean {
  if (form.kind === 'enum') return form.values.includes(value)
  // D5 — a plain base-10 integer literal (optional leading '-', no leading zeros beyond a bare
  // "0", no whitespace, no "+"), within the declared inclusive range. The column stays `String`.
  if (!/^(0|-?[1-9]\d*)$/.test(value)) return false
  const n = Number(value)
  return n >= form.min && n <= form.max
}

/**
 * Is `value` an accepted answer for `step`? Unknown steps (not in `QUESTIONS`) are rejected.
 * Deliberately takes the WIDE `EntryStepId` (not the narrow `StepId`): unlike `isReachable`,
 * accepting a value is a per-step, entry-independent question — there is no equivalent
 * "which entry is this route for" concern to keep narrow, and R2/R3/R4 need this for Segment 2
 * answers too.
 *
 * BEHAVIOUR CHANGE from #318 (review F4 — the header's "behaviourally identical" claim did not
 * cover this function, and should not have implied it did): #318's `isValidAnswer` ended
 * `return value === GATE_ACKNOWLEDGED`, so ANY unknown step id accepted the value `'weiter'` —
 * `isValidAnswer('vermietung', 'weiter')` was `true`. This version rejects an unknown step
 * outright, `'weiter'` included. Proven by test (`isValidAnswer('vermietung' as StepId,
 * GATE_ACKNOWLEDGED)` must be `false`) and by reverting this line to #318's shape and observing
 * that test go red — see the evidence block.
 */
export function isValidAnswer(step: EntryStepId, value: string): boolean {
  const decl = QUESTIONS[step]
  if (decl === undefined) return false
  return isAccepted(decl.form, value)
}
