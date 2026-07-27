# ADR-0015 — Crew reduced from four developers to two (Ogün and Enis retired)

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Stakeholder (NexusHero)
- **Context tags:** delivery method, operating cost

## Context

The crew was grown from two developers to four (ADR-era decision recorded in the process charter):
**Kaan** and **Ogün** on frontend, **Robin** and **Enis** on backend, with Enis able to flex to
frontend. The intent was parallel tracks — more slices in flight, no developer idle — with Suhay and
Musti jointly holding capacity so all four stayed loaded.

Each developer is an autonomous agent with its own context window. A slice therefore costs not just
the code it produces but the tokens the agent spends reading the repository, reasoning, running the
gate, and reporting back. Observed cost for a single slice in the DSGVO round:

| Agent | Slice | Tokens |
|---|---|---|
| Robin | `GET /v1/account/export` (BE-A) | ~245k, then ~268k for the follow-up |
| Enis | `DELETE /v1/account` (BE-B) | ~218k |
| Kaan | Splash fix, Cockpit finalisation | ~115k–170k per task |
| Musti | Reviews | ~45k–90k per review |
| Salih | Real-stack tests | ~98k–167k per test pass |

Two things became visible:

1. **The marginal developer did not pay for itself.** Adding a second track on each side roughly
   doubled the token spend for a given round without halving the wall-clock — the single-lane
   review and test gates (Musti, Salih) stayed the bottleneck, and the WIP limit of two slices in
   the review+test queue capped useful parallelism at about two tracks anyway.
2. **Ogün never delivered a slice.** Across the whole run he was queued for the DSGVO frontend
   panels but the queue never drained far enough to dispatch him. A track that is planned, held,
   and reasoned about but never executed is pure coordination overhead.

The four-developer roster also made every orchestration decision more expensive: capacity had to be
split four ways at slice start and re-checked whenever a developer freed up, and the lead's
find-and-route step had four possible destinations instead of two.

## Decision

**Retire Ogün (frontend) and Enis (backend/full-stack). The crew returns to two developers —
Kaan on frontend, Robin on backend — alongside Suhay, Matthias, Musti and Salih.**

- Their agent definitions (`.claude/agents/ogun.md`, `.claude/agents/enis.md`) are deleted; the
  role tables in the process charter, the delivery pipeline and the review/routing instructions in
  `lead-developer.md`, `scrum-master.md` and `salih.md` drop to two tracks.
- **Their history is not rewritten.** `Co-authored-by: Enis <enis@steuereule-crew.example>` appears
  on merged commits (`DELETE /v1/account`, REQ-011 BE-B) and stays there — the work was really
  produced under that persona. `CONTRIBUTORS.md` keeps both entries, marked as former members, so a
  reader who encounters those trailers can still resolve who they were.
- Robin absorbs the backend track Enis held; Kaan absorbs the frontend track Ogün was queued for.

## Consequences

**Positive**

- Roughly halves the per-round token spend on implementation, which was the dominant cost.
- Removes the capacity-splitting and routing overhead that four tracks imposed on Suhay and Musti.
- Matches real throughput: with a WIP limit of two slices in the review+test queue and single-lane
  review and test gates, two developer tracks saturate the pipeline.

**Negative / accepted**

- No second opinion inside a discipline — Kaan and Robin no longer have a same-discipline peer to
  ask. Musti absorbs that mentoring load, which the lead-developer definition already covers.
- Genuinely independent frontend and backend work can no longer run two-wide per side. If a round
  ever needs that, the answer is to re-hire deliberately for that round, not to keep idle capacity
  standing.
- Enis's senior/full-stack flex is gone; a backend-light round can no longer borrow a second
  frontend pair of hands.

**Neutral**

- The gates are unchanged. Risk tiers, the WIP limit, the local review-then-test order, the honesty
  invariant and the `Co-authored-by` convention all apply exactly as before, to a smaller crew.

## Alternatives considered

- **Keep four, cap their context.** Rejected: the cost is dominated by the work a slice genuinely
  requires (reading the repo, running the gate), not by verbosity that a cap would trim. It would
  have degraded quality rather than cost.
- **Keep Enis, drop only Ogün.** Reasonable on the evidence — Enis delivered a real slice and found
  two genuine bugs, whereas Ogün delivered nothing. Rejected because the backend bottleneck is the
  review/test lane, not backend authoring capacity, so the second backend track has the same
  marginal-value problem as the second frontend one.
- **Keep all four, run fewer rounds.** Rejected: it hides the cost rather than removing it, and
  leaves idle personas that the orchestrator must still plan around.
