import fs from 'node:fs'

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
  return {
    include: extractArray(source, 'include'),
    exclude: extractArray(source, 'exclude'),
  }
}
