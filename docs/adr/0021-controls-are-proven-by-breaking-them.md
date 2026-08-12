# ADR-0021 — A control is proven by breaking it, not by watching it pass

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Stakeholder (NexusHero)
- **Builds on** [ADR-0010](0010-ci-postgres-and-boot-smoke.md) — *Postgres in CI: service-container for
  the test/smoke jobs* — whose context section is the earliest statement of this problem in the log: a
  compliance guarantee "asserted by a real test that never runs anywhere repeatable", and a CI with no
  stage that boots the real server, which hid both a missing dependency and the first CORS gap. Also
  builds on [ADR-0019](0019-oxlint-replaces-eslint.md) (static lint). Extends the evidence block
  defined in `docs/process/delivery-pipeline.md`.
- **Context tags:** quality, delivery method

## Context

This project keeps hitting **one defect class**, not many. In a single working day it appeared at
least nine times, in nine different subsystems, and every instance had the same shape:

> **A mechanism that appears to control behaviour, and doesn't.**

| Instance | Looked like | Actually was | Where |
|---|---|---|---|
| `Content-Disposition` | a header the client reads | not CORS-exposed; unreadable in a browser | #152, F3 |
| CI `lint` job | a gate, wired via `needs:` | `echo "TODO"`, green in 3s | #113 |
| CI `build` job (`ci.yml:148`) | a gate | the same `echo "TODO"` shape | found reviewing this ADR |
| `turbo.json` `"lint": {}` | a task | no package implements it | ADR-0019 |
| `ignorePatterns` under `--config` **pointing outside the scan root** | an ignore list | silently inert; even `**/sub/**` does not rescue it | ADR-0019 |
| `oxlint` **at warning severity** | a check | reports findings, exits 0 | ADR-0019 |
| `Button`/`Chip` `style` prop | public API, 12 call sites | destructured, never applied | #173, #176 |
| `prisma db seed` | a seed run | no-op, missing `prisma.seed` config | #111 |
| `smoke` CI job | caught the CORS gap | sent no `Origin` header | #107 |
| `?? screen.getByText(...)` | a tolerated alternative | unreachable; `getByText` throws | #153, F5 |

Two properties unite them, and both matter for the fix:

1. **The thing was declared but not connected.** Nothing was misconfigured or miscomputed; the wiring
   was simply absent, and absence produces no error.
2. **The check that should have caught it passed either way.** `curl` reads a non-exposed header
   happily. A test that imports the config it asserts proves `x ∈ x`. A job that runs `echo` reports
   success truthfully. In each case the observer could not distinguish "working" from "absent".

The second property is why these survive review. They are not subtle in hindsight — they are
*invisible to the instrument*, and the instrument reporting green is exactly what stops anyone
looking further.

**Two rows carry conditions, and how those conditions were found is itself the argument.** Reviewing
this ADR, Musti's first three attempts to reproduce the `ignorePatterns` row **contradicted it** — a
co-located config honours the ignore list correctly, and he was close to reporting the row as wrong.
Only when he tried the shape this repo actually runs, `--config` pointing outside the scan root, did
the file that should have been ignored get silently linted; even `**/sub/**` did not rescue it. The
`oxlint` row is likewise severity-dependent: it exits 0 at warning severity, and the reason it exits 1
here is that `correctness`/`suspicious` are configured as errors.

Watching it pass three times taught him nothing. Only breaking it **in the shape it actually runs**
found the gap — which is this ADR's own thesis, re-derived by someone trying to disprove its table.

Three of the nine were caught by luck or by a person happening to look twice. One — the `style` prop —
was caught by ADR-0019's linter **on its first run**, which is evidence that part of this class is
mechanically detectable and worth saying out loud.

## Decision

**A control is not established until it has been observed to fail.**

A **control** is anything whose purpose is to constrain, block, or guarantee: a CI job, a linter or
tool configuration, an ignore/allow list, a security header, an authorization check, a rate limit, a
regression test guarding a specific defect, a seed or migration step something else depends on.

**A pull request that adds or changes a control carries one line in its evidence block naming what was
broken and what failed as a result.**

