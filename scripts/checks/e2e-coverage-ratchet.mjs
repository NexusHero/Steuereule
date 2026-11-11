// E2E coverage ratchet (#450 5I): inventories every testID of the app and every (step × value)
// pair of the interview catalogue against the selectors the E2E suites actually use, writes the
// gaps as an artifact, and fails only when the gap list grows beyond the committed baseline.
//
//   pnpm e2e-coverage-ratchet            # check against the baseline (CI)
//   pnpm e2e-coverage-ratchet --update   # rewrite the baseline (only ever shrinks in a good PR)
//
// Runs inside apps/api (`pnpm --filter @steuereule/api exec …`) because that is where `tsx` lives; the
// catalogue is imported from the TypeScript source of packages/core so there is no second copy.
//
// HOW A TESTID COUNTS AS COVERED (a static, deliberately conservative approximation):
//   * the E2E sources are scanned for every string / template literal;
//   * a literal testID is covered when an E2E literal equals it, contains `data-testid="<id>"`, or is
//     a `^=` prefix selector that the id starts with;
//   * a templated testID (`katalog-option-${step}-x`) becomes a regex and is covered when an E2E
//     literal matches it, or when an E2E template with `${…}` holes matches it the other way round.
// HOW AN INTERVIEW PAIR COUNTS AS COVERED:
//   * UI: `interview-option-<step>-<value>` / `katalog-option-<step>-<value>` literal in an E2E file,
//     or a template `…option-${x}-<value>` in a file that also names `<step>` as a quoted string;
//   * API / picks tables: a `['<step>', '<value>']` tuple, a `'<step>': '<value>'` entry or
//     `questionId: '<step>', value: '<value>'` in an E2E file.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASELINE = join(ROOT, 'scripts/checks/e2e-coverage-baseline.json')
// Gaps that are no test gap, each with its reason (AC 8): `{ "interviewPairs": { "step=*": "why" }, "testIds": { "id": "why" } }`.
const EXCEPTIONS = join(ROOT, 'scripts/checks/e2e-coverage-exceptions.json')
const ARTIFACT_DIR = process.env.E2E_COVERAGE_ARTIFACT_DIR ?? '/tmp/e2e-coverage'

function walk(dir, accept, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'baselines') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, accept, out)
    else if (accept(full)) out.push(full)
  }
  return out
}

