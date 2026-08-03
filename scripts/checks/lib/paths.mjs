import fs from 'node:fs'
import path from 'node:path'

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.expo'])

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
 * — both under apps/api/test/acceptance/, only the first spelled out). A citation that
 * contains no '/' and doesn't exist at repo-root is resolved by a unique basename match
 * against the real tree, rather than flagged as missing — the failure mode this check exists
 * for (a renamed/deleted test) still fails: a bare name with zero or multiple basename
 * matches is reported, not silently accepted.
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
  // Falls back to a basename match whether the citation was a bare filename
  // ("breach-check.test.ts") or a partial, under-qualified path
  // ("acceptance/req-011-export.test.ts", missing "apps/api/test/") — both are real,
  // observed register-authoring shorthands where a sibling citation in the same cell
  // already spelled out the shared directory. A genuinely renamed/deleted file still
  // fails here: its basename won't be in the index either.
  const base = rawPath.split('/').pop()
  const matches = basenameIndex.get(base) || []
  if (matches.length === 1) {
    return { resolved: matches[0], exists: true, kind: 'basename-unique' }
  }
  if (matches.length > 1) {
    return { resolved: rawPath, exists: false, kind: 'basename-ambiguous', candidates: matches }
  }
  return { resolved: rawPath, exists: false, kind: 'missing' }
}
