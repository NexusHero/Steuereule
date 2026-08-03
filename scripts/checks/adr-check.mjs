#!/usr/bin/env node
// adr-check — the "adr-check" family of Salih's docs-consistency gate (register-check's
// sibling; see docs/adr/0021-controls-are-proven-by-breaking-them.md and the follow-up on
// register-check's own PR). One check:
//
//   6. ADR numbers are unique, every ADR file has a matching docs/adr/index.md row, and
//      every `ADR-NNNN` reference under docs/ resolves to a real file.
//
// Why this is its own job/script rather than a sixth register-check rule: it has nothing to
// do with the register, and its interesting failure mode is inherently cross-branch (two
// people picking the same free ADR number on two different branches, each individually
// consistent) — see the header note below on the merge-ref mechanism and its limits.
//
// *** The merge-ref mechanism — what it proves, and its two honest limits ***
// This script only ever reads the checked-out working tree — it has no branch/merge logic of
// its own. What actually closes the gap #239/#251 hit (two open PRs each independently
// claiming decision number 0023, each fine alone) is that GitHub Actions' `pull_request`
// trigger checks out the synthetic
// merge commit (`refs/pull/N/merge`) by default, not either side alone — so the *same* scan
// run under that event naturally sees the union of base + head, and the second PR to run
// this job goes red the moment the first one merges (nothing in ci.yml has to ask for that
// ref explicitly; it's what `actions/checkout` resolves to for this event).
//
// (a) That mechanism only reaches the *auto-mergeable* half of the collision space. GitHub
//     only publishes `refs/pull/N/merge` when the PR is cleanly mergeable — and two branches
//     that both append a row to docs/adr/index.md (the shape #239/#251 actually hit) are
//     exactly the ones likely to conflict on that file first, before the two ADR numbers are
//     ever compared. A conflicting PR has no fresh merge ref for `actions/checkout` to
//     resolve, so this script never sees the union at all in that case — it has to be
//     hand-resolved (a rebase) before either the conflict or the number collision is visible.
//     This script's own control proof (see the PR evidence) demonstrates the scan correctly
//     flags a collision once both files are in one tree; it does not by itself demonstrate a
//     `pull_request` run gets that tree in the conflicting half of the space.
// (b) A check run from *before* the base branch changed stays green — nothing re-triggers it.
//     Without required-status-check branch protection (#71, still open) nothing forces a
//     stale PR to re-run this job before it's mergeable.
//
//     The `push: branches: [main]` trigger (ci.yml) is not a redundant no-op here — it is the
//     compensating control for (b). `main` can carry a collision arriving through exactly a
//     stale PR run: the run that let a doomed PR merge was stale, but the run *on the merge
//     commit itself* is not, because `push` always checks out that exact commit fresh. So the
//     collision goes red on the merge that caused it — attributable, immediate, one commit
//     from revert — rather than sitting silently until a human happens to re-read the ADR
//     index. That bounds the stale-run gap to a single merge; it does not close it (a human
//     still has to notice the newly-red `main` and act), which is what #71 actually closes.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Findings } from './lib/findings.mjs'
import { walk } from './lib/paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const ADR_DIR = path.join(REPO_ROOT, 'docs/adr')
const INDEX_PATH = path.join(ADR_DIR, 'index.md')
// Musti's F2 review on #252: scoped to docs/ only, this used to flag the *prose describing*
// a known dangling reference (docs/adr/index.md's own "Known inconsistency" note) while
// missing the actual broken link at k8s/README.md:7 — a false-positive class in the very
// check meant to have none. Widened to the whole tree (walk() already excludes
// node_modules/.git/dist/coverage/.turbo/.expo/generated) and to every extension this repo's
// real ADR-NNNN references actually appear in (grepped, not guessed).
const SCANNABLE_TEXT_EXT = new Set(['.md', '.puml', '.svg', '.html', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.yml', '.yaml', '.json'])
// Escape hatch for the false-positive above: a line that *mentions* a known-broken reference
// (rather than asserting it as live) can say so and be believed, instead of the only route to
// green being deletion of the documentation of the problem (index.md's own §1.5 asks for the
// opposite). Deliberately just a same-line substring, not a specific comment syntax — the
// real instances today are Markdown prose, but the marker should work unchanged in a .ts/.yml
// comment too.
const IGNORE_MARKER = 'adr-check-ignore'

function main() {
  const findings = new Findings()

  // --- ADR decision files (the .md documents only — .puml/.svg diagrams legitimately share
  // their parent decision's number, e.g. 0012/0013, and are not "another ADR-0012") --------
  const adrFiles = fs
    .readdirSync(ADR_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'index.md' && f !== 'tech-radar.md')
  /** @type {Map<string, string[]>} 4-digit number -> filenames carrying it */
  const byNumber = new Map()
  for (const f of adrFiles) {
    const m = f.match(/^(\d{4})-/)
    if (!m) {
      findings.add('6-adr-numbering', `docs/adr/${f} doesn't start with a 4-digit ADR number.`)
      continue
    }
    const [, num] = m
    if (!byNumber.has(num)) byNumber.set(num, [])
    byNumber.get(num).push(f)
  }
  for (const [num, files] of byNumber) {
    if (files.length > 1) {
      findings.add('6-adr-numbering', `ADR-${num} is used by more than one file: ${files.map((f) => `docs/adr/${f}`).join(', ')}.`)
    }
  }

  // --- Every ADR file has exactly one docs/adr/index.md row, and vice versa ---------------
  const indexText = fs.readFileSync(INDEX_PATH, 'utf8')
  const indexNumbers = new Set()
  for (const line of indexText.split('\n')) {
    const m = line.match(/^\|\s*(\d{4})\s*\|/)
    if (m) indexNumbers.add(m[1])
  }
  for (const num of byNumber.keys()) {
    if (!indexNumbers.has(num)) {
      findings.add('6-adr-index', `ADR-${num} (${byNumber.get(num).join(', ')}) has no row in docs/adr/index.md.`)
    }
  }
  for (const num of indexNumbers) {
    if (!byNumber.has(num)) {
      findings.add('6-adr-index', `docs/adr/index.md has a row for ADR-${num}, but no docs/adr/${num}-*.md file exists.`)
    }
  }

  // --- Every ADR-NNNN reference in the repo resolves to a real ADR (Musti's F2: whole tree,
  // not just docs/ — see the SCANNABLE_TEXT_EXT comment above for why) ---------------------
  const allFiles = walk(REPO_ROOT, REPO_ROOT)
  for (const relPath of allFiles) {
    if (!SCANNABLE_TEXT_EXT.has(path.extname(relPath))) continue
    const source = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    const lines = source.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (line.includes(IGNORE_MARKER)) continue
      for (const m of line.matchAll(/ADR-(\d{4})\b/g)) {
        const num = m[1]
        if (!byNumber.has(num)) {
          findings.add('6-adr-reference-resolves', `${relPath}:${i + 1} references ADR-${num}, which has no docs/adr/${num}-*.md file.`)
        }
      }
    }
  }

  return findings
}

try {
  const findings = main()
  process.exit(findings.report('adr-check'))
} catch (err) {
  console.error('adr-check crashed (not a finding — the check itself failed to run):')
  console.error(err)
  process.exit(2)
}
