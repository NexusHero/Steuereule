import fs from 'node:fs'
import path from 'node:path'

// Mirrors .oxlintrc.json's ignorePatterns' spirit for generated/build output — a generated
// file scanned by adr-check.mjs's reference resolution (F2) would just add noise about a
// file nobody hand-edits.
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.expo', 'generated'])

/**
 * Recursively walk `root`, yielding repo-root-relative, forward-slash paths.
 * @param {string} root absolute path to start from
 * @param {string} repoRoot absolute path to the repo root (for relativizing)
 * @returns {string[]}
 */
export function walk(root, repoRoot) {
  const out = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(abs)
      } else if (entry.isFile()) {
        out.push(path.relative(repoRoot, abs).split(path.sep).join('/'))
      }
    }
  }
  return out
}

/**
 * Build a basename -> [repo-relative paths] index, once, for the bare-filename citation
 * fallback below.
 */
export function buildBasenameIndex(allFiles) {
  const index = new Map()
  for (const f of allFiles) {
    const base = f.split('/').pop()
    if (!index.has(base)) index.set(base, [])
    index.get(base).push(f)
  }
  return index
}

/**
 * Resolve a citation's raw path text to a repo-relative path, existence, and how it was
 * resolved. The register cites some files by bare filename when the sibling citation in the
 * same cell already named the directory (e.g. "`req-011-export.test.ts`, `req-011-export-delete.test.ts`"
 * — both under apps/api/test/acceptance/, only the first spelled out). A bare filename (no
 * `/` at all) that doesn't exist at repo-root is resolved by a unique basename match against
 * the real tree, flagged separately as under-qualified (see `kind: 'basename-unique'` below)
 * rather than treated as fully precise — but still real evidence.
 *
 * Musti's F5 review on #252: this fallback used to also catch a citation that *does* contain
 * directory components that don't match reality (e.g. `acceptance/req-011-export.test.ts`,
 * missing the `apps/api/test/` prefix) — that is not shorthand, it is a wrong path, and
 * accepting it by basename means a test that later *moves* to a different directory keeps
 * passing every check that resolves through here, forever, which is exactly the imprecision
 * this register exists to rule out. Only a citation with **no slash at all** is eligible for
 * the fallback now; anything with directory components that doesn't resolve directly is
 * `missing`, full stop.
 *
 * @param {string} rawPath
 * @param {string} repoRoot
 * @param {Map<string,string[]>} basenameIndex
 */
export function resolveCitedPath(rawPath, repoRoot, basenameIndex) {
  const abs = path.join(repoRoot, rawPath)
  if (fs.existsSync(abs)) {
    return { resolved: rawPath, exists: true, kind: 'direct' }
  }
  if (rawPath.includes('/')) {
    // Has directory components that don't resolve — a wrong path, not shorthand. No fallback.
    return { resolved: rawPath, exists: false, kind: 'missing' }
  }
  const matches = basenameIndex.get(rawPath) || []
  if (matches.length === 1) {
    // Real evidence, but imprecise — the citation doesn't name where the file actually
    // lives. Callers treat this as `exists: true` for checks 2/3/5 (it genuinely is the
    // right file) but should also surface `kind === 'basename-unique'` as its own,
    // low-severity finding so these get spelled out and this fallback can eventually be
    // deleted (Musti's suggested end state).
    return { resolved: matches[0], exists: true, kind: 'basename-unique' }
  }
  if (matches.length > 1) {
    return { resolved: rawPath, exists: false, kind: 'basename-ambiguous', candidates: matches }
  }
  return { resolved: rawPath, exists: false, kind: 'missing' }
}
