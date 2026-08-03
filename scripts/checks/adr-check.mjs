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
// *** The merge-ref mechanism, and its honest limit ***
// This script only ever reads the checked-out working tree — it has no branch/merge logic of
// its own. What actually closes the gap #239/#251 hit (two open PRs each adding "ADR-0023",
// each fine alone) is that GitHub Actions' `pull_request` trigger checks out the synthetic
// merge commit (`refs/pull/N/merge`) by default, not either side alone — so the *same* scan
// run under that event naturally sees the union of base + head, and the second PR to run
// this job goes red the moment the first one merges (nothing in ci.yml has to ask for that
// ref explicitly; it's what `actions/checkout` resolves to for this event).
// This is NOT proof against every version of the problem:
//   - A `push`-triggered run (to `main`) checks out that single commit, not a merge — fine,
//     because by definition nothing on `main` collides with itself.
//   - A check run from *before* the base branch changed stays green — nothing re-triggers it.
//     Without required-status-check branch protection (#71, still open) nothing forces a
//     stale PR to re-run this job before it's mergeable. Until #71 lands, this control is
//     only as reliable as a human noticing the PR needs an update, which is the same gap
//     this whole gate exists to close for everything else — named here rather than implied.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Findings } from './lib/findings.mjs'
import { walk } from './lib/paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const ADR_DIR = path.join(REPO_ROOT, 'docs/adr')
const INDEX_PATH = path.join(ADR_DIR, 'index.md')
const SCANNABLE_TEXT_EXT = new Set(['.md', '.puml', '.svg', '.html', '.txt'])

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

  // --- Every ADR-NNNN reference under docs/ resolves to a real ADR ------------------------
  const allDocsFiles = walk(path.join(REPO_ROOT, 'docs'), REPO_ROOT)
  for (const relPath of allDocsFiles) {
    if (!SCANNABLE_TEXT_EXT.has(path.extname(relPath))) continue
    const source = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    for (const m of source.matchAll(/ADR-(\d{4})\b/g)) {
      const num = m[1]
      if (!byNumber.has(num)) {
        findings.add('6-adr-reference-resolves', `${relPath} references ADR-${num}, which has no docs/adr/${num}-*.md file.`)
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
