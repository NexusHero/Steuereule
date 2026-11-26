// WEB-28 lock (ADR-0102 style): the api client rejects every HTTP status >= 400 with an ApiError, so a
// generated hook's data is always a success answer and `isError` carries every failure. The pattern that hid
// five data-loss Blockers — `q.data?.status === 200 ? q.data.data : null`, which turned a failed load into
// "no data yet" and let the next save overwrite stored values with blanks — has no reason to exist any more.
// This test keeps it from coming back: a status comparison against a 2xx code, or a branch on an error status
// of a generated response, fails here with the line to fix. Screens read `q.data?.data` and render `isError`.
//
// The second half keeps every status branch of the client (packages/api-client/src/http-client.ts) and of the
// shared mapping (net/apiFailure.ts) under a row: each row sends a real answer through a generated request and
// names the kind and the German sentence it must end in. A removed branch fails its row; a status, a code or a
// kind added to the mapping without a row fails the completeness checks, which read the branches off the source.
//
// Files that talk to an endpoint outside the generated client (better-auth's `$fetch`, the multipart upload,
// a streamed response) compare statuses legitimately; each is one row below with its reason, and a row whose
// file no longer matches fails too, so the list cannot go stale.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { profileControllerGetProfile } from '@steuereule/api-client'
import { createAppI18n } from './i18n/app-i18n'
import * as failureMapping from './net/apiFailure'
import { apiFailureMessage, classifyApiFailure, refusalError, type ApiFailureKind } from './net/apiFailure'
import { server } from '../test/test-msw-server'

const SRC = join(__dirname)

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith('test-')) out.push(path)
  }
  return out
}

/** The one file that may read a status by hand: the shared mapping itself. */
const MAPPING_FILE = join('net', 'apiFailure.ts')

const RULES: ReadonlyArray<{ readonly what: string; readonly pattern: RegExp; readonly home?: string }> = [
  {
    what: 'branch on a 2xx status — a generated hook only ever resolves with success; read `.data?.data` and render `isError`',
    pattern: /\.status\s*[!=]==?\s*20[0-9]\b|\b20[0-9]\s*[!=]==?\s*[\w.?]*\.status\b/,
  },
  {
    what: 'status range check on a response — failures reject with an ApiError now; catch it and classify it with net/apiFailure',
    pattern: /\.status\s*(>=|<)\s*(300|400)\b/,
  },
  {
    what: 'a 429 or a 5xx read by hand — classify the failure with net/apiFailure (a better-auth answer through refusalError)',
    pattern: /\bstatus\s*(?:[!=]==?|>=?)\s*(?:429|499|5\d\d)\b|\b(?:429|5\d\d)\s*(?:[!=]==?|<=?)\s*[\w.?]*status\b/,
    home: MAPPING_FILE,
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
        if (!rule.pattern.test(line) || rule.home === rel) continue
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

  it('the rule for a 429 or a 5xx catches each way of writing it, and the mapping is where it is read', () => {
    const byHand = RULES.find((rule) => rule.home === MAPPING_FILE)!
    for (const line of ['if (error?.status === 429)', 'error.status >= 500', 'status > 499', 'authError.status !== 503', '503 === problem?.status']) expect(byHand.pattern.test(line), line).toBe(true)
    for (const line of ["failure.kind === 'rate-limited'", 'status === 404', 'retryAfterSeconds >= 500']) expect(byHand.pattern.test(line), line).toBe(false)
    expect(byHand.pattern.test(MAPPING_SOURCE)).toBe(true)
  })
})

type Answer =
  | { readonly status: number; readonly code?: string; readonly retryAfter?: string }
  | 'no-answer'
  | 'aborted'

interface Rejection {
  readonly answer: Answer
  readonly kind: ApiFailureKind | 'abort'
  /** The sentence key under `apiFehler`, with its values; none for an abort, which React Query swallows. */
  readonly message?: readonly [string, Record<string, unknown>] | readonly [string]
}

