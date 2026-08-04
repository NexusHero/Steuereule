import fs from 'node:fs'
import path from 'node:path'

// Reads `include`/`exclude` straight out of a vitest.config.ts's source text via regex,
// rather than importing/evaluating the config (which would need the SWC/vite-plugin
// toolchain wired up just to answer "what does this glob array say"). This is deliberately
// dumb: it only understands a single-line-ish `include: [...]` / `exclude: [...]` array of
// string literals, which is the only shape every config in this repo actually uses. If a
// config ever grows a computed glob list, this will need to change — and should fail loud
// (empty array) rather than silently matching everything.

function extractArray(source, key) {
  const re = new RegExp(key + '\\s*:\\s*\\[([^\\]]*)\\]', 's')
  const m = source.match(re)
  if (!m) return []
  const body = m[1]
  const strings = []
  for (const strMatch of body.matchAll(/['"]([^'"]+)['"]/g)) {
    strings.push(strMatch[1])
  }
  return strings
}

// Given the index of a `{` character, returns the index of its matching `}` by brace-depth
// counting (ignores that a brace could theoretically appear inside a string/comment — none
// of this repo's configs do that, and this whole module is already scoped to "the shapes
// this repo's own configs actually use", not a general parser).
function findMatchingBrace(source, openBraceIndex) {
  let depth = 0
  for (let i = openBraceIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * @param {string} configPath absolute path to a vitest.config.ts
 * @returns {{include: string[], exclude: string[], truncationDisagreement: boolean}}
 */
export function readVitestGlobs(configPath) {
  const source = fs.readFileSync(configPath, 'utf8')
  // `test.exclude` and `coverage.exclude` are both plausible keys in these files, and a
  // config with a coverage block (packages/core, packages/tokens, packages/ui) always
  // writes `coverage:` — with its own `exclude:` — after `test.include`/`test.exclude`.
  // extractArray has no notion of JS nesting, so an unscoped search for `exclude: [...]`
  // finds `coverage.exclude` whenever `test.exclude` doesn't exist, which is silently wrong
  // — not "this project has no exclude", but "this project excludes its own test files"
  // (packages/ui's coverage.exclude literally contains `src/**/*.test.tsx`). Truncating the
  // search text at the first `coverage:` keeps the search scoped to the part of the file
  // that can only be `test.*`, in every config this repo actually has today.
  const coverageAt = source.indexOf('coverage:')
  const testScopedSource = coverageAt === -1 ? source : source.slice(0, coverageAt)
  const truncatedExclude = extractArray(testScopedSource, 'exclude')
  // F11 (Musti's review on #252, commit b91ce00): the truncation above is correct for every
  // config this repo has today, but nothing in vitest's own schema requires `test.exclude`
  // to appear before `coverage:` — that's an invariant of these seven files, not a rule. If
  // it were ever violated (a real `test.exclude` written textually after `coverage:`, e.g.
  // as a sibling property added below the coverage block instead of above it), the truncated
  // search would silently see none of it and report an empty/wrong exclude list — the
  // expensive failure direction: a file CI actually skips would wrongly read as "run".
  //
  // A first attempt compared the truncated result against an *untruncated* re-read of the
  // same source and flagged any disagreement — but that produces exactly the false positive
  // this file already documents above as the *expected* case: packages/core, packages/tokens,
  // packages/ui and apps/mobile-web all have a `coverage.exclude` and no `test.exclude` at
  // all, so the untruncated read legitimately finds `coverage.exclude` (there is nothing
  // else for it to find) while the truncated read correctly finds nothing — "disagreement"
  // by string comparison, but not a bug; that's the truncation working as designed.
  //
  // What actually matters is narrower: is there an `exclude:` occurrence that sits *outside*
  // the coverage block entirely (before it, which truncation already finds correctly; or
  // after the coverage block's own closing brace) — that is the one shape this file cannot
  // currently produce and truncation cannot see. Find the coverage block's real extent by
  // brace-matching (not just "the first `coverage:` string"), and flag any `exclude:` match
  // whose index falls after that block closes.
  let coverageEnd = -1
  if (coverageAt !== -1) {
    const openBrace = source.indexOf('{', coverageAt)
    if (openBrace !== -1) coverageEnd = findMatchingBrace(source, openBrace)
  }
  const excludeMatches = [...source.matchAll(/exclude\s*:\s*\[/g)]
  const truncationDisagreement = coverageEnd !== -1 && excludeMatches.some((m) => m.index > coverageEnd)
  return {
    include: extractArray(testScopedSource, 'include'),
    exclude: truncatedExclude,
    truncationDisagreement,
  }
}

/**
 * Discovers every `vitest.config.ts` / `vitest.integration.config.ts` under `apps/*` and
 * `packages/*`, rather than a hard-coded list of two apps (Musti's F3 review on #252: this
 * check false-negatived `packages/core`, and the same gap silently applied to
 * `packages/api-client`, `packages/tokens` and `packages/ui` too — every one of them ships
 * its own `vitest.config.ts` and a `"test": "vitest run"` script, all reached by the same
 * `pnpm -r test` this file already knows about). A workspace directory with no
 * `vitest.config.ts` simply contributes no project — it is not assumed to have one.
 *
 * @param {string} repoRoot
 * @returns {{prefix: string, tier: 'unit'|'integration', include: string[], exclude: string[]}[]}
 */
export function discoverVitestProjects(repoRoot) {
  const projects = []
  for (const group of ['apps', 'packages']) {
    const groupPath = path.join(repoRoot, group)
    let entries
    try {
      entries = fs.readdirSync(groupPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const prefix = `${group}/${entry.name}/`
      const unitConfig = path.join(groupPath, entry.name, 'vitest.config.ts')
      if (fs.existsSync(unitConfig)) {
        projects.push({ prefix, tier: 'unit', ...readVitestGlobs(unitConfig) })
      }
      const integrationConfig = path.join(groupPath, entry.name, 'vitest.integration.config.ts')
      if (fs.existsSync(integrationConfig)) {
        projects.push({ prefix, tier: 'integration', ...readVitestGlobs(integrationConfig) })
      }
    }
  }
  return projects
}
