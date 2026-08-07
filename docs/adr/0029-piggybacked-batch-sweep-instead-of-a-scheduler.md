# ADR-0029 — Periodic cleanup runs as a piggybacked batch sweep, not a scheduler

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** NexusHero (stakeholder — this is a forward-looking dependency/architecture call and
  was escalated as one, not settled by the crew); proposed and framed by Musti (lead) in the #294
  grill; the open decision itself was first recorded by Robin in
  [ADR-0024](0024-qr-device-authorization-endpoints.md).
- **Builds on** [ADR-0024](0024-qr-device-authorization-endpoints.md) (which named this decision
  open and deferred it on purpose — see *Supersedes* below for the exact clause this ADR retires),
  [ADR-0012](0012-session-guard-coexistence-and-guest-upgrade.md) §5 (the DB-backed `RateLimit`
  algorithm this reuses the shape of, not the table).
- **Context tags:** architecture, operations, dependencies
- **Introduced by:** `steuereule#294` (lifecycle for unverified accounts). Second customer:
  `steuereule#238`'s abandoned `DeviceCode` rows.

## Context

Two features now need the same thing: **something that deletes rows after time has passed.**

- **#238 / ADR-0024** — abandoned `DeviceCode` rows, minted on every Login page view, never deleted.
  ~170 MB/month at 10,000 page views/day, measured.
- **#294** — unverified accounts, which today live forever. The stakeholder's own report.

There is nowhere for such a job to run, and this was checked rather than assumed:

| Candidate location | State on `71074c6` |
|---|---|
| A cron/`schedule:` trigger in CI | `.github/workflows/ci.yml:18-23` — triggers are `push`, `pull_request`, `workflow_dispatch`. No `schedule:`. And it would have no deployed database to point at. |
| A k8s `CronJob` | No deployment exists at all (#292). `.github/workflows/` contains one file. |
| An in-process scheduler | `@nestjs/schedule` is not a dependency. |

ADR-0024 recorded this as a genuine open decision and deliberately did not settle it, on the grounds
that adopting a scheduler is an architecture call rather than a slice call. That was right, and it is
why the decision waited for the stakeholder rather than being taken by whoever needed it first.

**A new dependency is never adopted casually here** — it is a forward-looking decision that belongs
to the stakeholder. Two tickets waiting on one unmade decision is the signal that it was time to make
it, not a licence for either ticket to make it locally.

## Decision

**Periodic cleanup runs as a bounded batch sweep attached to traffic that is already happening.**
No scheduler, no new dependency, no deployment prerequisite.

Concretely: at an event that occurs anyway (for #294, a login), the API deletes a **bounded** number
of due rows. Bounded is load-bearing — an unbounded sweep on a request path turns one unlucky user's
login into a table scan.

This retires the three-way question ADR-0024 left open ("in-process scheduler vs. external cron vs.
delete-on-mint") in favour of the third family, for both of its customers.

## Consequences

### What this buys

- **#294 is not blocked on #292.** That was the ticket's real blocker, and this removes it. The
  deployment gap stays open and stays real; it simply stops gating account lifecycle.
- **No new dependency**, so no version to track, no supply-chain surface, nothing to review.
- **No distributed lock.** An in-process scheduler on more than one API instance fires on every
  instance, so it would need leader election or an advisory lock — a concurrency problem we do not
  have today and would have bought purely to schedule something.
- **The decision is made once for both customers.** #238's `DeviceCode` sweep uses this same shape
  when someone gets to it.

### What it costs — and this constrains the product, not just the code

**Deletion is traffic-dependent.** With no traffic, nothing is swept. The deadline is therefore
**"no sooner than N days"**, never "on day N".

This is not a rounding detail, it is a constraint on what the user interface is allowed to say. A
countdown promising an exact date would be a claim the mechanism cannot keep. Any surface built on
this must express a floor ("in about X days"), not an appointment. Recorded here because the
temptation to write the exact date lives in the frontend, far from this file.

It is otherwise harmless: with no traffic there is also no accumulation and no one being harmed by
the delay.

### What it does not solve

- **It does not close #292.** Nothing here is a deployment. Everything ADR-0026 and #292 say about
  the absence of a deploy pipeline stays true.
- **It does not give us a general job runner.** The next thing that needs *real* scheduling — a
  nightly report, anything that must run at a wall-clock time — does not get an answer from this ADR
  and reopens the question on its own merits.
- **It does not bound worst-case latency.** A due row on a system nobody touches waits indefinitely.

## Alternatives considered

| Option | Needs #292? | New dependency? | Why not |
|---|---|---|---|
| `@nestjs/schedule` in-process | no | **yes** | Buys a multi-instance concurrency problem we do not currently have, to solve a problem that does not require it. |
| External cron / k8s `CronJob` | **yes, hard** | no | The cleanest separation, and unavailable: there is no place for it to run. Would block #294 indefinitely on a gap with no date. |
| **Piggybacked bounded batch sweep** | **no** | **no** | **Chosen.** The only option buildable today, and already named as a candidate by ADR-0024. |

## Supersedes

**[ADR-0024](0024-qr-device-authorization-endpoints.md)'s "nothing deletes expired rows" clause is
now partly out of date, and that is this ADR's own honesty obligation, not a later cleanup.** That
clause reads:

> the cleanup mechanism is a genuine open decision (in-process scheduler vs. external cron vs.
> delete-on-mint), and adopting a scheduler is an architecture call, not a slice call. Tracked
> separately, on purpose.

**The decision is no longer open** — this ADR is where it was tracked to. What remains true in
ADR-0024 is the *state*: nothing sweeps `DeviceCode` rows **yet**, because deciding the mechanism and
implementing it for that table are different pieces of work and only the first has happened.
ADR-0024's text is amended in the same change that adds this file, so the two never disagree.
