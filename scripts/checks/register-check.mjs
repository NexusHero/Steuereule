#!/usr/bin/env node
// register-check — turns docs/requirements/register.md from a claim into a control
// (ADR-0021 and the register-ownership decision landing via #251). Mechanical checks, run
// against the real repo tree:
//
//   1. every cited path exists (a bare-filename citation that only resolves by basename is
//      real evidence but under-qualified — reported separately, as check 1b, so it doesn't
//      block on the same finding class as a genuinely missing file)
//   2. every cited test file is actually executed by a CI job — matched against the real
//      vitest include/exclude globs of every discovered apps/*/packages/* project, and
//      against ci.yml's e2e invocations. Check 2b: if a project's own vitest config can't be
//      read unambiguously (the coverage:-truncation heuristic in lib/vitest-config.mjs
//      disagreeing with an untruncated read of the same exclude glob), that is itself a
//      finding rather than a silently-trusted guess (F11, Musti's review on #252).
//   3. a bidirectional REQ-NNN tag reconciliation: every REQ-tagged describe() block in the
//      test tree is cited under that REQ in the register, and every register citation of a
//      REQ-tagged file actually carries that file's own tag. The "test tree" here is the same
//      set of apps/*/packages/* vitest projects check 2 discovers — not a separate, narrower
//      guess (F10, Musti's review on #252: this used to hard-code apps/ only, so a REQ tag or
//      an @documents-defect marker planted in packages/* would be invisible to checks 3/5).
//      Check 3b: check 3's own reconciliation Set is merged across both tables by design (a
//      file cited in *either* table satisfies it) — which means a REQ's citation column can
//      sit empty in one table indefinitely, invisible to check 3 (Musti's finding on #239, the
//      REQ-014 summary-row instance). Check 3b reads each table's own citation column instead:
//      once a REQ has real evidence in one table, every table carrying a row for it must too.
//   4. Status/State come from the declared English vocabulary — no German, and a "not met"
//      qualifier must read identically in both columns (the REQ-010/F5 defect). The tier
//      sub-rule requires every REQ the register's own "Applied consistently ... to" sentence
//      names to carry a `green (tier)` marker at all — not only that a tier, if present, is
//      spelled from the declared vocabulary (#258: the old version matched validity but not
//      existence, so a State cell that lost its tier wholesale produced no finding).
//   5. a test carrying `@documents-defect #NNN` is cited in the register with the same
//      marker, and #NNN is still open — the day it closes, this goes red until re-read
//
// Checks 3b and 4's tier-existence rule are both instances of the same shape (ADR-0021's
// 2026-08-04 amendment, "break by deletion"): an existence claim ("is there a tier/citation at
// all?") that used to be checked only as a validity claim ("if one is there, is it well
// formed?") — vacuously satisfied by absence. The fix in both cases is the reversed
// quantifier over a governed set the register's own text already names or implies, not a
// better regex.
//
// What this deliberately does NOT check: whether a cited test's *content* actually proves
// the requirement. That is a judgement call for a human review (Musti/Suhay), not
// mechanisable here (see #221's explicit scope boundary).
//
// Findings are reported in one batch (see lib/findings.mjs) rather than fail-fast, so one
// run can show every planted break during a control proof, not just the first.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Findings } from './lib/findings.mjs'
import { parseTables, citationColumnIndex, statusColumnIndex, reqColumnIndex, extractCitations } from './lib/register.mjs'
import { walk, buildBasenameIndex, resolveCitedPath } from './lib/paths.mjs'
import { matchAnyGlob } from './lib/glob.mjs'
import { discoverVitestProjects } from './lib/vitest-config.mjs'
import { isIssueOpen } from './lib/github.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const REGISTER_PATH = path.join(REPO_ROOT, 'docs/requirements/register.md')
const CI_YML_PATH = path.join(REPO_ROOT, '.github/workflows/ci.yml')