/** Every failure the client and the mapping tell apart, and what each one ends in. */
const REJECTIONS: readonly Rejection[] = [
  { answer: { status: 400 }, kind: 'validation', message: ['validation'] },
  { answer: { status: 401 }, kind: 'account-required', message: ['accountRequired'] },
  { answer: { status: 401, code: failureMapping.SESSION_EXPIRED }, kind: 'session-expired', message: ['sessionExpired'] },
  { answer: { status: 403, code: failureMapping.ACCOUNT_REQUIRED }, kind: 'account-required', message: ['accountRequired'] },
  { answer: { status: 403, code: failureMapping.FRESH_AUTH_REQUIRED }, kind: 'step-up', message: ['stepUp'] },
  { answer: { status: 403 }, kind: 'forbidden', message: ['forbidden'] },
  { answer: { status: 404 }, kind: 'not-found', message: ['notFound'] },
  { answer: { status: 409 }, kind: 'conflict', message: ['conflict'] },
  { answer: { status: 412 }, kind: 'conflict', message: ['conflict'] },
  { answer: { status: 413 }, kind: 'too-large', message: ['tooLarge'] },
  { answer: { status: 418 }, kind: 'unknown', message: ['unknown'] },
  { answer: { status: 422 }, kind: 'validation', message: ['validation'] },
  { answer: { status: 429 }, kind: 'rate-limited', message: ['rateLimited'] },
  { answer: { status: 429, retryAfter: '30' }, kind: 'rate-limited', message: ['rateLimitedSeconds', { seconds: 30 }] },
  { answer: { status: 429, retryAfter: '600' }, kind: 'rate-limited', message: ['rateLimitedMinutes', { minutes: 10 }] },
  { answer: { status: 500 }, kind: 'server', message: ['server'] },
  { answer: { status: 503 }, kind: 'server', message: ['server'] },
  { answer: 'no-answer', kind: 'offline', message: ['offline'] },
  { answer: 'aborted', kind: 'abort' },
]

/** Answers below the client's error threshold resolve with their status; a no-body status with `data: null`. */
const RESOLUTIONS: readonly { readonly status: number; readonly data: JsonBodyType }[] = [
  { status: 200, data: { ok: true } },
  { status: 204, data: null },
  { status: 205, data: null },
  { status: 304, data: null },
  { status: 399, data: { ok: true } },
]

const PROFILE = '*/v1/profile'
const NO_BODY = new Set([204, 205, 304])

function answer(status: number, body: JsonBodyType, headers: Record<string, string> = {}) {
  server.use(http.get(PROFILE, () => (NO_BODY.has(status) ? new HttpResponse(null, { status, headers }) : HttpResponse.json(body, { status, headers }))))
}

function label(a: Answer): string {
  if (typeof a === 'string') return a
  return [a.status, a.code, a.retryAfter && `Retry-After ${a.retryAfter}`].filter(Boolean).join(' ')
}

async function rejectionOf(a: Answer): Promise<unknown> {
  const controller = new AbortController()
  let fetchSpy: { mockRestore: () => void } | undefined
  if (a === 'no-answer') server.use(http.get(PROFILE, () => HttpResponse.error()))
  else if (a === 'aborted') {
    // React Query cancels with the AbortError fetch throws; the mock server does not watch the signal.
    controller.abort()
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
  } else answer(a.status, { statusCode: a.status, code: a.code, message: 'refused' }, a.retryAfter ? { 'retry-after': a.retryAfter } : {})
  try {
    await profileControllerGetProfile({ signal: controller.signal })
  } catch (error) {
    return error
  } finally {
    fetchSpy?.mockRestore()
  }
  throw new Error(`${label(a)} resolved`)
}

const t = createAppI18n('de').getFixedT('de', 'app')

const MAPPING_SOURCE = readFileSync(join(SRC, 'net', 'apiFailure.ts'), 'utf8')
const CLIENT_SOURCE = readFileSync(join(SRC, '..', '..', '..', 'packages', 'api-client', 'src', 'http-client.ts'), 'utf8')

function sourceOf(text: string, start: string): string {
  const from = text.indexOf(start)
  if (from < 0) throw new Error(`${start} not found`)
  return text.slice(from, text.indexOf('\n}', from))
}

const numbers = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => Number(m[1]))
const statuses = (rows: readonly Rejection[]) => rows.flatMap((row) => (typeof row.answer === 'string' ? [] : [row.answer.status]))

