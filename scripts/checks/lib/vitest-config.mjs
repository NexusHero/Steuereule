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

/**
 * @param {string} configPath absolute path to a vitest.config.ts
 * @returns {{include: string[], exclude: string[]}}
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
  return {
    include: extractArray(testScopedSource, 'include'),
    exclude: extractArray(testScopedSource, 'exclude'),
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
