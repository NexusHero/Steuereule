# ADR-0034 — The Veranlagungsartenvergleich returns a bounded comparison, never a bare verdict — and it is not a Günstigerprüfung

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** Musti (lead) — an engineering contract call, settling **F3** held open on the §4
  review of [#340](https://github.com/NexusHero/Steuereule/pull/340) ("This is the piece I will settle
  in the ADR… do not rebuild this half until that lands").
- **Applies** [ADR-0032](0032-nothing-on-screen-promises-what-the-slice-does-not-deliver.md) (the
  honesty principle) at a **module boundary** rather than at a screen, and
  [ADR-0004](0004-testing-strategy.md) (pure, I/O-free logic in `packages/core`).
- **Applies** [ADR-0033](0033-the-question-graph-lives-in-packages-core.md) § *"Citation form, so this
  class of error stops"* — which is also half of what this decision is about.
- **Context tags:** architecture, determinism boundary, honesty principle, tax computation

## Context

Two problems, one function. `packages/core/src/tarif.ts` (#340, the N strand of #321) computes the
comparison between **Einzelveranlagung** and **Zusammenveranlagung** and returns, alongside the two
amounts, a field named `empfehlung`.

### 1. The verdict outruns its evidence, and it does so at the API boundary

Measured on #340's head: `empfehlung` is emitted in identical form at `delta = 1 €` and at
`delta = −1449 €`. The module's own header names three factors it does **not** compute —
Solidaritätszuschlag, Kirchensteuer, Progressionsvorbehalt — and states correctly that each can flip
which Veranlagung wins.

That honesty is real and it is entirely in the comments. What crosses the module boundary is a field
called `empfehlung` from a function documented as *the Günstigerprüfung*, with no attached limit. A
caller cannot distinguish a coin-flip from a clear answer, because the return value does not carry the
difference.

ADR-0032 was written about screens. It has to bind here too: a screen can only promise what it is
handed, and a module that manufactures an unqualified claim has already spent the credibility before
any screen is written. **The rule binds where the claim is made, not only where it is rendered.**

Magnitude, so this is a measurement and not a feeling. Kirchensteuer is 8–9 % of the assessed income
tax; Solidaritätszuschlag is 5.5 % of it above the Freigrenze. Both are surcharges **on an ESt that
differs between the two Veranlagungen**, so their contribution to the delta is of the order of tens to
hundreds of euro at ordinary incomes. A delta of 1 € is inside that band. So is a delta of 100 €.
Progressionsvorbehalt is worse: with Lohnersatzleistungen in play it is unbounded from the inputs this
module has.

### 2. The name is already taken, in the other log, for a different comparison

**Günstigerprüfung** in this product's vocabulary is **Produkt-ADR-032**'s sense — § 32d Abs. 6 EStG,
Abgeltungsteuer on Kapitalerträge against the personal tariff rate. What `tarif.ts` performs is the
§ 26 / § 26a / § 26b comparison of **assessment types**.

Two different comparisons, both of which a German speaker would describe as "checking which is
cheaper". The collision is **scheduled, not hypothetical**: #341 already declares the `einkuenfte` →
`kap-depot` branch that Produkt-ADR-032's Kapitalerträge slice will hang off, and that slice needs the
word *Günstigerprüfung* for its own, correct meaning.

The correct term for what this function does is **Veranlagungsartenvergleich**.

This is the same conflation ADR-0033 § *Citation form* was written against, one level up: there it was
two **ADR logs** sharing a number, here it is two **decisions** sharing a word.

## Decision

### 1. The function is `veranlagungsartenvergleich`; *Günstigerprüfung* is reserved

`veranlagungsartenvergleich` names the § 26 comparison, in code, in tests, and in prose. The term
**Günstigerprüfung** is reserved for Produkt-ADR-032's § 32d Abs. 6 comparison and is not used for
anything else in this repository.

Kaan's provisional prose rename on #340 was the right call and is hereby confirmed rather than
provisional — see *Consequences*.

### 2. No verdict travels without its own margin, and the **type** enforces it

The return value is a discriminated union. `empfehlung` **survives as a field, but only inside the one
variant that has earned it**:

```ts
export type Unschaerfe =
  | { readonly kind: 'bestimmt'; readonly obergrenze: number }
  | { readonly kind: 'unbestimmt'; readonly grund: 'progressionsvorbehalt-nicht-eingegeben' }

export type Veranlagungsartenvergleich =
  | { readonly aussage: 'eindeutig'; readonly empfehlung: 'einzel' | 'zusammen'
      readonly einzel: number; readonly zusammen: number; readonly delta: number
      readonly unschaerfe: Unschaerfe }
  | { readonly aussage: 'zu-knapp'
      readonly einzel: number; readonly zusammen: number; readonly delta: number
      readonly unschaerfe: Unschaerfe }
  | { readonly aussage: 'unbestimmt'
      readonly einzel: number; readonly zusammen: number; readonly delta: number
      readonly unschaerfe: Unschaerfe }
```

Not an optional `empfehlung?`, not a nullable one, and not a top-level `empfehlung` beside a
`konfidenz` field the caller may ignore. **A caller that wants the verdict must read `aussage` first,
and the compiler refuses the shortcut.**

This is deliberately the same instinct as ADR-0031 § 4 as built in #341: the thing that must not be
skipped is made *unrepresentable to skip*, rather than written down as a rule someone has to remember.
A caveat in a doc comment is exactly the control ADR-0021 says is not one — it cannot fail.

### 3. The margin is **computed**, not chosen

`unschaerfe` is a bound on how far the excluded factors could move `delta`. It is **derived from the
two computed ESt amounts**, never a threshold picked by feel.

- **Solidaritätszuschlag and Kirchensteuer** are surcharges *on the assessed income tax*. Given
  `einzel` and `zusammen`, an upper bound on their contribution to the delta is arithmetic over
  numbers this module already holds.
- **Progressionsvorbehalt** is **not** boundable from zvE alone: arbitrary Lohnersatzleistungen move
  it arbitrarily. While that input is absent, `unschaerfe` is `unbestimmt`, and `aussage` **can never
  be `eindeutig`**.

`aussage` is `'eindeutig'` **only** when `unschaerfe.kind === 'bestimmt' && |delta| >
unschaerfe.obergrenze`.

The point of ruling it this way is that **there is no magic number anywhere in the module, and nobody
has to defend one.** A chosen threshold — 50 €, 200 € — would be a product decision wearing an
engineering costume, and the first person asked to justify it could not.

### 4. What a caller is entitled to conclude

| From | Entitled to conclude | **Not** entitled to conclude |
|---|---|---|
| `einzel`, `zusammen` | the § 32a tariff on the two zvE handed in, exact to the euro | that the zvE handed in is the right figure — accuracy layer 3 is still open (#321 § A) |
| `delta` | the exact tariff difference **for those zvE** | the difference in what the user actually pays |
| `aussage: 'eindeutig'` + `empfehlung` | this Veranlagung wins **by more than the excluded factors could move it** | that it wins *by* `delta` |
| `aussage: 'zu-knapp'` | the tariff difference is inside the noise floor of what we do not compute | that the two are equal, or that it does not matter |
| `aussage: 'unbestimmt'` | we cannot bound the error at all | anything whatsoever about which wins |

## Consequences

- **Today, the honest answer is usually "we cannot say."** Until Soli and Kirchensteuer are computed
  and Progressionsvorbehalt is an input, most real inputs return `unbestimmt`. That is the correct
  output of a module that excludes three flip-capable factors, and it is a **gate, not a defect**: no
  screen renders this comparison until at least one real input path can reach `eindeutig`. It also
  turns the missing work into something a ticket can be written against, which a doc comment never
  does.
- **`Veranlagung.jsx:60`'s promise stays out**, on the same reasoning #340 already reached. The
  sentence *"Kippt das (z. B. durch Lohnersatz mit Progressionsvorbehalt), sagen wir es dir hier
  zuerst"* is a claim to detect the flip; the module cannot yet see the thing that causes it.
- **The three accuracy layers of `tarif.ts` are unaffected.** Layer 1 (`incomeTax` exact per zvE) and
  layer 2 (the comparison exact given two zvE) both still hold and are still claimed. This ADR governs
  only what layer 2's *result* is allowed to assert.
- **One rename lands across `tarif.ts`, its tests, and any prose.** Cheap now; it would not be cheap
  after the Kapitalerträge slice has its own `guenstigerpruefung`.
- **`empfehlung` is not deleted**, which was the alternative — see below.

## Open — the stakeholder's call, not mine

Whether the product **shows** a *"zu knapp, um das zu sagen"* state to the user, or simply does not
offer the comparison until it can answer, is a screen-commitment question under ADR-0032 and belongs
to NexusHero. It is raised, not assumed.

This ADR fixes the module's contract either way: the screen ruling changes what is rendered, not what
is returned. `zu-knapp` and `unbestimmt` remain distinct in the return value regardless, because
"inside the noise floor" and "we cannot measure the noise floor" are different facts and collapsing
them would be the same defect one level down.

## Alternatives considered

- **Keep a top-level `empfehlung` and add a `konfidenz` / `aussagekraft` field beside it.** Rejected:
  it is the current defect with more fields. The honest half stays optional to read, and the field
  named `empfehlung` is still the one a caller reaches for first.
- **Delete `empfehlung` entirely; return only `einzel`, `zusammen`, `delta`.** Tempting, and rejected.
  It pushes the "is this delta meaningful?" decision into every caller, which is precisely the drift
  the `isValidSteuerId` precedent exists against — one definition, imported by both sides. The
  threshold is a property of what the module excludes, so it belongs to the module.
- **Pick a fixed noise-floor constant (e.g. 200 €) and emit `empfehlung` above it.** Rejected: nobody
  can defend the number, and it would be wrong in both directions — far too small at high incomes
  where Kirchensteuer alone exceeds it, needlessly large at low ones. Rule 3 removes the question
  instead of answering it badly.
- **Leave the shape alone and document the caveat harder in the header.** Rejected on ADR-0021's
  thesis: a caveat that a caller can ignore without anything failing is not a control. The header on
  #340 was already excellent and it still let a bare verdict cross the boundary.
- **Keep the name *Günstigerprüfung* and disambiguate by context.** Rejected. It is the same bet the
  three-digit/four-digit ADR numbering lost five times in one week; a name that needs its context to
  be read correctly will eventually be read without it.