```
- Control proof: removed `exposedHeaders` → `Cross-origin browser smoke` failed with
  "response.headers.get('content-disposition') was null"; restored → pass.
```

Without that line the control is **unproven**, and the reviewer treats it as absent. Passing is not
evidence; passing is the state the broken version was also in.

Two supporting rules, both already practised and neither new:

- **The proof runs where the control runs.** A CI gate is proven by a **red CI run**, not a red local
  run — ADR-0010 made the same point about tests that exist but run nowhere repeatable. A
  browser-enforced behaviour is proven in a **browser**, not in `curl` or Node `fetch`, neither of
  which enforces CORS at all.
- **A check states its expectation independently of what it checks.** A test that iterates the same
  array the implementation produces asserts nothing and passes for any value, including empty. Where
  the choice is duplication or tautology, take the duplication.

**Scope — the test is observable, not a judgement call.**

> **If deleting it would leave the existing suite green, it needs proving.**

Ordinary feature code is out: delete it and the suite goes red, because its tests are already the
proof. Demanding a mutation for every function would be ceremony.

This test replaces the first draft's, which defined a control by category ("constrain, block,
guarantee") and then tested it with "would the change still be correct without it". Those two
disagreed, and the review found the disagreement **using this ADR's own table against it**: the
`Button` `style` prop is not a control by the category definition, so the rule would not have caught
an instance the ADR itself cites. The replacement keys on the *instrument* rather than on a ruling
about correctness, which is the thesis of the whole document.

It also settles the ambiguous case the review predicted. `isValidSteuerId` is a control by category
and feature code by the correctness test — and correctly **in scope** by this one, since deleting it
leaves the suite green.

## Consequences

**Positive**

- The cheapest possible discipline against the most expensive class of bug here. Five of the nine
  instances would have been caught by one deliberate break each, taking minutes.
- It converts an existing informal habit into something checkable. The good runs already do this —
  a deliberately-dropped `exposedHeaders`, a removed `'DELETE'`, a planted lint violation, a stripped
  preflight trigger. What was missing is that skipping it left no trace.
- It gives the reviewer a specific question to ask instead of a general suspicion, which is the
  difference between a rule that is applied and one that is admired.

**Negative / accepted**

- **It costs time on every control-touching PR**, and the cost is real even when the control turns out
  fine. Accepted: the alternative is the table above.
- **Some controls are awkward to break** — a rate limit, a migration, anything with slow or stateful
  setup. Where a genuine break is impractical, the evidence line says so and states what was done
  instead. An honest "could not break this, here is why" is acceptable; silence is not.
- **A mutation proof proves the control fires, not that it fires on everything.** Planting one lint
  violation proves the linter reads files; it does not prove the ignore list is correct. The proof
  should target the property most likely to be silently absent — which is a judgement call, and this
  ADR does not pretend to remove it.

**Deliberately not decided here**

Whether to pursue the *static* half of this — lint rules or type-level constructions that make
"declared but not connected" unrepresentable. ADR-0019's linter already covers one instance of it
(unused-but-public props). Extending that is a separate cost decision and should not ride along
unargued.

## Alternatives considered

- **Rely on review to catch it.** What we were doing. Rejected on the evidence: these nine passed
  review precisely because the instrument said green, and a reviewer reading a diff cannot see that a
  passing check would also pass when broken.
- **Require a failing test for every change (mutation testing as a gate).** Rejected as
  disproportionate — it is the same idea applied to all code rather than to controls, and the cost
  scales with the codebase while the benefit concentrates in a small part of it.
- **Encode it as a checklist item in the process doc only.** Rejected for the reason ADR-0020 records:
  a load-bearing rule with no decision record behind it drifts, and the next reader cannot tell a
  decision from an edit.
- **Do nothing and accept the class as a cost of speed.** Defensible if the instances were cheap. They
  were not: two shipped to `main` (the CORS filename regression, the inert `style` prop), and one of
  those was found only because a merge conflict forced someone to look at the same line again.

## Amendment — 2026-08-04 (#258, #252, #239): break by deletion, and the exception that outlives its cause

