// The step-up decision is made in one place (`assertStepUp`, step-up-policy.ts). It used to exist four times
// (the /v1 guard, the export, the account deletion, the better-auth plugin) with different answers: two of them
// let a request through when no session could be read.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { FreshAuthChecker, FreshAuthRequiredError, GuestSessionCannotDeleteAccountError } from '../src/auth/fresh-auth.js'
import type { BetterAuthBundle } from '../src/auth/auth.tokens.js'
import { stepUpPlugin } from '../src/auth/step-up.js'
import { assertStepUp, STEP_UP_WINDOW_MS, StepUpRefusedError } from '../src/auth/step-up-policy.js'

const now = Date.parse('2026-11-25T12:00:00Z')
const fresh = { id: 's1', userId: 'u1', createdAt: new Date(now - 60_000) }
const stale = { id: 's1', userId: 'u1', createdAt: new Date(now - STEP_UP_WINDOW_MS - 1) }
const noGrant = async () => false
const granted = async () => true

describe('assertStepUp', () => {
  it('passes a fresh session without asking for a grant', async () => {
    const hasGrant = vi.fn(noGrant)
    await expect(assertStepUp({ session: fresh, hasGrant, now })).resolves.toBe(fresh)
    expect(hasGrant).not.toHaveBeenCalled()
  })

  it('passes a stale session with a grant for exactly that session', async () => {
    const hasGrant = vi.fn(granted)
    await expect(assertStepUp({ session: stale, hasGrant, now })).resolves.toBe(stale)
    expect(hasGrant).toHaveBeenCalledWith('s1')
  })

  it('refuses a stale session without a grant', async () => {
    await expect(assertStepUp({ session: stale, hasGrant: noGrant, now })).rejects.toMatchObject({ reason: 'stale' })
  })

  it.each([null, undefined, { ...fresh, id: '' }])('fails closed without a session (%j), whatever the grant store says', async (session) => {
    await expect(assertStepUp({ session, hasGrant: granted, now })).rejects.toMatchObject({ reason: 'no-session' })
  })

  it('refuses the session of another user, fresh or granted', async () => {
    await expect(assertStepUp({ session: fresh, expectedUserId: 'u2', hasGrant: granted, now })).rejects.toMatchObject({ reason: 'other-user' })
  })

  it('a failing grant lookup is an error, never a pass', async () => {
    await expect(assertStepUp({ session: stale, hasGrant: () => Promise.reject(new Error('db down')), now })).rejects.toThrow('db down')
    await expect(assertStepUp({ session: stale, hasGrant: noGrant, now })).rejects.toBeInstanceOf(StepUpRefusedError)
  })
})

describe('the callers answer alike', () => {
  const bundle = (session: unknown, verifyPassword = vi.fn()) => ({ auth: { api: { getSession: async () => session, verifyPassword } } }) as unknown as BetterAuthBundle
  const found = (createdAt: Date, userId = 'u1') => ({ session: { id: 's1', createdAt }, user: { id: userId } })
  const checker = (grant: boolean) => new FreshAuthChecker({ hasValidGrant: async () => grant })

  it('the export refuses when no session can be read, or the session is another user’s', async () => {
    await expect(checker(true).assertFreshSessionOrStepUp(bundle(null), {}, 'u1')).rejects.toMatchObject({ status: 401 })
    await expect(checker(true).assertFreshSessionOrStepUp(bundle(found(new Date(), 'u2')), {}, 'u1')).rejects.toMatchObject({ status: 401 })
  })

  it('the export asks a stale session for the step-up and lets a fresh or granted one through', async () => {
    await expect(checker(false).assertFreshSessionOrStepUp(bundle(found(new Date(0))), {}, 'u1')).rejects.toBeInstanceOf(FreshAuthRequiredError)
    await expect(checker(true).assertFreshSessionOrStepUp(bundle(found(new Date(0))), {}, 'u1')).resolves.toBeUndefined()
    await expect(checker(false).assertFreshSessionOrStepUp(bundle(found(new Date())), {}, 'u1')).resolves.toBeUndefined()
  })

  it('the deletion takes a password only for a stale session of the caller, never instead of a session', async () => {
    const verifyPassword = vi.fn()
    await expect(checker(false).assertFreshAuth(bundle(null, verifyPassword), {}, 'u1', 'pw')).rejects.toBeInstanceOf(GuestSessionCannotDeleteAccountError)
    await expect(checker(false).assertFreshAuth(bundle(found(new Date(0), 'u2'), verifyPassword), {}, 'u1', 'pw')).rejects.toBeInstanceOf(GuestSessionCannotDeleteAccountError)
    expect(verifyPassword).not.toHaveBeenCalled()
    await expect(checker(false).assertFreshAuth(bundle(found(new Date(0)), verifyPassword), {}, 'u1', undefined)).rejects.toBeInstanceOf(FreshAuthRequiredError)
    await expect(checker(false).assertFreshAuth(bundle(found(new Date(0)), verifyPassword), {}, 'u1', 'pw')).resolves.toBeUndefined()
    expect(verifyPassword).toHaveBeenCalledTimes(1)
  })

  it('the better-auth plugin calls the same decision and maps a missing session to a refusal', () => {
    const source = readFileSync(path.join(srcRoot, 'auth', 'step-up.ts'), 'utf8')
    expect(stepUpPlugin.hooks?.before).toHaveLength(1)
    expect(source).toMatch(/await assertStepUp\(\{/)
    expect(source).toMatch(/error\.reason !== 'stale'\) throw new APIError\('UNAUTHORIZED'/)
    expect(source).not.toMatch(/if \(!session\) return\s+if \(isFreshSession/)
  })
})

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : []
  })
}

describe('lock: one step-up decision', () => {
  const files = sourceFiles(srcRoot).map((file) => ({ file: path.relative(srcRoot, file), text: readFileSync(file, 'utf8') }))

  it('only step-up-policy.ts decides freshness, and only assertStepUp callers ask the grant store', () => {
    const freshness = files.filter(({ text }) => /\bisFreshSession\(/.test(text)).map(({ file }) => file)
    expect(freshness).toEqual(['auth/step-up-policy.ts'])
    const grantReaders = files.filter(({ text }) => /\.hasValidGrant\(|findVerificationValue\(stepUpIdentifier/.test(text)).map(({ file }) => file).sort()
    expect(grantReaders).toEqual(['auth/fresh-auth.ts', 'auth/requires-step-up.ts', 'auth/step-up.ts'])
    for (const file of grantReaders) {
      const text = files.find((candidate) => candidate.file === file)!.text
      expect(text, `${file} decides through assertStepUp`).toMatch(/assertStepUp\(\{/)
      // The grant store is only ever read as the `hasGrant` of that one call.
      expect((text.match(/\.hasValidGrant\(|findVerificationValue\(stepUpIdentifier/g) ?? []).length, file).toBe((text.match(/hasGrant: /g) ?? []).length)
    }
  })

  it('every caller of assertStepUp is one of the four known ones', () => {
    const callers = files.filter(({ text }) => /\bassertStepUp\(/.test(text)).map(({ file }) => file).sort()
    expect(callers).toEqual(['auth/fresh-auth.ts', 'auth/requires-step-up.ts', 'auth/step-up-policy.ts', 'auth/step-up.ts'])
  })
})
