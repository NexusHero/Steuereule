# register-check / adr-check

Two mechanical gates on the docs that used to be checked only by a human re-reading them
(ADR-0021, ADR-0025). One CI job (`docs-consistency` in `.github/workflows/ci.yml`), two
families, no new dependency — everything here is plain Node (`fs`, `fetch`), because the
vocabulary each check needs (a handful of glob patterns, one pipe-table shape) is small enough
that a real dependency would be more supply chain than the problem needs.

```
pnpm register-check   # node scripts/checks/register-check.mjs
pnpm adr-check         # node scripts/checks/adr-check.mjs
```

## What each check actually verifies

**register-check** (`docs/requirements/register.md`):

1. every cited path exists
2. every cited test file is actually run by a CI job — matched against the *real*
   `include`/`exclude` globs read out of `apps/api/vitest.config.ts`,
   `apps/api/vitest.integration.config.ts`, `apps/mobile-web/vitest.config.ts`, and against
   `.github/workflows/ci.yml`'s literal e2e `node e2e/....mjs` invocations
3. a **bidirectional** `REQ-NNN` tag reconciliation: every `describe('REQ-NNN — ...')` block in
   `apps/**/*.test.{ts,tsx}` is cited under that REQ somewhere in the register, and every
   register citation of a REQ-tagged file is cited under the tag that file actually carries
4. `Status`/`State` come from the English vocabulary — a German-word blocklist, and a
   `**not met (...)**`-style qualifier must read identically in both the summary table's
   `Status` column and the traceability table's `State` column for the same row (the
   REQ-010/F5 defect: the two columns described the same fact as `In progress` and
   `nicht erfüllt`). The tier-vocabulary sub-rule (`unit`/`integration`/`acceptance`) reads its
   own vocabulary and which REQ rows it applies to straight out of the register's own
   "Evidence tiers" section, rather than hard-coding either — a register that hasn't declared
   the vocabulary yet gets no findings from that sub-rule, not invented ones.
5. `@documents-defect #NNN` in a test's source: every register row citing that file must repeat
   the identical marker in its own citation cell (both the summary and traceability tables,
   independently — one table getting fixed while its sibling is forgotten is exactly the
   failure this is watching for), and issue `#NNN` must still be open. Needs `GITHUB_TOKEN` (set
   automatically in Actions) to ask the real GitHub API — a lookup failure is reported as a
   finding, never silently treated as "open" (a check that can't reach its own source of truth
   fails loud, not open).

**adr-check** (`docs/adr/`):

6. every `docs/adr/NNNN-*.md` number is unique (diagram `.puml`/`.svg` companions sharing a
   parent decision's number are not a violation — see the script), every such file has a row in
   `docs/adr/index.md` and vice versa, and every `ADR-NNNN` reference anywhere under `docs/`
   resolves to a real file.

## The merge-ref mechanism (check 6), and its honest limit

Check 6's interesting failure mode — two open PRs each independently adding, say, `ADR-0023` —
is inherently cross-branch: each branch is internally consistent on its own (this is exactly
what happened with #239 and #251). Nothing in this script does branch/merge logic; what closes
the gap is that GitHub Actions' `pull_request` trigger checks out the synthetic merge commit
(`refs/pull/N/merge`) by default, so the same plain filesystem scan, run under that event,
naturally sees the union of base + head and the second PR to run this job goes red the moment
the first one merges.

That mechanism has a real limit, stated rather than assumed:

- A `push`-triggered run (to `main`) checks out that one commit, never a merge — correct,
  because nothing on `main` collides with itself by definition.
- **A check run from before the base branch changed stays green.** Nothing re-triggers it.
  Without required-status-check branch protection (#71, still open) nothing forces a stale PR
  to re-run this job before it becomes mergeable — the control is then only as reliable as a
  human noticing the PR needs updating, the same gap this whole gate exists to close for
  everything else.

## Control proofs (ADR-0021)

Every one of the six checks was proven by planting the exact break it exists to catch, watching
it fail with the right message, and reverting — see the PR's evidence block for the transcript
of each. Checks 1–5 were broken/restored directly against `docs/requirements/register.md` and
this repo's real vitest configs; check 6 was proven with a real `git merge` of two branches that
are each individually clean but collide once merged (the mechanism has to run against an actual
merge, not a description of one — a fixture that never merges anything wouldn't prove it).

## Deliberately out of scope

Whether a cited test's *content* actually proves the requirement statement is a judgement call
for a human (Musti's review, Suhay's register ownership under ADR-0025), not something this
mechanises — see #221's original scope boundary. These checks catch a citation pointing at
nothing, at a test nothing runs, at the wrong REQ, at a stale defect ticket, or at a duplicate
ADR number. They do not and cannot tell you the test is a *good* test.