Per the log's immutability rule (`docs/adr/index.md:5` — "never rewrite history"), the Decision above
stands unedited. This appends two rules that its own week of practice exposed. Both were learned from
controls that had a passing break-proof and a hole anyway.

### 1. Break by **deletion**, not only by corruption

The Decision says a control must be observed to fail. It does not say *how* to make it fail, and in
practice we almost always **corrupt a value** — change `expiresIn`, rename a key, write a wrong tier.
That tests only half of what a check does.

Most checks have two branches:

| Branch | Question | Broken by |
|---|---|---|
| **validity** | is the value it found acceptable? | corrupting the value |
| **existence** | is there a value there at all? | **deleting** it |

A check written as *"if a value is present, validate it"* is **vacuously satisfied by absence**. A
corruption proof goes red and certifies the control — while the missing case walks straight through.

**Measured, on this repo, the same day this was written.** `register-check`'s check 4 validates the
evidence tier in the register's `State` column. I proved it by corrupting one:

```
tier -> "green (bogus)"  -> FAIL: register.md:237/:238 tier "bogus" is not one of the declared tiers
restored                 -> PASS
```

Red on demand, restored clean — a textbook proof under the Decision above. But the sub-check only runs
once `state.match(/green\s*\(...\)/)` matches, so a `State` cell with **no tier at all** is skipped
silently. That is exactly how the defect arrived: a fix replaced two tier cells wholesale, both rows
lost their tier, `register-check` stayed green, and only re-reading the cells by hand caught it (#258
records the gap; #249 carried the regression).

**Rule.** A control proof breaks the subject by **removing** it wherever removal is meaningful — the
line, the marker, the citation, the list entry, the caller — and not only by making it wrong. Where
both are meaningful, both lines go in the evidence block:

```
- Control proof (validity): tier -> `green (bogus)` -> red; restored -> pass.
- Control proof (existence): tier removed entirely -> red; restored -> pass.
```

**Reviewer's test, one question:** *can this check pass on empty input?* If yes, the existence branch
is unproven and the control is unestablished, however green the corruption proof was.

**And confirm the break landed before reading the result.** A break that silently fails to take
produces a green run that reads as *"the control doesn't discriminate"* — the inverse error, and the
costlier one, because the remedy it invites is deleting a control that works. Two instances, two
hours apart, different causes, identical signature: one removal left a literal string that the
library's own regex still matched, so encryption kept running; one edit targeted a string that was
not in that branch's file at all, so nothing changed. Neither run was evidence of anything.

The guard is not *"watch for clever regexes"* — that only covers the first. It is **count what you
changed**, and say the number:

```
- Control proof (existence): tier removed -- break landed on 2 cells -> red; restored -> pass.
```

Verify the *state*, not the test outcome: is there plaintext in the database now, did the row lose
its marker, is the string gone. A break you did not confirm is a run you cannot read in either
direction.

This is the operational half of a more general shape: most of our escapes this week were **existence
claims checked as validity claims** — a missing tier, a missing caller, a missing route in a disabled
list, a missing marker, an unparseable date treated as an age. The fix is never a better pattern; it
is the reversed quantifier. Deletion is how you find out which kind you have.

### 2. An exception that outlives its cause is not caution — it is a blind spot

A suppression — `adr-check-ignore`, an `ignorePatterns` entry, a skipped test, an allowlist entry —
is written against a *specific* cause. When that cause is removed, the suppression does not become
harmless. **It silently removes the check's reach over whatever it still covers**, and it reads to the
next person as deliberate care.

**Measured (#252).** Two `adr-check-ignore` markers in `docs/adr/index.md` suppressed findings about
prose describing dangling ADR references. Both causes were later removed by other work: one token was
deleted outright (#260), the other's ADR came into existence (#251). The markers were then dropped.
Planting a genuinely broken reference in that file afterwards:

```
as-is                                    -> adr-check: PASS
a reference to a non-existent 4-digit
ADR number planted in index.md           -> FAIL: index.md:63 references <that number>,
                                                  which has no docs/adr/<that number>-*.md file
restored                                 -> PASS
```

(The planted number is described rather than written out. `adr-check` matches `/ADR-(\d{4})\b/`
across the whole tree, so spelling it here would make this very document fail the gate it is
describing — the same reason #260 deleted an offending token instead of masking the sentence
around it, per rule 2 above. Removing the cause beats suppressing the symptom, including here.)

Keeping the markers would have masked precisely that. **The cautious-looking option was the unsafe
one.**

**Rule.** A suppression carries, in the same place, the **cause** it exists for. When that cause is
resolved, the suppression is **deleted in the same change** — not left "just in case". A suppression
whose cause cannot be stated is already a finding. And prefer removing the *cause* to suppressing the
*symptom*: #260 deleted the offending token rather than masking the sentence, which is why #252 needed
no marker at all.

**Reviewer's test:** for every suppression a diff adds or keeps — *what would go red without it, and
is that still true?* If nobody can answer, it is not protecting anything.

### 3. An instrument that perturbs what it measures proves nothing

The Decision already says a check must state its expectation independently of what it checks. Its twin,
found three separate times in one day, is that the **measuring apparatus must not alter the thing under
measurement, or the run after it**.

Three independent instances, 2026-08-04:

| Instance | How the instrument corrupted the measurement |
|---|---|
| #239 F3 (frontend) | Spying on `clearTimeout` changed the object identity `vitest` checks when restoring, so `vi.useRealTimers()` silently failed and **every later test in the file ran on a fake clock** |
| #239 T1 harness | A leaked **phantom session** (better-auth's `autoSignIn` minting a real `Session` row for an out-of-band call) turned "the non-current row" into an ambiguous choice between two non-current rows — which is what made a **position-based** selector revoke the wrong session. One state leak, one consequence; not two faults |
| #261 (docs) | A regenerated SVG compared only against itself: "identical twice" with no baseline says the renderer is deterministic, not that the output was ever right |
| #263 calibration | The calibration for `sampleComputedStyleOverFrames` sampled one layer over 8 frames — a window narrower than the Node↔browser jitter it had to see through. It flaked 1 run in 4: the rig meant to certify an instrument was itself unreliable |

**Four instances, four different ways to be wrong** — perturbation, state leakage, no reference
point, and too narrow a sampling window. The shared property is not the mechanism: it is that in every
case the instrument's *reading* was trusted before the instrument was.

**Rule.** Prefer the framework's own reported state over reaching into its internals — `vi.getTimerCount()`
over a global spy on a timer primitive. Where an instrument must be invasive, its blast radius is
established explicitly: assert the environment is restored, or scope it so the next measurement cannot
inherit it. And an instrument gets a **known-state calibration** — a reading where the answer is known
good and one where it is known bad — before its readings are used as evidence.

**Reviewer's test:** *would this instrument report the same thing if the subject were absent, and does
it leave the next run in the state it found?*

One named consequence, from the #239 harness: **positional selection is not robust against state
leaks.** "The row that isn't the current one" is a claim about the *set*, and any leaked row makes it
ambiguous without making it look ambiguous. Select on an identifying property, not a position, wherever
the set can grow behind you.

Corollary, from all three: **audit the instrument before attributing the reading to the product.** Every
instance above was found by the person operating the instrument, against their own work, before anything
was filed against the code under test. That is the expensive habit worth keeping.

### Consequences

- Evidence blocks get one extra line where the existence branch is meaningful. Cheap; it is one more
  edit and one more run of a check that already exists.
- Some existing controls are, by this amendment, **unproven** — their proofs corrupted and never
  deleted. They are not retroactively broken; they are retroactively *unverified*, and the honest
  handling is to say so when one is next touched rather than to re-prove the whole inventory now.
- This amendment does not close #258. That gap is check 4's inability to see a missing tier, and it
  needs a code change, not a rule. This says how the gap would have been found.

## Amendment — 2026-08-11 (#336, #340, #341): four more ways a proof is not one

Per the log's immutability rule (`docs/adr/index.md:5`), the Decision and the 2026-08-04 amendment
above stand unedited. This appends four rules, continuing that amendment's numbering (§1–§3 are
already cited elsewhere in the tree). Each comes from a control that had a passing test, or a passing
proof, and a hole anyway — found in one review round across three pull requests.

### 4. A proof **expires** when the code it was run against moves

The Decision says a control must be observed to fail. It says nothing about how long that observation
remains true. In practice a proof is written once, in a PR, against a named function — and the next
refactor deletes that function while the proof line lives on in the record, still reading as evidence.

**Measured (#341).** #318 proved P1 and P2 against `needsGewerbeGate` and `isTerminalGate`. #341
deleted both outright, replacing them with a generic `walk`/`countRemaining` engine driven by
`QUESTIONS['job'].followUps`. The old evidence lines named two functions that no longer exist
anywhere in the tree. #341's author re-ran both against the relocated shape rather than inheriting
them — **13 red for P1, 13 red for P2**, restored to 101/101 — and I reproduced both numbers
independently at review.

That was voluntary. It should not be.

**Rule.** When a change **relocates, renames, or restructures** the code a control's proof was run
against, that proof is **void**. The change's own evidence block either re-states it against the new
shape, with a fresh observed result, or says plainly that the control is now unproven. A proof is a
statement about a **code shape**, not about a name.

**Reviewer's test, one question:** *does the evidence line name a function, file, or line that this
diff still contains?*

#### 4a. A reason the control would fail is not an observation that it did

The 2026-08-04 amendment accepts an honest *"could not break this, here is why"*. It does not accept
a third thing, which is what actually turns up: an **argument for the control's correctness**, placed
in the slot reserved for the result of breaking it.

**Measured (#341).** The evidence block read: *"removing that specific check (not exercised in this
evidence line, but the code path is isolated and single-purpose) is what the existence half asks
reviewers to check for."* The check was in fact breakable in about thirty seconds — neutralised at
`interview.ts:383`, one site, **1 test red**, restored to 55/55. The control was real. **That is not
the point.** Nobody knew it was real, and the reader of the evidence block could not tell an
unbroken-because-obvious control from an unbroken-because-absent one, which is the exact distinction
this ADR exists to preserve.

**Rule.** An evidence line contains **either** an observed result **or** an explicit statement that
the break was not attempted *and why it could not be*. "It is obviously fine" is neither. Where a
break is cheap, the cost of arguing about it exceeds the cost of running it.

### 5. An expectation that equals the **loading or default value** passes before the behaviour happens

**Measured (#336, F11/F12).** Two hook tests asserted the value the hook holds at `t = 0` — its
loading state — as though it were the answer. The assertion is satisfied **before the code under test
has run**, and stays satisfied for a hook that does nothing at all. F12 was found **inside the fix for
F11**: the same trap re-entered while repairing an instance of it.

The shape is easy to miss precisely because it reads as careful: an explicit expected value, named,
not a truthiness check. It happens to be the value that was already there.

**Rule.** An expectation must **differ from the value the subject holds before the behaviour under
test occurs**. Where the two coincide, either wait for a transition that is itself observable, or
assert a value the default cannot be.

**Reviewer's test:** *what is this value before the code runs, and is that what I am asserting?*

**Corollary, from F12 being inside F11's fix:** this trap is re-entered most often **while fixing an
instance of it**, because the repair is written in the same file, in the same frame of mind, minutes
later. A fix for a bad assertion deserves the same question the original failed.

### 6. An expectation **recomputed from the source the code reads** proves arithmetic, not correctness

**Measured (#340, F1).** `tarif.test.ts`'s expected tax amounts were hand-derived — genuinely by
hand, genuinely not by calling the function — from the same § 32a coefficient table `tarif.ts` reads.
Replacing 2025's coefficients with 2024's **verbatim** and rederiving every literal from them left the
suite **36/36 green**, including the test written specifically to catch a copy-pasted table.

This is not the naive tautology the Decision already forbids: nothing re-ran the implementation to
produce its own expectation. The shared origin sits **one level up**, in the data both the code and
the arithmetic read. Both are then wrong together, in agreement, silently.

**Rule.** The question to ask of an expected value is not *"did I compute this independently of the
code?"* but:

> **"Could this expectation still be produced if the thing I am least sure about were wrong?"**

Where the answer is yes, the suite is blind to that thing, however much arithmetic sits in front of
it. Where a table of published constants is involved, at least one expectation is an independently
**published** value carrying a citation, not a recomputation.

#### 6a. The same shape over a **value set** — growing the set is invisible

**Measured (#341, F1).** `QUESTIONS['job'].followUps` declares which `job` answers open the Gewerbe
gate; the tests name members of `JOB_VALUES` one at a time. Adding a fifth member —
`'Werkstudent mit Gewerbe'` — leaves the suite **55/55 green** while that answer walks straight past
the gate. The expectations are bounded by the same set the code reads, so **growth in the set is
invisible to them**, exactly as a wrong table was invisible above.

This one also flipped a default. The predicate it replaced was a **deny-list**
(`job !== 'Angestellt' && job !== 'Rente'`, so an unknown value *gated*); the declaration that replaced
it is an **allow-list** (an unknown value *does not*). Measured over the full answer space: 445
divergences from the previous behaviour in 1350 combinations, **every one of them on an undeclared
value, none on a declared one** — which is why every existing test stayed green.

**Rule.** Where a control is keyed on a value set, at least one assertion is about **the set**: every
member is classified, and an unclassified member **fails**. Asserting members one at a time proves the
members, and the next one added is not among them.

**And when a refactor changes how a decision is expressed** — predicate to declaration, deny-list to
allow-list, imperative to table — the question is not whether the declared cases still behave the
same. It is: *what happens to the cases neither form mentions, and which way does the new default
lean?* For anything that gates, the answer has to be **closed**.

### 7. A convention that only **review** enforces is not a control

This is the Decision's own thesis turned on the ADR log itself, and it is the uncomfortable one.

ADR-0033 § *"Citation form, so this class of error stops"* settled the three-digit product log versus
four-digit engineering log ambiguity on 2026-08-08. In the week that followed, the conflation recurred
**five times, in four files, across three of the four crew members** — twice in code that also cites
the four-digit form of the *same* number a few lines away, and once in a file already on `main`.

Every instance was caught at review. **That is the failure, not the success.** Review caught them one
at a time, after the code was written, five times running, and did so only because a reviewer happened
to look twice at a citation. There are roughly **180 bare three-digit citations across 50 files**
outside the product log today; nobody knows how many are wrong.

A rule whose only instrument is a human reading a diff **cannot distinguish "honoured" from "absent"**,
and the instrument reports green either way. That is this document's own definition of the defect
class, and an ADR is not exempt from it.

**Rule.** A convention stated in an ADR and enforced by nothing gets a **mechanical gate**, or an
explicit note in that ADR that it is unenforced and will drift. Restating it a second time, more
firmly, is not a remedy — restating it is what already failed.

**Reviewer's test:** *if everyone ignored this rule tomorrow, what would go red?*

#### 7a. Documenting a gap is not closing it — and the instrument that can only see one tree

§7 was filed at 17:23 on 2026-08-11. **Ten minutes later it produced a second instance, of a
different kind, which is why it earns its own sub-section rather than a line in the table.**

Two open pull requests each allocated decision number **0034** — this document's companion
(`0034-veranlagungsartenvergleich-…`, PR #343) and the account-keyed rate limiter (PR #339). `main`
carried neither; the highest number there was 0033. ADR numbers are allocated by whoever writes one,
by reading the directory, with **no reservation step and no cross-branch view**.

**Measured, all three states:**

| Tree | `adr-check` |
|---|---|
| PR #343 alone | `PASS — no findings.` |
| PR #339 alone | `PASS — no findings.` |
| the two merged into one tree | `FAIL — ADR-0034 is used by more than one file: …` |

**The check is correct and sufficient. What fails is its field of view.** It validates a single
working tree, and the defect does not exist in any single working tree — it exists only in the union,
which nothing computes.

And here is the part that makes this a §7 instance rather than a missing feature. **The gap was
already written down, in detail, in the checker's own header** — the merge-ref mechanism, and its
limit (a): GitHub only publishes `refs/pull/N/merge` for a *cleanly mergeable* PR, and *"two branches
that both append a row to `docs/adr/index.md` … are exactly the ones likely to conflict on that file
first, before the two ADR numbers are ever compared."* That prose was written after #239/#251 hit the
identical collision on decision number 0023.

I confirmed the predicted mechanism rather than assuming it: merging the two branches conflicts, and
the conflicted path is exactly **`docs/adr/index.md`** and nothing else. So no merge ref was
published, `actions/checkout` had no union to resolve, and the compensating mechanism never ran — the
documented limit firing exactly as documented, on its second recorded occurrence.

> **A gap that is written down, precisely, with a worked precedent, and enforced by nothing, is still
> enforced by nothing.** Careful prose about a hole reads as diligence and behaves as absence. That is
> §7's own thesis applied to §7's own evidence, and it is the strongest form of the argument this
> document has produced.

**Consequence for the sized work §7 defers.** This is a **different shape of check** from the
citation-form grep, and scoping them as one job would be a mistake. The citation rule is a pattern
match over one tree and needs nothing else. This one cannot be answered from a tree at all: it needs
either a comparison against **the merge target's** ADR set, or an **allocation record** that a number
is claimed before a file exists. Whether a cheap version exists is a real question and not a
foregone one — it is being asked rather than assumed.

**Reviewer's test, the general form:** *is the property this check asserts a property of one tree?* If
the defect can only appear when two independently-valid trees meet, a single-tree instrument cannot
see it, however correct the instrument is.

**Resolution of this instance, for the record.** #339 renumbers to the next free number (0035); #343
keeps 0034, because it was opened first and `tarif.ts` is being written against that number as this is
written. Renumbering the one that code already cites would trade a documentation collision for a code
one.

*(The two colliding numbers are written out here because both now resolve to real files. Where a
number does **not** resolve — the next-free one above — it is deliberately spelled without its prefix,
for the reason the 2026-08-04 amendment gives about its own planted reference: this document is inside
the tree its own gate scans.)*

**Applied to the instance that produced it.** `adr-check` gains a rule flagging a three-digit
`ADR-NNN` reference that is not prefixed `Produkt-`, outside the product log's own path. **Not in this
PR**, and the reason matters rather than being an excuse: the ~180 existing sites need reading
individually, because several are genuine *misattributions* — the four-digit engineering decision was
meant — and a blind prefix insertion would cement the wrong citation permanently under a gate that
then calls it correct. It is filed as its own work against this amendment, with an owner, which is
what §7 asks for; it is not a deferral, and this note is the record that the rule currently has no
instrument.

### Consequences

- **Evidence blocks get shorter, not longer.** §4a removes the option of arguing, which is the
  expensive half; running the break is usually the cheap half.
- **Some controls proven before today are, by §4, unproven** — any whose proof named code that has
  since been restructured. As with the 2026-08-04 amendment: not retroactively broken, retroactively
  *unverified*, and the honest handling is to say so when one is next touched.
- **§6 and §6a will occasionally demand a citation this project cannot fetch.** Where the primary
  source is unreachable, the honest form is the one #340 already uses — state the caveat, name what
  the check does and does not establish, and do not let a self-consistency check be reported as a
  verification.
- **§7 costs a gate per convention, and this project will not always pay it.** The rule permits
  saying so out loud instead, which is worth more than a rule nobody follows: an ADR that admits it is
  unenforced tells the next reader what to expect. An ADR that does not, does not.
- **§7a splits the deferred gate work into two jobs, not one.** A single-tree pattern match
  (citation form) and a cross-tree or allocation-record check (number collision) share a motivation
  and nothing else. Sizing them together would produce an estimate for the cheap half and a surprise
  in the expensive one.
- **§7a is deliberately uncomfortable about this document's own genre.** Both of its instances were
  produced *by* careful writing — a citation rule that was written down and then broken five times, and
  a limit that was written down and then hit twice. Neither is an argument against writing things
  down. Both are an argument against counting it as done.