describe('every status branch ends in its outcome (WEB-28)', () => {
  it.each(REJECTIONS.map((row) => [label(row.answer), row] as const))('%s', async (_, row) => {
    const error = await rejectionOf(row.answer)
    if (row.kind === 'abort') {
      expect((error as Error).name).toBe('AbortError')
      return
    }
    expect(classifyApiFailure(error).kind).toBe(row.kind)
    const [key, values = {}] = row.message!
    const sentence = t(`apiFehler.${key}`, values)
    expect(sentence, `apiFehler.${key} exists in de`).not.toBe(`apiFehler.${key}`)
    expect(apiFailureMessage(error, t)).toBe(sentence)
  })

  it.each(RESOLUTIONS)('$status resolves with its status', async ({ status, data }) => {
    answer(status, data)
    await expect(profileControllerGetProfile()).resolves.toMatchObject({ status, data })
  })

  it('a refusal from outside the generated client (better-auth) reads like the same answer', () => {
    expect(classifyApiFailure(refusalError({ status: 429 })).kind).toBe('rate-limited')
    expect(classifyApiFailure(refusalError({ status: 502, code: 'INVALID_CODE' })).kind).toBe('server')
    expect(classifyApiFailure(refusalError({ status: 400 })).kind).toBe('validation')
    expect(classifyApiFailure(refusalError(null)).kind).toBe('offline')
    expect(apiFailureMessage(refusalError({ status: 429 }), t)).toBe(t('apiFehler.rateLimited'))
  })

  describe('a new branch has a row', () => {
    const kindOf = sourceOf(MAPPING_SOURCE, 'function kindOf(')

    it('every status the mapping names', () => {
      const named = numbers(kindOf, /status\s*===\s*(\d{3})/g)
      const from = numbers(kindOf, /status\s*>=\s*(\d{3})/g)
      expect(named.length + from.length).toBeGreaterThan(0)
      const covered = new Set(statuses(REJECTIONS))
      expect([...named, ...from].filter((status) => !covered.has(status))).toEqual([])
      // A range is covered inside it too, not only at its edge.
      for (const edge of from) expect(statuses(REJECTIONS).some((status) => status > edge), `a row above ${edge}`).toBe(true)
    })

    it('every code the mapping names', () => {
      const constants = [...kindOf.matchAll(/code\s*===\s*([A-Z_]+)/g)].map((m) => (failureMapping as unknown as Record<string, string>)[m[1]!])
      expect(constants.length).toBeGreaterThan(0)
      const covered = new Set(REJECTIONS.flatMap((row) => (typeof row.answer === 'string' ? [] : [row.answer.code])))
      expect(constants.filter((code) => !covered.has(code))).toEqual([])
    })

    it('every kind of failure', () => {
      const kinds = [...sourceOf(MAPPING_SOURCE, 'export type ApiFailureKind').matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
      expect(kinds.length).toBeGreaterThan(0)
      expect(kinds.filter((kind) => !REJECTIONS.some((row) => row.kind === kind))).toEqual([])
    })

    it('the client\'s error threshold and its no-body statuses', () => {
      const [threshold] = numbers(CLIENT_SOURCE, /response\.status\s*>=\s*(\d{3})/g)
      expect(threshold).toBeDefined()
      expect(statuses(REJECTIONS)).toContain(threshold)
      expect(RESOLUTIONS.map((row) => row.status)).toContain(threshold! - 1)
      const noBody = numbers(/const NO_BODY_STATUSES = new Set\(\[([^\]]*)\]\)/.exec(CLIENT_SOURCE)?.[1] ?? '', /(\d{3})/g)
      expect(noBody.length).toBeGreaterThan(0)
      expect(noBody.filter((status) => !RESOLUTIONS.some((row) => row.status === status && row.data === null))).toEqual([])
    })
  })
})

// WEB-24: a request that bypasses both the generated client and `net/apiFetch.ts` never tells the app that the
// session expired; the API has cleared the cookie by then, and the next request continues as a new guest.
describe('requests outside the generated client go through net/apiFetch (WEB-24)', () => {
  const APP_ROOT = join(SRC, '..', 'App.tsx')
  const bareFetch = /(?<![\w.$])fetch\(/

  it('no source file calls fetch itself', () => {
    const offenders = [...sourceFiles(SRC), APP_ROOT]
      .filter((file) => relative(SRC, file) !== join('net', 'apiFetch.ts'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && bareFetch.test(line))
          .map(({ index }) => `${relative(SRC, file)}:${index + 1}`),
      )
    expect(offenders).toEqual([])
  })

  it('the rule sees a bare call and not a method of that name', () => {
    expect(bareFetch.test('const response = await fetch(url)')).toBe(true)
    expect(bareFetch.test('  fetch(`${base}/v1/x`, {')).toBe(true)
    expect(bareFetch.test('await apiFetch(url)')).toBe(false)
    expect(bareFetch.test('await client.$fetch("/x")')).toBe(false)
    expect(bareFetch.test('void query.refetch()')).toBe(false)
  })
})
