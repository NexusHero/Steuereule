// WEB-28 lock (ADR-0102 style): the api client rejects every HTTP status >= 400 with an ApiError, so a
// generated hook's data is always a success answer and `isError` carries every failure. The pattern that hid
// five data-loss Blockers — `q.data?.status === 200 ? q.data.data : null`, which turned a failed load into
// "no data yet" and let the next save overwrite stored values with blanks — has no reason to exist any more.
// This test keeps it from coming back: a status comparison against a 2xx code, or a branch on an error status
// of a generated response, fails here with the line to fix. Screens read `q.data?.data` and render `isError`.
//
// Files that talk to an endpoint outside the generated client (better-auth's `$fetch`, the multipart upload,
// a streamed response) compare statuses legitimately; each is one row below with its reason, and a row whose
// file no longer matches fails too, so the list cannot go stale.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/^test-/.test(name)) out.push(path)
  }
  return out
}

const RULES: ReadonlyArray<{ readonly what: string; readonly pattern: RegExp }> = [
  {
    what: 'branch on a 2xx status — a generated hook only ever resolves with success; read `.data?.data` and render `isError`',
    pattern: /\.status\s*[!=]==?\s*20[0-9]\b|\b20[0-9]\s*[!=]==?\s*[\w.?]*\.status\b/,
  },
  {
    what: 'status range check on a response — failures reject with an ApiError now; catch it and classify it with net/apiFailure',
    pattern: /\.status\s*(>=|<)\s*(300|400)\b/,
  },
]

/**
 * Files outside the generated client that compare HTTP statuses of their own fetch. The reason is the review
 * record; the test fails if a listed file no longer matches a rule.
 */
const ALLOWED: Readonly<Record<string, string>> = {}

function violations(): { readonly found: string[]; readonly matchedAllowed: Set<string> } {
  const found: string[] = []
  const matchedAllowed = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return
      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue
        if (ALLOWED[rel] !== undefined) {
          matchedAllowed.add(rel)
          continue
        }
        found.push(`${rel}:${i + 1} — ${rule.what}`)
      }
    })
  }
  return { found, matchedAllowed }
}

describe('API error handling (WEB-28)', () => {
  const { found, matchedAllowed } = violations()

  it('no screen reads a status code off a generated response; failures arrive as isError / a rejected ApiError', () => {
    expect(found).toEqual([])
  })

  it('every allowed exception still needs its row', () => {
    expect(Object.keys(ALLOWED).filter((file) => !matchedAllowed.has(file))).toEqual([])
  })
})
