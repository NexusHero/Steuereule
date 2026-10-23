# ADR-0029 — Definition of Done: vier Ebenen (ENTWURF)

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** NexusHero (Stakeholder) · **Review:** Musti (Lead) — re-review GO (2026-10-23)
- **Introduced by:** DoD grilling session 2026-10-23 (decisions D13–D20)
- **Builds on** [ADR-0017](0017-public-draft-first-review-and-tiered-testing.md) (tiered
  testing), [ADR-0021](0021-controls-are-proven-by-breaking-them.md) (a control is proven by
  breaking it — not established until observed to fail), Musti's REQ-010 ruling on PR #249
  ("green needs a tier"), `docs/requirements/register.md` (register status semantics).
- **Context tags:** process, quality, definition-of-done

## Context

The roadmap (see `docs/roadmap-1.0.md`) sets a professional-engineering bar, but a bar without
a definition of *done* is not checkable: "Phase fertig" and "1.0 fertig" would remain feelings.
The grilling session therefore fixed a Definition of Done on **four levels** (stakeholder
decision D13: four, explicitly including a per-REQ level). The per-REQ level is the semantic
definition of the register's `Done` status — not a second bookkeeping.

## Decision

**DoD 1 — Ticket/Slice.** A slice is done when:
- TDD red→green; `typecheck` + `oxlint` green; review gate passed (draft PR → Musti).
- Acceptance test exists on the tier the REQ demands (PR #249 ruling).
- No bespoke machinery: framework/library standard first; any deviation needs an ADR.
- Comments explain why, never what; touched files trimmed.
- A **security/performance posture line** is present in the PR: does the slice touch these
  axes? If yes, the guarding test or measurement is linked (or a deliberately documented
  non-requirement with reason); if no, a one-sentence "n/a" with reason. The reviewer checks
  this line like every other gate line (D16 — a *checkable statement*, not a rubber stamp).
- ADR followed up where an architectural decision was made; register maintained where a REQ
  is touched.

**DoD 2 — REQ (register `Done`).** A REQ is `Done` when: acceptance test on the demanded tier
· green on `main` in CI · register row cites the test location · review passed · ADR where
required. No per-REQ demo/sign-off — that is the 1.0 level's job (D14).

**DoD 3 — Phase.** All tickets meet DoD 1; all blocking edges resolved; the phase is demoable
on the real environment (from phase 1; the foundation itself: green gates + local
production-shaped stack, because the real environment is the parallel infra track); roadmap
status column and progress.db context updated to done (D17). No per-phase stakeholder sign-off.

**DoD 4 — 1.0 (product, "zeigbar").**
1. ADR-001–042 scope implemented — or individual items consciously gated (only by
   NexusHero decision, visible in the register).
2. One complete stakeholder walk-through without manual intervention — guest → registration →
   interview → computation → submission-ready → export — on the real URL, run by NexusHero
   **and** at least one external tester, recorded as evidence (D18).
3. Deployed on k3s/Hetzner with backups/DR; REQ-010 closed; mantle REQs 007/008/009 green.
4. DSGVO final audit before the first real account.
5. Pre-go-live load test passed.
6. No "AI smell": the phase 0.2 bespoke list replaced, comment discipline repo-wide.
7. ELSTER submission activated once the manufacturer certificate arrives (external track).

**Enforcement (D19):** the ticket DoD is a checkable checklist in the PR template; the
reviewer confirms each line. Automatable parts run in CI already; "why-only" comments and
"no bespoke machinery" are review judgements and are not simulated with lint rules. The four
levels live in `docs/process/` and are wired into the PR template in phase 0.1.

**Exceptions (D20):** Musti may approve a DoD deviation; it is recorded visibly in the PR
**and** the register with reason and a follow-up ticket; NexusHero keeps veto. The 1.0 core
criteria (2 and 3) admit no exceptions — only a go-live deferral.

## Consequences

- Four levels carry administration; the REQ level is anchored to the register's existing
  status semantics (Musti's PR #249 ruling), not a parallel track.
- The posture line forces a conscious security/performance answer on every ticket without
  mandating tests where no axis is touched (no test proliferation).
- The recorded stakeholder walk-through makes "zeigbar" provable (ADR-0021 spirit: observed,
  not claimed).
- Deviations stay visible: the mechanism the project already lives (REQ-010 A1, the #175
  footer note) becomes the rule instead of an ad-hoc practice.

## Decision history

- 2026-10-23: Draft from the DoD grilling session (decisions D13–D20).
- 2026-10-23: Rev 2 — Musti review findings I1 (ADR-0021 paraphrase), M8, M9 addressed;
  re-review GO. Promoted to `docs/adr/`.
