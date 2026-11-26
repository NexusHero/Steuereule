// One test wrapper: a test that needs a query client takes it from `test-render.tsx` (`renderWithQuery`,
// `renderHookWithQuery`, `TestAppProviders`, `makeTestQueryClient`) instead of building its own client and
// provider stack. A test file that builds a client or mounts a QueryClientProvider of its own fails here.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Test code lives in `test/` and next to the sources in `src/`; both are scanned.
const ROOT = join(__dirname, '..')
const SCANNED = ['src', 'test']
const OWN_CLIENT = /new\s+QueryClient\(|\bQueryClientProvider\b/

/** Files that build a client for a reason of their own. */
const ALLOWED: Readonly<Record<string, string>> = {
  'test/test-render.tsx': 'the shared wrapper itself',
  'src/query-client.test.tsx': "tests the app's own defaults (APP_QUERY_DEFAULTS), which a test client replaces",
}

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...files(path))
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

function isTestSupport(rel: string): boolean {
  if (rel.startsWith('test/')) return true
  const name = rel.split('/').pop() ?? ''
  return /\.test\.tsx?$/.test(name) || name.startsWith('test-') || /TestKit\.tsx?$/.test(name)
}

describe('one test wrapper', () => {
  const builders = SCANNED.flatMap((dir) => files(join(ROOT, dir)))
    .map((file) => relative(ROOT, file))
    // This file names the pattern it forbids.
    .filter((rel) => rel !== relative(ROOT, __filename))
    .filter((rel) => isTestSupport(rel) && OWN_CLIENT.test(readFileSync(join(ROOT, rel), 'utf8')))
    .sort()

  it('no test builds a query client or a provider of its own; it renders with renderWithQuery or takes makeTestQueryClient()', () => {
    expect(builders.filter((rel) => ALLOWED[rel] === undefined)).toEqual([])
  })

  it('the allowed rows name only files that still build a client', () => {
    expect(Object.keys(ALLOWED).filter((rel) => !builders.includes(rel))).toEqual([])
  })
})
