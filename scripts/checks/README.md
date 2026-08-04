# register-check / adr-check

Two mechanical gates on the docs that used to be checked only by a human re-reading them
(ADR-0021 and the Requirements-Register-ownership decision landing via #251). One CI job
(`docs-consistency` in `.github/workflows/ci.yml`), two families, no new dependency —
everything here is plain Node (`fs`, `fetch`), because the vocabulary each check needs (a
handful of glob patterns, one pipe-table shape) is small enough that a real dependency would
be more supply chain than the problem needs.

```
pnpm register-check   # node scripts/checks/register-check.mjs
pnpm adr-check         # node scripts/checks/adr-check.mjs
```

## What each check actually verifies

**register-check** (`docs/requirements/register.md`):

1. every cited path exists. A citation that resolves only by a **bare filename**, not the full
   path (a sibling citation in the same cell already named the shared directory) is real
   evidence but under-qualified — reported separately as check **1b**, its own low-severity
   class, so it doesn't block on the same finding as a genuinely missing file. A citation with
   directory components that don't match reality gets no such leniency: that's a wrong path,
   not shorthand, and is check 1, full stop (Musti's F5 review on #252 — the fallback used to
   also accept those, which meant a moved test's stale citation would pass every check that
   resolves through it, forever).
2. every cited test file is actually run by a CI job — matched against the *real*
   `include`/`exclude` globs of every `apps/*` and `packages/*` workspace that ships its own
   `vitest.config.ts`/`vitest.integration.config.ts` (discovered, not hard-coded — Musti's F3
   review on #252: this used to only know about `apps/api` and `apps/mobile-web`, so
   `packages/core`, `packages/tokens`, `packages/api-client` and `packages/ui` all
   false-negatived even though `pnpm -r test` runs every one of them), and against
   `.github/workflows/ci.yml`'s literal e2e `node e2e/....mjs` invocations. A workspace glob's
   `exclude` array is honoured for every discovered project, not just the first one written
   (F4). A file under a path this check doesn't recognise as any known workspace project is its
   own distinct finding, not folded into "not run" (F3) — those are different problems with
   different fixes. Check **2b**: a vitest config's own `include`/`exclude` is read by regex,
   scoped by truncating the source at `coverage:` so `test.exclude` and `coverage.exclude`
   (two different arrays, both spelled `exclude: [...]`) can't be confused — but nothing
   enforces that `test.exclude` is actually written before `coverage:` in the source, so that
   scoping is compared against an untruncated re-read for a stray `exclude:` that falls outside
   the coverage block's own brace span; a disagreement there means this check can no longer
   tell the two apart for that project and says so, rather than silently trusting the truncated
   guess (F11, Musti's review on #252's `b91ce00` fix).
3. a **bidirectional** `REQ-NNN` tag reconciliation: every `describe('REQ-NNN — ...')` block in
   the same `apps/*`/`packages/*` test tree check 2 discovers is cited under that REQ somewhere
   in the register, and every register citation of a REQ-tagged file is cited under the tag
   that file actually carries. This used to scan `apps/**` only, a narrower tree than check 2
   already knew about — a REQ tag planted in `packages/*` would be invisible here even though
   check 2 would confirm CI runs it (F10, Musti's review on #252's `b91ce00` fix); both checks
   now derive their test tree from the one discovery pass.

   **Check 3b — per-table citation presence.** Check 3's own reconciliation `Set` is merged
   across both tables *by design* (a file cited in either table satisfies check 3's "is it
   cited under this REQ anywhere" question) — but that means a REQ's citation column can sit
   **empty in one table indefinitely** while the other table carries real evidence, and check 3
   never sees it (Musti's finding on `#239`, https://github.com/NexusHero/Steuereule/pull/239#issuecomment-5180191738:
   the REQ-014 summary row held status prose in its "Acceptance test" cell instead of citations
   while the traceability row correctly cited two real tests — check 3 stayed green throughout).
   Check 3b reads each table's own citation column: once a REQ carries a citation in *any*
   table, every table with a row for that REQ must carry one too. A REQ with **no** citations
   anywhere (a not-yet-started requirement — e.g. REQ-007's `_tbd_`/`_not started_` cells) is
   not governed by this rule and produces no finding; only an *inconsistently* empty column
   does. The governed set is derived from the register's own data, not guessed.
4. `Status`/`State` come from the English vocabulary — a German-word blocklist, and a
   `**not met (...)**`-style qualifier must read identically in both the summary table's
   `Status` column and the traceability table's `State` column for the same row (the
   REQ-010/F5 defect: the two columns described the same fact as `In progress` and
   `nicht erfüllt`). The tier-vocabulary sub-rule (`unit`/`integration`/`acceptance`) reads its
   own vocabulary and which REQ rows it applies to straight out of the register's own
   "Evidence tiers" section, rather than hard-coding either — a register that hasn't declared
   the vocabulary yet gets no findings from that sub-rule, not invented ones. **It also requires
   every REQ named in that scoping sentence to carry a tier at all** — not only that a tier, if
   present, is spelled from the declared vocabulary (`#258`). The old version matched
   `/\bgreen\s*\(([^)]+)\)/i` and skipped the whole sub-check silently when it didn't match, so a
   `State` cell that lost its tier entirely (bare `green`, or no `green` at all) produced no
   finding — exactly the shape of the `#249`/`#253` rebase regression this check exists to
   catch. The reversed quantifier: for every tier-reconciled REQ, *is there a tier at all*, not
   *if there is one, is it spelled right*.

   **Check 4b — the governed set itself can go silently empty (Musti's F1 review on `#268`).**
   The tier-existence rule above derives which REQs it governs from the register's own
   "Applied consistently ... to" sentence — honest, not hard-coded, but with no floor: reword or
   delete that sentence and the derived set becomes an empty `Set`, at which point the per-REQ
   check governs **nothing**, for every previously-reconciled REQ, without a single finding.
   Measured against the real register: deleting REQ-004's tier while the sentence still named it
   went red (the fix above); deleting REQ-004's tier **and** making the sentence unrecognisable
   went silent, pre-4b. 4b closes that: if the tier vocabulary is declared (`TIER_WORDS` is
   non-empty) but the derived governed set is empty, that is itself a finding, naming that the
   *set* is empty rather than pointing at any one REQ's tier — a register that hasn't introduced
   the tier convention at all yet (no `Evidence tiers` table, `TIER_WORDS` empty) is exempt, so
   this doesn't false-positive on legitimate absence of the whole convention.
5. `@documents-defect #NNN` in a test's source: every register row citing that file must repeat
   the identical marker in its own citation cell (both the summary and traceability tables,
   independently — one table getting fixed while its sibling is forgotten is exactly the
   failure this is watching for), and issue `#NNN` must still be open — the message names a
   fourth remedy beyond "fix the test / reopen the ticket / drop the marker": **re-point the
   marker** at whatever ticket now carries the remaining gap, since the issue closing usually
   means a precondition became possible, not that the defect itself is gone (Musti's F9 review
   on #252). Needs `GITHUB_TOKEN` (set automatically in Actions, `issues: read` — see the job's
   `permissions:` block) to ask the real GitHub API — a lookup failure is its own finding class,
   `5-documents-defect-unavailable`, distinct from `5-documents-defect` (F9): a reviewer should
   never have to read the message body to know whether the check *found* something or *failed
   to look*.

**adr-check** (`docs/adr/`):

6. every `docs/adr/NNNN-*.md` number is unique (diagram `.puml`/`.svg` companions sharing a
   parent decision's number are not a violation — see the script), every such file has a row in
   `docs/adr/index.md` and vice versa, and every `ADR-NNNN` reference **anywhere in the repo**
   resolves to a real file — widened from `docs/` only after Musti's review found the narrower
   scope flagged the prose *describing* a known dangling reference and missed the real one
   (`k8s/README.md`), see "The ignore-marker escape hatch" below.

## The merge-ref mechanism (check 6), and its honest limit

Check 6's interesting failure mode — two open PRs each independently claiming the same free
4-digit decision number — is inherently cross-branch: each branch is internally consistent on
its own (this is exactly what happened with #239 and #251, both landing on the number 0023
before the second one renumbered). Nothing in this script does branch/merge logic; what closes
the gap is that GitHub Actions' `pull_request` trigger checks out the synthetic merge commit
(`refs/pull/N/merge`) by default, so the same plain filesystem scan, run under that event,
naturally sees the union of base + head and the second PR to run this job goes red the moment
the first one merges — **for the auto-mergeable half of the collision space.** Two branches that
both append a row to the same table in `docs/adr/index.md` are exactly the ones likely to
conflict on that file first, before GitHub ever computes a merge ref for this check to run
against — that half needs a human to resolve the textual conflict (a rebase) before the number
collision underneath it becomes visible at all. The control proof below demonstrates the scan
correctly flags a collision once both files are in one tree; it does not by itself demonstrate
a `pull_request` run gets that tree in the conflicting half.

**The `push: branches: [main]` trigger is not redundant with the above — it's the compensating
control for the "stale PR run" gap.** `main` can carry a collision arriving through precisely a
stale, unretriggered PR run (see the next section); the `push`-to-`main` run always checks out
that exact merge commit fresh, so the collision goes red on the merge that caused it —
attributable, immediate, one commit from revert — rather than sitting until a human happens to
re-read the ADR index. That bounds the gap to a single merge; #71 (branch protection, still
open) is what would close it outright.

## The ignore-marker escape hatch

Widening the scan to the whole repo turned two of `docs/adr/index.md`'s own sentences into
false positives: its "Known inconsistency" section *describes* the `k8s/README.md` dangling
reference and, worse, explicitly says an old NestJS-numbering coincidence with the same digits
as the incoming register-ownership decision is *closed* — flagging that line reports the
opposite of what it says.

A line containing the literal text `adr-check-ignore` anywhere on it is skipped entirely. This is
deliberately a same-line substring, not a specific comment syntax, so it works unchanged in a
`.ts`/`.yml` comment as well as Markdown prose. It exists for exactly this shape (prose
documenting a known-broken or not-yet-real reference) — not as a general suppression for a
reference someone doesn't want to fix.

**It must never be used inside `desktop-companion/`.** <!-- adr-check-ignore: this line describes the dangling references below, it does not assert them --> That directory's dangling `ADR-0057`/
`0058`/`0059` references (`README.md`, `capture.cjs`, `main.cjs`, `package.json`,
`preload.cjs`) are not prose *describing* a known gap the way `docs/adr/index.md`'s own
"Known inconsistency" section is — they *assert* live decisions that were never written. The
marker exists for the former shape, not the latter; muting these with `adr-check-ignore` would
turn a real, still-open gap invisible instead of fixing it. They stay red until the directory
itself is cleaned up (or the ADRs get written) by whoever owns it.

## Control proofs (ADR-0021)

Every one of the six checks was proven by planting the exact break it exists to catch, watching
it fail with the right message, and reverting — see the PR's evidence block for the transcript
of each. Checks 1–5 were broken/restored directly against `docs/requirements/register.md` and
this repo's real vitest configs; check 6 was proven with a real `git merge` of two branches that
are each individually clean but collide once merged (the mechanism has to run against an actual
merge, not a description of one — a fixture that never merges anything wouldn't prove it).

Musti's review on `ae47fdb` found five further gaps in these checks themselves (F2/F3/F4/F5/F9
above); each of those fixes carries its own proof in the same PR's evidence block — F3 and F5 in
particular were re-proved directly, not just reasoned about, since a fix to a check that catches
false negatives/positives is exactly the kind of control this whole gate exists to demand proof
of. A follow-up review on `b91ce00` found two more (F10/F11 above); F10 was proved by planting a
`describe('REQ-997 — ...')` probe in a real `packages/core` test file (invisible under the old
`apps/`-only tree, caught once check 3 shared check 2's discovery), and F11 by a synthetic
`vitest.config.ts` with `test.exclude` genuinely written after the `coverage:` block — confirmed
first that the pre-fix code silently returns an empty `exclude` for it (the expensive false
negative), then that the fix flags `2b-glob-parse-ambiguous` instead of trusting that emptiness.
The same run also added a proof line dedicated to check 2b's own truncation logic against a real
coverage-bearing config (`packages/core`) — disabling the truncation entirely produces twelve
false `2-executed-by-ci` findings against real, CI-run `apps/mobile-web` test files, which the
original F4 proof (using a config with no `coverage:` block at all) never actually exercised.

**`#258`/Musti's `#239` cross-table finding (2026-08-04) — the "break by deletion" amendment
(ADR-0021, "existence checked as validity").** Both new rules — check 3b and check 4's tier-
existence branch — got the two-sided proof that amendment demands, against the real register on
`main`, not a fixture:

- Check 4, validity branch (already existed; re-proved so the fix doesn't regress it):
  REQ-004's traceability `State` tier corrupted `green (integration)` → `green (bogus)` — red,
  naming `register.md:239`, `tier "bogus" is not one of the declared tiers`. Restored — clean.
- Check 4, existence branch (the new rule): REQ-004's tier **deleted** entirely (`green
  (integration) · ` removed, leaving only the `**acceptance-tier proof outstanding**` prose) —
  red, `register.md:239 REQ-004's State column (...) carries no \`green (tier)\` marker at all`.
  The pre-fix check passed this exact input silently — this is the `#249`/`#253` regression
  shape, reproduced directly. Restored — clean.
- Check 3b, existence branch (the new rule): REQ-014's **summary**-row citation column emptied
  (its two test citations replaced with status prose, mirroring the real regression), its
  traceability row left untouched — red, naming `register.md:25 (REQ-014, summary table)`.
  Restored — clean.
- Check 3 (unmodified, re-proved so the 3b addition doesn't regress it): a real test file's
  `describe('REQ-012 — ...')` tag corrupted to `REQ-997` — red, unaffected by the 3b code path
  running alongside it. Restored — clean.
- REQ-007 (legitimately not-started, no citation in either table) does **not** trigger check
  3b at any point in the above — confirmed on every run: the governed set is "has evidence
  somewhere", not "every row, unconditionally".

**Check 4b (Musti's F1 review on `#268`, same day, one level deeper)** — proved with the exact
repro he supplied, against the real register:

- Tier removed from REQ-004's `State` cell, "Applied consistently ... to" sentence left intact
  → red on `4-status-vocabulary`, naming `register.md:239` (the existing per-REQ existence
  branch, unaffected).
- Tier removed from REQ-004's `State` cell **and** the sentence reworded into something that
  names no REQs → **pre-4b this went silent** — reproduced directly, then confirmed the 4b fix
  turns it red: `The register declares an evidence-tier vocabulary (...) but its "Applied
  consistently ... to" sentence names no REQs — the per-REQ tier-existence check below has
  nothing to govern.` The message names the *set* as empty, not any one REQ's tier — the two
  failure modes read differently on purpose, so a reader isn't sent looking at one REQ's cell
  for a document-wide problem. Restored (sentence and tier both) — clean.
- Sentence reworded alone (tiers left untouched everywhere) → same 4b finding, confirming the
  set-emptiness is what's detected, independent of whether any individual tier is also missing.
  Restored — clean.
- Tier vocabulary itself removed (the `Evidence tiers` table's three `` `green (...)` `` rows
  deleted, sentence and REQ data left alone) → 4b does **not** fire (`TIER_WORDS` empty is the
  guard), confirming a register that hasn't introduced the tier convention at all is exempt —
  though the pre-existing validity branch correctly still complains that every real tier token
  is now "not declared", which is a different, expected consequence of removing the vocabulary
  table out from under live data, not a 4b false positive. Restored — clean.

Every break above was undone by restoring the exact prior file content (`git diff` clean after
each revert), not by a fresh `git checkout` that could silently pick up an unrelated stray change
in the same worktree.

## Deliberately out of scope

Whether a cited test's *content* actually proves the requirement statement is a judgement call
for a human (Musti's review, Suhay's register ownership under the register-ownership decision
landing via #251), not something this mechanises — see #221's original scope boundary. These
checks catch a citation pointing at
nothing, at a test nothing runs, at the wrong REQ, at a stale defect ticket, or at a duplicate
ADR number. They do not and cannot tell you the test is a *good* test.
