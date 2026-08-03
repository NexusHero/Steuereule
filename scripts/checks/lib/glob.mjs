// Minimal glob matcher — just enough for the patterns this repo's vitest configs
// actually use (`test/**/*.test.ts`, `test/acceptance/**/*.test.ts`, `src/**/*.test.tsx`,
// `*.test.tsx`, `test/acceptance/**`). No dependency pulled in for this: the vocabulary is
// small and fixed (`*`, `**`, `**/`), and a real minimatch/glob dependency would be a lot of
// supply chain for four patterns. Read `include`/`exclude` directly from the vitest config
// source (see vitest-config.mjs) rather than hard-coding them here, so a config edit can't
// silently drift from what this checker verifies.

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegExp(pattern) {
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 3
      } else {
        re += '.*'
        i += 2
      }
    } else if (c === '*') {
      re += '[^/]*'
      i += 1
    } else if (c === '?') {
      re += '[^/]'
      i += 1
    } else if ('.\\+^$()|[]{}'.includes(c)) {
      re += '\\' + c
      i += 1
    } else {
      re += c
      i += 1
    }
  }
  return new RegExp('^' + re + '$')
}

/**
 * @param {string} pattern
 * @param {string} filePath package-relative, forward-slash separated
 * @returns {boolean}
 */
export function matchGlob(pattern, filePath) {
  return globToRegExp(pattern).test(filePath)
}

/**
 * @param {string[]} patterns
 * @param {string} filePath
 * @returns {boolean}
 */
export function matchAnyGlob(patterns, filePath) {
  return patterns.some((p) => matchGlob(p, filePath))
}
