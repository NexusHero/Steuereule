#!/usr/bin/env node
// register-check — turns docs/requirements/register.md from a claim into a control
// (ADR-0021, ADR-0025). Five mechanical checks, run against the real repo tree:
//
//   1. every cited path exists
//   2. every cited test file is actually executed by a CI job (matched against the real
//      vitest include/exclude globs, and against ci.yml's e2e invocations)
//   3. a bidirectional REQ-NNN tag reconciliation: every REQ-tagged describe() block in the
//      test tree is cited under that REQ in the register, and every register citation of a
//      REQ-tagged file actually carries that file's own tag
//   4. Status/State come from the declared English vocabulary — no German, and a "not met"
//      qualifier must read identically in both columns (the REQ-010/F5 defect)
//   5. a test carrying `@documents-defect #NNN` is cited in the register with the same
//      marker, and #NNN is still open — the day it closes, this goes red until re-read
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
import { readVitestGlobs } from './lib/vitest-config.mjs'
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
  const apiUnit = readVitestGlobs(path.join(REPO_ROOT, 'apps/api/vitest.config.ts'))
  const apiIntegration = readVitestGlobs(path.join(REPO_ROOT, 'apps/api/vitest.integration.config.ts'))
  const mobileWeb = readVitestGlobs(path.join(REPO_ROOT, 'apps/mobile-web/vitest.config.ts'))

  function isRunByCI(filePath) {
    if (E2E_MJS_RE.test(filePath)) {
      return ciYml.includes(filePath)
    }
    if (!TEST_FILE_RE.test(filePath)) return true // not a test file — check 2 doesn't apply
    if (filePath.startsWith('apps/api/')) {
      const rel = filePath.slice('apps/api/'.length)
      const inUnit = matchAnyGlob(apiUnit.include, rel) && !matchAnyGlob(apiUnit.exclude, rel)
      const inIntegration = matchAnyGlob(apiIntegration.include, rel)
      return (inUnit && runsPlainTest) || (inIntegration && runsIntegrationTest)
    }
    if (filePath.startsWith('apps/mobile-web/')) {
      const rel = filePath.slice('apps/mobile-web/'.length)
      return matchAnyGlob(mobileWeb.include, rel) && runsPlainTest
    }
    return false
  }

  for (const row of rows) {
    for (const c of row.citations) {
      if (!c.exists) continue // already reported by check 1
      if (!isRunByCI(c.resolved)) {
        findings.add('2-executed-by-ci', `register.md:${row.lineNumber} (${row.req}, ${row.table}) cites \`${c.raw}\` — no CI job's vitest globs (or ci.yml e2e step) actually run this file.`)
      }
    }
  }

  // --- Gather the describe()-tagged REQ tree, once, for checks 3 and 5 --------------------
  const testTreeFiles = allFiles.filter((f) => f.startsWith('apps/') && TEST_FILE_RE.test(f))
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
    if (TIER_RECONCILED_REQS.has(req) && entry.state != null) {
      const tierMatch = entry.state.match(/\bgreen\s*\(([^)]+)\)/i)
      if (tierMatch) {
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
      findings.add('5-documents-defect', `${file}'s \`${markerText}\`: ${err.message}`)
      continue
    }
    if (!open) {
      findings.add('5-documents-defect', `${file} carries \`${markerText}\`, but issue #${issue} is closed — this test's green state was documenting an unfixed defect against a ticket that no longer says "unfixed"; re-read it (fix the test, or reopen the ticket, or drop the marker).`)
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
