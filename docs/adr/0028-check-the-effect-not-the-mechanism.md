# ADR-0028 — Check the effect, not the mechanism: the pre-Prisma environment snapshot

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Musti (technical direction on #284); the stakeholder for the two questions this ADR
  deliberately leaves open
- **Builds on** [ADR-0021](0021-controls-are-proven-by-breaking-them.md) — *A control is proven by
  breaking it, not by watching it pass* — whose thesis this document is a second, independent
  instance of, arrived at from the opposite direction: 0021 asks how you know a control fires; this
  one asks what a control should aim at so that the question is answerable at all. Also builds on
  [ADR-0010](0010-ci-postgres-and-boot-smoke.md) — *Postgres in CI: service-container for the
  test/smoke jobs*.
- **Constrains** the values guarded by [ADR-0007](0007-authentication.md)
  (`GUEST_SESSION_SECRET`), [ADR-0008](0008-profile-persistence-encryption.md)
  (`PRISMA_FIELD_ENCRYPTION_KEY`) and [ADR-0011](0011-cors-credentialed-cross-origin.md)
  (`CORS_ALLOWED_ORIGINS`).
- **Context tags:** security, configuration, boot

## Context

Importing `@prisma/client` merges the schema-adjacent `apps/api/.env` into `process.env` **as an
import side effect**, at module-evaluation time — strictly before the body of `bootstrap()` runs.
Measured against Prisma 6.19.3 on #275/#284, all seven of:

`DATABASE_URL`, `GUEST_SESSION_SECRET`, `PRISMA_FIELD_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `CORS_ALLOWED_ORIGINS`, `PORT`.

`apps/api/src/main.ts` imports `./app.module.js`, that chain reaches `PrismaService` and through it
`@prisma/client`. **No guard placed inside `bootstrap()` can observe the environment as the operator
supplied it.**

Two properties bound the hazard, both measured rather than assumed:

- **The loader is fill-only.** It never overwrites. A correctly configured deployment is unaffected —
  operator values survive byte-for-byte, which is also what lets a guard and the app it protects read
  one identical string (#275 F7). The exposure is the *under*-configured case: whatever the operator
  forgot is what the file quietly supplies, and every fail-closed check then reports success.
- **The merge needs the file to be readable at import time.** No file, no merge, whatever was baked.
  This closes the container path independently (`.dockerignore` excludes `.env`).

Why that is T1 rather than a curiosity: these are precisely the values whose *absence* the
production checks exist to catch. And `CORS_ALLOWED_ORIGINS` inverts the failure mode — a stray file
does not slip past a refusal, it **grants credentialed cross-origin access to origins nobody chose
for that environment**.

### The part worth recording: the check target was wrong three times

This is the knowledge that would otherwise live only in a PR thread, and it is more valuable than the
decision it produced.

| Attempt | The check | Why it was wrong |
|---|---|---|
| 1 | Is there a `.env` on disk next to the schema? | Tests only the second conjunct. A file beside a client generated *without* one merges nothing — a wrongful refusal of a configuration measured to work. |
| 2 | Is the generated client's baked `schemaEnvPath` non-null? | Tests only the first conjunct. A baked path whose file has since been removed merges nothing — the same wrongful refusal, mirrored. |
| 3 | Both conjuncts together. | Correct as a predicate, and **still wrong as a control.** `schemaEnvPath` is *absent as a key* on a client generated without a schema-adjacent `.env` — a normal, correct, common state. So `if (schemaEnvPath && fileReadable)` reads `undefined` and passes, and **cannot distinguish "correctly generated, genuinely safe" from "Prisma renamed the field and I am blind."** Both are `undefined`. Both pass silently. |

Attempt 3 is the interesting failure, and it is [ADR-0021](0021-controls-are-proven-by-breaking-them.md)'s
class exactly: an instrument that cannot tell working from absent. It also made the safeguard demanded
alongside it — *"a test that goes loudly red if the field disappears"* — **unsatisfiable in principle**,
because absence is legitimate, so "field absent" would fire on every correct generation. A requirement
that cannot be met is a signal to drop the target it was defending, not to weaken the requirement.

The pattern behind all three, named so there is not a fourth: **each check aimed at something
*upstream* of the hazard rather than at the hazard.** Reading a dependency's internal to predict that
dependency's behaviour shares a failure mode with the thing it checks.

## Decision

### 1. The control checks the effect

Capture which guarded names are present in `process.env` **at the first evaluated module of the entry
point**, compare against the live environment in `bootstrap()`, and under `NODE_ENV=production` refuse
to start if a guarded name materialised that the operator did not supply.

- It distinguishes *"came from the environment"* from *"came from a file"* **definitionally**, not by
  proxy.
- It reads **no undocumented internal**, so the `schemaEnvPath` safeguard requirement dissolves rather
  than needing a test nobody can write.
- It produces no wrongful rejection: the loader is fill-only, so a fully configured deployment has
  nothing appear and never trips.
- It catches import-time environment mutation from **any** dependency, not only Prisma's.

The refusal names **variable names and the likely source file, never values** — the same rule as
`describeDatabaseTarget`. A guard that writes secrets into container logs is a worse defect than the
one it catches.

### 2. The ordering invariant is load-bearing, and that is acceptable *because a test can see it*

The snapshot only means anything if its module is evaluated before anything reaches
`@prisma/client`. `main.ts` therefore imports it **first**, deliberately breaking that file's
otherwise-alphabetical import order (`./app.module.js` would sort first). Nothing enforces this:
`.oxlintrc.json` has no import-sort rule today.

![Boot ordering](0028-boot-env-snapshot-ordering.svg)

*(source: [`0028-boot-env-snapshot-ordering.puml`](0028-boot-env-snapshot-ordering.puml))*

This is a genuine weakness, and it is stated rather than minimised. **What decides it against the
alternative is not that it is weaker — it is that it is *observable*:**

| | `schemaEnvPath` | the snapshot |
|---|---|---|
| Blind state | key absent | ordering broken |
| Safe state | key absent | ordering intact |
| Can a test tell them apart? | **No** — same observation | **Yes** — no refusal fires where one is owed |

That asymmetry is the whole argument. A weakness a test can observe is a weakness under control; a
weakness that presents identically to correctness is not.

Accordingly the invariant carries a control proof under ADR-0021: an entry point **derived from the
real `main.ts`** with the snapshot import moved below `./app.module.js`, asserted to go blind.
Verified in review by two independent mutations of the real file — moving the import, and inserting a
Prisma-reaching import above it — the second of which is the likelier real-world regression and is
caught by the acceptance case's own assertion.

### 3. Scope

The guard runs in `bootstrap()`, ahead of `assertDatabaseReachable()` — cheap-check-first, and
specifically so that a leaked `DATABASE_URL` is reported as *this* finding rather than dialled first.

`buildApp()` stays untouched: the contract that building the app never needs a live database or a
configured environment is shared by tests and `scripts/generate-openapi-spec.ts`, and only the real,
request-serving process may assume otherwise.

Outside production the guard is a **no-op by design**, even when names did arrive. The merge is what
lets a guard and the app read one identical string, and refusing it in dev would break the documented
`cp .env.example .env` setup for zero correctness gain.

### 4. The general rule

> **Check the effect you care about, not the mechanism that produces it** — and most of all not an
> undocumented internal of a dependency, because then the check shares a failure mode with the thing
> it checks.

With the corollary that decided §2:

> **Prefer a weakness a test can observe over a weakness it cannot.** Both candidates here had one.
> Only one of them was visible.

## The gap this ADR records rather than closes

The guard is gated on `env.NODE_ENV !== 'production'`, read from the **live** environment — the same
object the merge has already written into. So an operator who forgets `NODE_ENV`, on a machine whose
stray `.env` carries `NODE_ENV=development`, switches this guard off in the same breath it exists to
catch.

And it does not switch off alone. Every production gate in `apps/api` reads the same live value —
enumerated here rather than sampled, because the size of the set is the argument:

| Check | Where | What the non-production fallback is |
|---|---|---|
| `assertEnvNotFileSourced` | `config/assert-env-not-file-sourced.ts` | no-op (this ADR) |
| `resolveFieldEncryptionKey` | `prisma/field-encryption-key.ts:29` | a fixed, guessable encryption key ([0008](0008-profile-persistence-encryption.md)) |
| `resolveGuestSessionSecret` | `auth/guest-session.ts:58` | a fixed, guessable HMAC secret ([0007](0007-authentication.md)) |
| `resolveBetterAuthSecret` | `auth/better-auth.ts:213` | a fixed, guessable secret ([0009](0009-better-auth-as-auth-server.md)) |
| `resolveBetterAuthUrl` | `auth/better-auth.ts:226` | `http://localhost:3000` |
| `resolveWebAppUrl` | `auth/better-auth.ts:247` | `http://localhost:8081` |
| `resolveGoogleClientId` / `…Secret` | `auth/better-auth.ts:263`, `:274` | dev-only placeholder credentials |
| `resolveTrustedProxies` | `config/trusted-proxies.ts:103` | the permissive development list |

**Nine gates, one variable, all of them dropping to their fallbacks together and silently.** That
`DATABASE_URL` deliberately does *not* gate on `NODE_ENV` (`config/database-url.ts:8`) is the one
place this repo already made the opposite choice, and its reasoning is the seed of the answer.

This is **pre-existing and wider than #284** — it predates this control and is not created by it.
It is recorded here rather than closed because the fix is a deployment/architecture question, not a
local one: any of "derive production-ness from something the process cannot be told a lie about",
"read `NODE_ENV` from the pre-Prisma snapshot" (which would break today's working
`.env`-supplied-`NODE_ENV` deployments), or "fail closed when `NODE_ENV` is unset at all" changes how
every environment is configured. **That is the stakeholder's call, via `ask-matt`, not this ADR's.**

Stating it here is the point: a limit that is not written down reads as a limit that does not exist,
and this control is otherwise thorough enough about its own blind spots to make the omission
misleading.

## Consequences

**Positive**

- The invisible becomes loud, at minimal blast radius, without touching the configuration seam. No
  `resolve*(env)` changes; the merge itself is untouched.
- The control outlives Prisma's internals. A rename, a refactor, or a different dependency entirely
  changes nothing about what it observes.
- It generalises past this bug: any import-time environment mutation from any dependency now trips it.

**Negative / accepted**

- **An unenforced ordering invariant in `main.ts`.** Accepted on the strength of §2's asymmetry, and
  only because the acceptance case makes a break visible. If an import-sort lint rule is ever adopted,
  it must carry an exception for this line — and this ADR is where that will be looked up.
- **The acceptance suite must generate two Prisma client states**, which costs two `prisma generate`
  calls in setup (measured ~150–500 ms each; the whole suite runs in ~13 s). Cheaper than the
  alternative of not proving the two states differ.
- **The guard is only as good as `NODE_ENV`** — see the gap above.

**Deliberately not decided here**

Whether to stop Prisma loading `.env` at all and own that loading ourselves. No runtime switch exists
(two independent enumerations of the `PRISMA_*` surface agree), so it would have to be build
discipline — generating the client with no `.env` present — which makes local development and
production diverge in how the client is generated. **That is an architecture decision for the
stakeholder**, and choosing it requires demonstrating the mechanism first, not assuming it.

## Alternatives considered

- **Document and fence.** Rejected: documentation does not fail closed. The precedent is #274's
  OpenSSL section — a documented hazard that no test enforced, which read as "latent, correct
  fallback, never a failure in any run" right up until the two sides stopped agreeing by accident.
- **The three earlier check targets**, in the table above. Each is rejected for a stated, measured
  reason rather than on taste; two of them were mine and were rejected after measurement contradicted
  them.
- **Refuse in every environment, not just production.** Rejected as the same wrongful-rejection shape
  the earlier targets carried: it would break `cp .env.example .env` for no correctness gain, since in
  development there is no production property being traded away.
