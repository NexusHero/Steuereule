# ADR-0030 — System-initiated deletion: the first erasure path no user confirms

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** NexusHero (stakeholder — an erasure without the data subject's confirmation is not
  an engineering call); surfaced and framed by Musti (lead) in the #294 grill, where it was reported
  as a conflict with ADR-0013 rather than designed around.
- **Extends** [ADR-0013](0013-dsgvo-export-and-account-deletion.md) §3 (the atomic teardown
  transaction, reused unchanged) and §6 (*Trust boundary* — whose preconditions this path
  structurally cannot satisfy; that is the whole reason this ADR exists).
- **Builds on** [ADR-0029](0029-piggybacked-batch-sweep-instead-of-a-scheduler.md) (what runs it),
  [ADR-0021](0021-controls-are-proven-by-breaking-them.md) (how it must be proven).
- **Context tags:** dsgvo, security, auth
- **Introduced by:** `steuereule#294`, from the stakeholder's own report: an unverified account can
  stay signed in forever without ever having confirmed.

## Context

Everything that erases user data in this system today is something **the user asked for**, in a
session, moments earlier. ADR-0013 §6 states the preconditions plainly:

> The destructive path additionally requires: the mandatory pre-delete export offer + the ADR-011
> Löschschutz warning + explicit confirmation + fresh-auth re-verification

and §6 opens by fixing where that path lives: both endpoints sit behind `UserContextGuard`, reading
only `@CurrentUser()` userId.

**#294 asks for an erasure with none of those things present.** A sweep has no session, no
`@CurrentUser()`, no password to re-verify, and nobody to click a confirmation. ADR-0013's
safeguards are not merely skipped here — they are **structurally unsatisfiable**, because every one
of them is defined in terms of a user who is present, and this user is by definition absent.

This is the first such path in the system. It was reported as a conflict rather than quietly worked
around, because "the ADR didn't anticipate this" and "the ADR doesn't apply" are very different
claims, and only the stakeholder can turn the first into the second.

## Decision

**A system-initiated erasure is permitted for one narrowly defined population, with a different set
of safeguards, written down here as a distinct case rather than as an exception to ADR-0013 §6.**

### 1. Scope — exactly one population

An account is eligible only when **both** hold:

- `emailVerified` is false, and
- `createdAt` is more than **30 days** ago.

Counted from `createdAt`, deliberately **not** from last login: a deadline measured from last login
would let an unverified account renew itself indefinitely by signing in, which is precisely the
behaviour the stakeholder reported. 30 days is a product decision, not a legal threshold — DSGVO
Art. 5(1)(e) supports that a limit must *exist*; it names no number, and this ADR does not pretend
otherwise.

Out of scope, explicitly: **guest sessions** (ADR-0007). A guest has no email address, so
"unverified" is not a state they can occupy and no warning could ever reach them. Their lifecycle is
a real question and a different one.

### 2. What replaces ADR-0013 §6's safeguards

| ADR-0013 §6 requires | Available here? | What stands in its place |
|---|---|---|
| Fresh-auth re-verification | **No** — no session, no password | Nothing. The eligibility rule itself is the only gate, which is why §1 is narrow and §4 is strict. |
| Explicit confirmation | **No** — nobody is present | **Advance warning**, twice by email (T-7, T-1) and continuously in-app on every login while unverified. |
| Mandatory pre-delete export offer | **Not by email** — there is no confirmed mailbox to send it to, which is the entire premise | The **T-7 warning carries the export offer in the banner**, where the user is already authenticated and the REQ-011 export path is already reachable. |
| ADR-011 Löschschutz warning | Yes, unchanged | `deleteAccountTransaction` consults `LegalHold` exactly as it does on the user-initiated path — reused, not reimplemented. |

### 3. The erasure itself is not a new mechanism

It calls **`deleteAccountTransaction`** (`apps/api/src/account/delete-account-transaction.ts`)
unchanged. That function is already exported as a raw function precisely so it can be driven without
the HTTP/DI machinery, and it already handles LegalHold exemption, audit anonymisation, and the
cascade — proven at acceptance tier by REQ-011's suite.

There is exactly one deletion truth in this system and this path does not add a second. A sweep that
hand-rolled `prisma.user.delete()` would be a refutation on sight.

**No soft-delete, no suspended state.** A second erasure semantics would be a second thing to prove
for no gain the stakeholder wanted.