/** Every testID declaration in the app: `{ id, pattern, file }`; `pattern` is a RegExp for templated ids. */
export function collectAppTestIds(root = ROOT) {
  // The shared UI package owns the sheet, the buttons and the cards, so its testIDs count too.
  const files = ['apps/mobile-web/src', 'apps/mobile-web/App.tsx', 'packages/ui/src'].flatMap((rel) => {
    const abs = join(root, rel)
    return statSync(abs).isDirectory() ? walk(abs, (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) : [abs]
  })
  const found = new Map()
  const add = (raw, file) => {
    const hasHole = raw.includes('${')
    const key = raw
    if (found.has(key)) return
    const pattern = hasHole ? new RegExp('^' + raw.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '.+') + '$') : null
    found.set(key, { id: raw, pattern, file: relative(root, file) })
  }
  const props = /(?:testID|testId|inputTestID|sendTestID|stopTestID|testIDPrefix)\s*[=:]\s*(?:"([^"]+)"|'([^']+)'|\{?\s*`([^`]+)`\s*\}?)/g
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(props)) add(m[1] ?? m[2] ?? m[3], file)
    // `testID: 'x'` / `testId: 'x'` inside data tables are covered by `props`; ternaries need their own pass.
    for (const m of src.matchAll(/\?\s*'([a-z0-9][a-z0-9-]+)'\s*:\s*(?:'([a-z0-9][a-z0-9-]+)'|`([^`]+)`)/g)) {
      if (/testID|testId/.test(src.slice(Math.max(0, m.index - 80), m.index))) {
        add(m[1], file)
        add(m[2] ?? m[3], file)
      }
    }
  }
  return [...found.values()].filter((t) => t.id !== 'screen-container' || true)
}

/** Every string / template literal in the E2E sources, split into plain ids and templates. */
export function collectE2eLiterals(root = ROOT) {
  const files = walk(join(root, 'e2e'), (f) => f.endsWith('.mjs'))
  const plain = new Set()
  const templates = []
  const byFile = new Map()
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const literals = new Set()
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      const text = m[1] ?? m[2] ?? m[3]
      literals.add(text)
      if (text.includes('${')) {
        // `[data-testid="foo-${x}"]` → `foo-${x}`; a template that is mostly holes proves nothing.
        const inner = text.match(/data-testid(?:\^|\$|\*)?="([^"]+)"/)?.[1] ?? text
        if (inner.replace(/\$\{[^}]*\}/g, '').length >= 6) templates.push({ text: inner, file })
      } else plain.add(text)
      for (const sel of text.matchAll(/data-testid(\^|\$|\*)?="([^"]+)"/g)) {
        if (sel[1] === '^') plain.add(`^=${sel[2]}`)
        else plain.add(sel[2])
      }
      for (const sel of text.matchAll(/data-testid(\^|\$|\*)?=([^\]"]+)\]/g)) plain.add(sel[2])
    }
    byFile.set(file, { src, literals })
  }
  return { plain, templates, byFile }
}

function templateToRegex(text) {
  return new RegExp('^' + text.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '.+') + '$')
}

export function uncoveredTestIds(appIds, e2e) {
  const prefixes = [...e2e.plain].filter((s) => s.startsWith('^=')).map((s) => s.slice(2))
  const e2eRegexes = e2e.templates.map((t) => templateToRegex(t.text))
  const out = []
  for (const t of appIds) {
    let hit = false
    if (t.pattern === null) {
      hit = e2e.plain.has(t.id) || prefixes.some((p) => t.id.startsWith(p)) || e2eRegexes.some((re) => re.test(t.id))
    } else {
      const literalHead = t.id.slice(0, t.id.indexOf('${'))
      hit =
        [...e2e.plain].some((s) => !s.startsWith('^=') && t.pattern.test(s)) ||
        prefixes.some((p) => literalHead.startsWith(p) && p.length > 0) ||
        e2eRegexes.some((re) => re.test(t.id.replace(/\$\{[^}]*\}/g, 'x')))
    }
    if (!hit) out.push(t.id)
  }
  return [...new Set(out)].sort()
}

export function uncoveredPairs(pairs, e2e) {
  const out = []
  for (const { step, value } of pairs) {
    const literalHit =
      e2e.plain.has(`interview-option-${step}-${value}`) ||
      e2e.plain.has(`katalog-option-${step}-${value}`) ||
      e2e.plain.has(`interview-option-${step}-${value}`)
    let hit = literalHit
    if (!hit) {
      for (const { src, literals } of e2e.byFile.values()) {
        const quoted = (s) => literals.has(s)
        // API tuple: ['step', 'value'] or { questionId: 'step', value: 'value' }
        if (src.includes(`'${step}', '${value}'`) || src.includes(`"${step}", "${value}"`)) hit = true
        // Object literal of picks: { 'ch-wohnsitz': 'Schweiz' }
        const escapedStep = step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`(?:'${escapedStep}'|"${escapedStep}"|\\b${escapedStep})\\s*:\\s*['"]${escapedValue}['"]`).test(src)) hit = true
        if (new RegExp(`questionId:\\s*'${step}'\\s*,\\s*value:\\s*'${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(src)) hit = true
        // Template with a hole for the step, the value spelled out, and the step named in the same file.
        if (!hit && quoted(step) && [...literals].some((l) => l.includes('option-${') && l.endsWith(`-${value}`))) hit = true
        if (hit) break
      }
    }
    if (!hit) out.push(`${step}=${value}`)
  }
  return out.sort()
}

export async function collectInterviewPairs(root = ROOT) {
  const mod = await import(pathToFileURL(join(root, 'packages/core/src/interview/interview.ts')).href)
  const pairs = []
  for (const decl of Object.values(mod.QUESTIONS)) {
    if (decl.form.kind !== 'enum') continue
    for (const value of decl.form.values) pairs.push({ step: decl.id, value })
  }
  return pairs
}

/** Drops the gaps that are documented exceptions; `step=*` and `prefix*` match several entries. */
export function withoutExceptions(gaps, exceptions) {
  const keys = Object.keys(exceptions)
  const excused = (gap) => keys.some((k) => (k.endsWith('*') ? gap.startsWith(k.slice(0, -1)) : k === gap))
  return gaps.filter((g) => !excused(g))
}

export function compareToBaseline(current, baseline) {
  const added = {}
  const removed = {}
  for (const key of Object.keys(current)) {
    const base = new Set(baseline[key] ?? [])
    const now = new Set(current[key])
    added[key] = current[key].filter((x) => !base.has(x))
    removed[key] = [...base].filter((x) => !now.has(x))
  }
  return { added, removed }
}

async function main() {
  const update = process.argv.includes('--update')
  const appIds = collectAppTestIds()
  const e2e = collectE2eLiterals()
  const pairs = await collectInterviewPairs()
  const exceptions = JSON.parse(readFileSync(EXCEPTIONS, 'utf8'))
  const current = {
    testIds: withoutExceptions(uncoveredTestIds(appIds, e2e), exceptions.testIds ?? {}),
    interviewPairs: withoutExceptions(uncoveredPairs(pairs, e2e), exceptions.interviewPairs ?? {}),
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const summary = {
    testIds: { total: appIds.length, uncovered: current.testIds.length },
    interviewPairs: { total: pairs.length, uncovered: current.interviewPairs.length },
  }
  writeFileSync(join(ARTIFACT_DIR, 'e2e-coverage-gaps.json'), JSON.stringify({ summary, gaps: current }, null, 2) + '\n')
  console.log(`[e2e-coverage] documented exceptions: ${Object.keys(exceptions.testIds ?? {}).length} testID entries, ${Object.keys(exceptions.interviewPairs ?? {}).length} interview entries`)
  console.log(`[e2e-coverage] testIDs without an E2E hit: ${summary.testIds.uncovered} of ${summary.testIds.total}`)
  console.log(`[e2e-coverage] interview pairs (step × value) without an E2E hit: ${summary.interviewPairs.uncovered} of ${summary.interviewPairs.total}`)
  if (update) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
    console.log(`[e2e-coverage] baseline rewritten: ${relative(ROOT, BASELINE)}`)
    return
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const { added, removed } = compareToBaseline(current, baseline)
  let failed = false
  for (const key of Object.keys(current)) {
    if (added[key].length > 0) {
      failed = true
      console.error(`[e2e-coverage] ❌ ${key}: ${added[key].length} new without an E2E hit (the list only may shrink):`)
      for (const x of added[key]) console.error(`    + ${x}`)
    }
    if (removed[key].length > 0) {
      console.log(`[e2e-coverage] 🎉 ${key}: ${removed[key].length} newly covered — run with --update to lock the progress in`)
    }
  }
  if (failed) process.exit(1)
  console.log('[e2e-coverage] ✅ no new gaps')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