const TEST_FILE_RE = /\.test\.tsx?$/
const E2E_MJS_RE = /^e2e\/.*\.mjs$/
const DESCRIBE_REQ_RE = /describe\(\s*['"`][^'"`]*?(REQ-\d{3})/g
const DOCUMENTS_DEFECT_RE = /@documents-defect\s+#(\d+)/g

async function main() {
  const findings = new Findings()
  const registerText = fs.readFileSync(REGISTER_PATH, 'utf8')
  const registerLines = registerText.split('\n')

  const allFiles = walk(REPO_ROOT, REPO_ROOT)
  const basenameIndex = buildBasenameIndex(allFiles)

  // --- Check 1: every cited path in the whole document exists -----------------------------
  const resolvedByRaw = new Map() // raw citation text -> resolution (memoised, reused by 2-5)
  for (let i = 0; i < registerLines.length; i += 1) {
    for (const citation of extractCitations(registerLines[i])) {
      for (const p of citation.paths) {
        if (resolvedByRaw.has(p)) continue
        const resolution = resolveCitedPath(p, REPO_ROOT, basenameIndex)
        resolvedByRaw.set(p, resolution)
        if (!resolution.exists) {
          const where = resolution.kind === 'basename-ambiguous' ? `ambiguous — matches ${resolution.candidates.join(', ')}` : 'no such file'
          findings.add('1-path-exists', `register.md:${i + 1} cites \`${p}\` — ${where}.`)
        } else if (resolution.kind === 'basename-unique') {
          // Low severity, own class (Musti's F5 review on #252): real evidence, resolved by
          // basename only, not a citation error — but under-qualified. Spelling these out is
          // meant to get them fixed and this fallback deleted, not to live here permanently.
          findings.add('1b-under-qualified-citation', `register.md:${i + 1} cites \`${p}\` — resolves only by filename, to \`${resolution.resolved}\`; spell out the full path.`)
        }
      }
    }
  }

  // --- Parse both tables for row-level checks (2-5) ----------------------------------------
  const tables = parseTables(registerText)
  /** @type {{req: string, table: string, lineNumber: number, statusText: string, citations: {raw: string, resolved: string, exists: boolean}[]}[]} */
  const rows = []
  for (const table of tables) {
    const reqIdx = reqColumnIndex(table)
    const citeIdx = citationColumnIndex(table)
    const statusIdx = statusColumnIndex(table)
    for (const row of table.rows) {
      const req = row.cells[reqIdx]
      const citeText = row.cells[citeIdx] ?? ''
      const statusText = row.cells[statusIdx] ?? ''
      const citations = extractCitations(citeText).flatMap((c) =>
        c.paths.map((p) => {
          const resolution = resolvedByRaw.get(p) ?? resolveCitedPath(p, REPO_ROOT, basenameIndex)
          return { raw: p, cellText: citeText, resolved: resolution.resolved, exists: resolution.exists }
        }),
      )
      rows.push({ req, table: table.name, lineNumber: row.lineNumber, statusText, citations })
    }
  }

  // --- Check 2: every cited, existing test file is actually run by a CI job ---------------
  const ciYml = fs.readFileSync(CI_YML_PATH, 'utf8')
  const runsPlainTest = /\bpnpm\s+-r\s+test\b/.test(ciYml)
  const runsIntegrationTest = /test:integration\b/.test(ciYml)
  // Every apps/* and packages/* workspace with its own vitest.config.ts, discovered rather
  // than hard-coded (Musti's F3 review on #252 — this used to only know about apps/api and
  // apps/mobile-web, so packages/core/tokens/api-client/ui all false-negatived even though
  // pnpm -r test runs every one of them).
  const vitestProjects = discoverVitestProjects(REPO_ROOT)

  // F11 (Musti's review on #252, commit b91ce00): readVitestGlobs' coverage:-truncation
  // heuristic (see lib/vitest-config.mjs) rests on an invariant this repo has never violated
  // — test.exclude written before coverage: — but nothing enforces that ordering, and the
  // silent failure mode is the expensive one (a file CI actually skips reads as "run"). Say
  // so instead of trusting it blind: if the truncated and untruncated reads of a config's own
  // exclude glob disagree, this check's own parsing is unreliable for that project.
  for (const project of vitestProjects) {
    if (project.truncationDisagreement) {
      findings.add(
        '2b-glob-parse-ambiguous',
        `${project.prefix} (${project.tier}): the coverage:-truncated and untruncated reads of this vitest config's own \`exclude\` glob disagree — this check cannot reliably tell test.exclude from coverage.exclude here. Read the config by hand; if test.exclude genuinely comes after coverage: in the source, fix the ordering, or this check's own truncation logic in lib/vitest-config.mjs.`,
      )
    }
  }

  /** @returns {{run: boolean, reason: string}} */
  function isRunByCI(filePath) {
    if (E2E_MJS_RE.test(filePath)) {
      return ciYml.includes(filePath)
        ? { run: true, reason: 'e2e step in ci.yml' }
        : { run: false, reason: 'no ci.yml step invokes this e2e script' }
    }
    if (!TEST_FILE_RE.test(filePath)) return { run: true, reason: 'not a test file — check 2 does not apply' }

    const matchingProjects = vitestProjects.filter((p) => filePath.startsWith(p.prefix))
    if (matchingProjects.length === 0) {
      // F3: say what it means, rather than folding into the same "not run" bucket as a file
      // that IS in a known project but genuinely excluded — an unrecognised workspace
      // location is its own finding (a gap in this check's own project discovery, or a file
      // that isn't really part of any vitest project), not silent "false".
      return { run: false, reason: 'unrecognised workspace location — no apps/*/vitest.config.ts or packages/*/vitest.config.ts prefix matches this path' }
    }
    for (const project of matchingProjects) {
      const rel = filePath.slice(project.prefix.length)
      // F4: exclude applied symmetrically for every project/tier, not just the first one
      // written (the bug was apiIntegration's exclude being read and never used).
      const included = matchAnyGlob(project.include, rel) && !matchAnyGlob(project.exclude, rel)
      if (!included) continue
      const coveredByCI = project.tier === 'unit' ? runsPlainTest : runsIntegrationTest
      if (coveredByCI) return { run: true, reason: `${project.prefix} (${project.tier})` }
    }
    return {
      run: false,
      reason: `matched by a vitest include glob under ${matchingProjects.map((p) => `${p.prefix} (${p.tier})`).join(', ')}, but excluded there or its CI script isn't invoked`,
    }
  }

  for (const row of rows) {
    for (const c of row.citations) {
      if (!c.exists) continue // already reported by check 1
      const result = isRunByCI(c.resolved)
      if (!result.run) {
        findings.add('2-executed-by-ci', `register.md:${row.lineNumber} (${row.req}, ${row.table}) cites \`${c.raw}\` — ${result.reason}.`)
      }
    }
  }

  // --- Gather the describe()-tagged REQ tree, once, for checks 3 and 5 --------------------
  // F10 (Musti's review on #252, commit b91ce00): this used to hard-code `apps/` while check
  // 2's isRunByCI already knew about packages/* too (discoverVitestProjects, F3) — so a
  // describe('REQ-NNN — ...') tag or an @documents-defect marker planted in a packages/*
  // test file would be invisible to checks 3 and 5, even though pnpm -r test runs it and
  // check 2 would happily confirm it's executed by CI. Deriving the test tree from the same
  // vitestProjects prefixes check 2 already discovered keeps all three checks talking about
  // one test tree instead of three slightly different ones.
  const testTreePrefixes = vitestProjects.map((p) => p.prefix)
  const testTreeFiles = allFiles.filter((f) => TEST_FILE_RE.test(f) && testTreePrefixes.some((prefix) => f.startsWith(prefix)))
  /** @type {Map<string, Set<string>>} file -> REQ tags found via describe() */
  const fileTags = new Map()
  /** @type {Map<string, Set<string>>} REQ -> files tagging it */
  const reqToFiles = new Map()
  /** @type {{file: string, issue: number}[]} */
  const documentsDefectMarkers = []
  for (const f of testTreeFiles) {
    const source = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')
    const tags = new Set()
    for (const m of source.matchAll(DESCRIBE_REQ_RE)) tags.add(m[1])
    if (tags.size > 0) {
      fileTags.set(f, tags)
      for (const req of tags) {
        if (!reqToFiles.has(req)) reqToFiles.set(req, new Set())
        reqToFiles.get(req).add(f)
      }
    }
    for (const m of source.matchAll(DOCUMENTS_DEFECT_RE)) {
      documentsDefectMarkers.push({ file: f, issue: Number(m[1]) })
    }
  }

  // --- Check 3: bidirectional REQ-NNN tag reconciliation -----------------------------------
  /** @type {Map<string, Set<string>>} REQ -> files cited under it, across both tables */
  const registerCitesByReq = new Map()
  for (const row of rows) {
    if (!registerCitesByReq.has(row.req)) registerCitesByReq.set(row.req, new Set())
    for (const c of row.citations) if (c.exists) registerCitesByReq.get(row.req).add(c.resolved)
  }

  for (const [req, files] of reqToFiles) {
    const cited = registerCitesByReq.get(req) ?? new Set()
    for (const file of files) {
      if (!cited.has(file)) {
        findings.add('3-req-tag-bidirectional', `${file} carries describe('${req} — ...') but the register's ${req} row does not cite this file.`)
      }
    }
  }
  for (const [req, cited] of registerCitesByReq) {
    for (const file of cited) {
      const tags = fileTags.get(file)
      if (tags && tags.size > 0 && !tags.has(req)) {
        findings.add('3-req-tag-bidirectional', `The register's ${req} row cites ${file}, but that file's own describe() tags are {${[...tags].join(', ')}}, not ${req}.`)
      }
    }
  }

  // --- Check 3b: per-table citation presence -----------------------------------------------
  // Musti's finding on #239 (https://github.com/NexusHero/Steuereule/pull/239#issuecomment-5180191738):
  // registerCitesByReq above is a Set merged across *both* tables, by design — that's correct
  // for check 3's "is this file cited somewhere under this REQ" purpose. But it means a REQ's
  // own citation column can sit *empty* in one table indefinitely, invisible to check 3, as
  // long as the other table cites something. That is exactly what happened to REQ-014: the
  // summary row's "Acceptance test" cell held status prose instead of citations while the
  // traceability row correctly cited two real tests — check 3 stayed green throughout because
  // the union was non-empty. A human re-read caught it; the gate didn't.
  //
  // The governed set here is derived from the register's own data, not guessed: a REQ that
  // legitimately has no evidence anywhere yet (REQ-007's "_not started_"/"_tbd_" cells) must
  // not be flagged — an empty citation column is not itself wrong, only an *inconsistently*
  // empty one is. So the rule only fires once a REQ has established real evidence in at least
  // one table: if any table cites something under a REQ, every table carrying a row for that
  // REQ must too. This is the reversed quantifier from check 4's tier fix, applied to the
  // other place the same shape was found the same day: "is there a citation at all in *this*
  // table's column", not "is the citation cell's content well-formed".
  const rowsByReq = new Map() // req -> rows across both tables
  for (const row of rows) {
    if (!rowsByReq.has(row.req)) rowsByReq.set(row.req, [])
    rowsByReq.get(row.req).push(row)
  }
  for (const [req, reqRows] of rowsByReq) {
    const anyTableCites = reqRows.some((r) => r.citations.length > 0)
    if (!anyTableCites) continue // ungoverned: no evidence claimed anywhere for this REQ yet
    for (const r of reqRows) {
      if (r.citations.length === 0) {
        findings.add(
          '3b-cross-table-citation-gap',
          `register.md:${r.lineNumber} (${req}, ${r.table} table) has an empty citation column while ${req} carries citations in its other table — a citation column can sit empty in one table indefinitely under check 3's cross-table union; this checks each table's own column.`,
        )
      }
    }
  }

  // --- Check 4: Status/State vocabulary --------------------------------------------------
  const GERMAN_BLOCKLIST = /\b(nicht|erfüllt|abgeschlossen|unvollständig|läuft|ausstehend|fertig)\b/i
  const NOT_MET_RE = /\*\*not met[^*]*\*\*/gi
  // The tier vocabulary itself is read out of the register's own "Evidence tiers" table
  // (`` `green (unit)` ``-shaped cells) rather than hard-coded here — if the register hasn't
  // declared a tier vocabulary yet, TIER_WORDS is empty and this sub-check is a no-op rather
  // than inventing a rule the document doesn't state. Likewise, which REQ rows the tier
  // convention has actually been applied to is read from the register's own scoping sentence
  // ("Applied consistently ... to REQ-002, REQ-003, ..."), not assumed — a row the register
  // itself hasn't reconciled to the tier vocabulary yet is a named, already-flagged
  // incompleteness, not new drift, and shouldn't be flagged here as if it were.
  const TIER_WORDS = new Set([...registerText.matchAll(/`green \(([a-z]+)\)`/g)].map((m) => m[1]))
  const appliedToMatch = registerText.match(/Applied consistently (?:below )?to ([^.—]+)/)
  const TIER_RECONCILED_REQS = new Set(appliedToMatch ? [...appliedToMatch[1].matchAll(/REQ-\d{3}/g)].map((m) => m[0]) : [])

  const byReqStatus = new Map() // req -> { summaryStatus, traceabilityState, summaryLine, traceabilityLine }
  for (const row of rows) {
    if (!byReqStatus.has(row.req)) byReqStatus.set(row.req, {})
    const entry = byReqStatus.get(row.req)
    if (row.table === 'summary') {
      entry.status = row.statusText
      entry.statusLine = row.lineNumber
    } else {
      entry.state = row.statusText
      entry.stateLine = row.lineNumber
    }
  }

  for (const [req, entry] of byReqStatus) {
    for (const [col, text, line] of [
      ['Status', entry.status, entry.statusLine],
      ['State', entry.state, entry.stateLine],
    ]) {
      if (text == null) continue
      const germanMatch = text.match(GERMAN_BLOCKLIST)
      if (germanMatch) {
        findings.add('4-status-vocabulary', `register.md:${line} ${req}'s ${col} column contains a German word ("${germanMatch[0]}") — the register is English throughout (docs/process/README.md).`)
      }
    }
    if (entry.status != null && entry.state != null) {
      const statusNotMet = [...entry.status.matchAll(NOT_MET_RE)].map((m) => m[0].toLowerCase().replace(/\s+/g, ' '))
      const stateNotMet = [...entry.state.matchAll(NOT_MET_RE)].map((m) => m[0].toLowerCase().replace(/\s+/g, ' '))
      for (const clause of statusNotMet) {
        if (!stateNotMet.includes(clause)) {
          findings.add('4-status-vocabulary', `register.md:${entry.statusLine} ${req}'s Status column has ${clause}, but the traceability State column (register.md:${entry.stateLine}) doesn't carry the identical qualifier — Status and State must describe the same fact in the same words (the REQ-010/F5 defect).`)
        }
      }
      for (const clause of stateNotMet) {
        if (!statusNotMet.includes(clause)) {
          findings.add('4-status-vocabulary', `register.md:${entry.stateLine} ${req}'s State column has ${clause}, but the Status column (register.md:${entry.statusLine}) doesn't carry the identical qualifier.`)
        }
      }
    }
    // #258 / ADR-0021 amendment #1: this sub-check used to fire only once
    // `/\bgreen\s*\(([^)]+)\)/i` matched — a validity check ("if a tier is present, is it
    // spelled right?") with no existence branch, so a State cell that lost its tier entirely
    // (bare `green`, or no `green` at all) produced tierMatch === null and the block was
    // skipped silently — vacuously satisfied by absence. That is precisely how the #249/#253
    // rebase regression arrived: two reconciled REQs' State cells were overwritten wholesale,
    // both lost their tier, and this check stayed green throughout. The reversed quantifier:
    // for every REQ the register itself names as tier-reconciled, does its State cell carry a
    // tier *at all* — not "if it carries one, is it valid".
    if (TIER_RECONCILED_REQS.has(req)) {
      if (entry.state == null) {
        findings.add(
          '4-status-vocabulary',
          `${req} is named in the register's "Applied consistently ... to" sentence as tier-reconciled, but has no traceability State cell at all — a tier requires a State cell to carry it.`,
        )
      } else {
        const tierMatch = entry.state.match(/\bgreen\s*\(([^)]+)\)/i)
        if (!tierMatch) {
          findings.add(
            '4-status-vocabulary',
            `register.md:${entry.stateLine} ${req}'s State column ("${entry.state}") carries no \`green (tier)\` marker at all — every REQ named in the "Applied consistently ... to" sentence must state its evidence tier; a missing tier is a finding, not silence (#258).`,
          )
        } else {
          const tokens = tierMatch[1]
            .split(/\s*\+\s*/)
            .map((t) => t.trim())
          for (const token of tokens) {
            if (!TIER_WORDS.has(token)) {
              findings.add('4-status-vocabulary', `register.md:${entry.stateLine} ${req}'s State column tier "${token}" is not one of the declared tiers (unit, integration, acceptance).`)
            }
          }
        }
      }
    }
  }

  // --- Check 5: @documents-defect marker — register carries the flag, issue is open -------
  await checkDocumentsDefect(findings, documentsDefectMarkers, rows)

  return findings
}

async function checkDocumentsDefect(findings, markers, rows) {
  for (const { file, issue } of markers) {
    const markerText = `@documents-defect #${issue}`
    const citingRows = rows.filter((r) => r.citations.some((c) => c.exists && c.resolved === file))
    if (citingRows.length === 0) {
      findings.add('5-documents-defect', `${file} carries \`${markerText}\` but no register row cites this file at all.`)
      continue
    }
    // Every row that cites the file must carry the flag, not just one of them — the summary
    // table and the traceability table both cite the same file independently, and this
    // convention (the register.md REQ-010 rows already do it for #248's rate-limit
    // annotation) is exactly meant to survive one table getting fixed/annotated while its
    // sibling is forgotten.
    for (const row of citingRows) {
      const rowCarriesFlag = row.citations.some((c) => c.cellText.includes(markerText))
      if (!rowCarriesFlag) {
        findings.add('5-documents-defect', `${file} carries \`${markerText}\`, but the register row citing it at register.md:${row.lineNumber} (${row.req}, ${row.table}) doesn't repeat that marker in its citation cell.`)
      }
    }
    let open
    try {
      open = await isIssueOpen(issue)
    } catch (err) {
      // F9 (Musti's review on #252): a failed lookup and a real "the issue closed" finding
      // must not share one heading — a reader hitting red needs to know at a glance whether
      // the check *found* something or *failed to look*, without reading the message body.
      findings.add('5-documents-defect-unavailable', `${file}'s \`${markerText}\`: ${err.message}`)
      continue
    }
    if (!open) {
      findings.add('5-documents-defect', `${file} carries \`${markerText}\`, but issue #${issue} is closed — this test's green state was documenting an unfixed defect against a ticket that no longer says "unfixed"; re-read it (fix the test, reopen the ticket, re-point the marker at whatever now carries the remaining gap, or drop the marker).`)
    }
  }
}

main()
  .then((findings) => {
    process.exit(findings.report('register-check'))
  })
  .catch((err) => {
    console.error('register-check crashed (not a finding — the check itself failed to run):')
    console.error(err)
    process.exit(2)
  })