### 4. The race is real and must be closed in the transaction

A verification click and the sweep can interleave. The check "is this user still unverified?" and
the delete **must sit inside the same transaction**. Read-then-delete across a transaction boundary
deletes a user who confirmed a moment earlier — the worst failure this feature can produce, and the
easiest one to write by accident.

### 5. Honesty obligations this creates

- **The verification link for a deleted account must not render a generic "invalid token".** It says
  the account was removed because it was never confirmed, and offers re-registration. The `Verification`
  rows die with the `User`, so there is genuinely nothing to verify against — but a blank failure
  would reproduce, at the far end, exactly the silent dead end this feature exists to remove.
- **`Registrierung`'s "verify whenever you have a moment" becomes untrue** and moves in the same
  slice — `apps/mobile-web/src/i18n/resources.ts:124` (DE) and `:484` (EN). The identical line lives
  in the design-system reference (`finanzo-funke-design-system/project/ui_kits/app/Registrierung.jsx:37`),
  which is a stakeholder/DS question, not licence to invent replacement copy.
- **The deadline is a floor, not a date** (ADR-0029): "in about X days", never an appointment.
- **The privacy screen describes only user-initiated deletion today.** It becomes incomplete, not
  false, and must gain the system-initiated case.

### 6. How it is proven (ADR-0021)

The clock is **injected**; `Date.now()` never appears in the sweeper, so "30 days have passed" is a
parameter rather than a wait. Against **real Postgres** (ADR-0010) — the entire risk lives in a
`where` clause and a mocked client would prove nothing.

The test that matters is **not** "an old unverified account is deleted" — that stays green even if
the query ignores `emailVerified` entirely. These must be seen red:

| # | Case | Break that must turn it red |
|---|---|---|
| 1 | **verified** account past the deadline **survives** | drop the `emailVerified: false` clause — **this is the one that catches the catastrophe** |
| 2 | unverified account **inside** the deadline survives | widen the date comparison |
| 3 | exactly on the boundary | pick a side and assert it, so `gt`/`gte` is visible |
| 4 | the warning went out **before** the deletion | assert on the `EmailSender` double for that user |
| 5 | §4's race | move the check outside the transaction |

## Consequences

### What this does not achieve — the part that must not be lost

**The replacement safeguards do not reach the person the deletion hits hardest.**

The in-app banner and the export offer both require the user to log in again. Someone who never
returns sees neither. Every email warning goes to an address that was **never confirmed** — it may
be a typo, someone else's address, or a mailbox nobody reads. That is, after all, the reason the
account is being deleted.

So the honest statement is: **the account most likely to be erased is the account least likely to
have been warned.** The safeguards in §2 are meaningful for the user who comes back and real for the
user who reads their mail; for the genuinely absent user they are a formality. This ADR does not
claim otherwise, and nobody reading it later should be able to conclude that "warned twice" meant
"reached".

Two things bound the damage rather than remove it: the population is narrow (§1), and an unverified
account is by construction one nobody has proven ownership of.

### The activation gate

**The deleting arm must not go live before a real email provider (#83) is wired.** Building the
whole lifecycle against `LoggingEmailSender` is legitimate and unblocked; *deleting* on the strength
of a warning that only ever reached a console log is not. This is not a new gate — #83 is already
tied to #48/REQ-011 ("before any real, non-synthetic user").

### Interface change

`EmailSender` gains a third method for the deadline warning. Note for #83 when it lands: its own
acceptance criterion says "seam integrity — `EmailSender` interface is unchanged", which is a
statement about the *provider swap* not changing it, not a promise that the interface is frozen.

## Alternatives considered

| Option | Why not |
|---|---|
| Suspend instead of delete | A second erasure semantics, a second thing to prove, and it keeps the data — which is what Art. 5(1)(e) argues against. The stakeholder ruled for hard deletion. |
| Restrict what an unverified account may do | REQ-005 is **Done** and specifies "works immediately … without blocking basic use". Adding gates would invalidate a green requirement, so it is a REQ-005 amendment and its own slice — not a rider on this one. The consequence here is the deletion, not a degraded product. |
| Deadline from last login | Lets an unverified account renew itself forever by signing in — the reported behaviour. |
| Email the export before deleting | There is no confirmed mailbox. Sending an entire data export to an unverified address would be a worse DSGVO outcome than the deletion. |
