// Decision 3 (ADR-0111): Person B with an own account agrees per tax year; until then Person A sees nothing of B
// for that year. The consent used to be checked in LinkService only, so the estimate, the printout, the
// submission, the year history, the child allowances and the household import still read B's data for a year B
// had not agreed to. Everything outside the link module now reads a coupling through `couplingForDataAccess`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { couplingForDataAccess, personBConsentPending, type PartnerCouplingRecord } from '../src/link/link.repository.js'
import { taxCaseReaderOver } from '../src/tax-case/repository-tax-case.reader.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'

const row = (change: Partial<PartnerCouplingRecord> = {}): PartnerCouplingRecord => ({
  id: 'k1',
  personAUserId: 'a',
  personBUserId: 'b',
  taxYear: 2026,
  filingType: 'zusammen',
  invitationCode: null,
  invitationCodeValidUntil: null,
  personBConsentedAt: null,
  ...change,
})

describe('couplingForDataAccess', () => {
  it('gives Person A the year without B while B has not agreed', () => {
    expect(couplingForDataAccess(row(), 'a')).toMatchObject({ filingType: 'zusammen', personAUserId: 'a', personBUserId: '' })
  })

  it('gives Person A the year with B once B agreed', () => {
    expect(couplingForDataAccess(row({ personBConsentedAt: new Date() }), 'a')?.personBUserId).toBe('b')
  })

  it('leaves Person B’s own view unchanged: B reaches A’s side of a year A set up', () => {
    expect(couplingForDataAccess(row(), 'b')).toEqual(row())
  })

  it('a Person B whom A records under a shadow id is A’s own record and needs no consent', () => {
    const shadow = row({ personBUserId: 'spouse_a_2026' })
    expect(personBConsentPending(shadow)).toBe(false)
    expect(couplingForDataAccess(shadow, 'a')).toEqual(shadow)
  })

  it('a row whose consent column is missing counts as not agreed', () => {
    const { personBConsentedAt: _dropped, ...legacy } = row()
    expect(couplingForDataAccess(legacy as PartnerCouplingRecord, 'a')?.personBUserId).toBe('')
  })

  it('no coupling stays no coupling', () => {
    expect(couplingForDataAccess(null, 'a')).toBeNull()
  })
})

describe('the tax case reader (estimate, printout, submission, year history)', () => {
  it('hands Person A no way to B’s rows for a year B has not agreed to, and does after the consent', async () => {
    const links = new FakeLinkRepository()
    const created = await links.upsert('a', 2026, { personBUserId: 'b', filingType: 'zusammen' })
    const reader = taxCaseReaderOver({ coupling: links })
    expect((await reader.read('a', 2026, ['coupling'])).coupling).toMatchObject({ filingType: 'zusammen', personBUserId: '' })
    expect((await reader.read('b', 2026, ['coupling'])).coupling).toMatchObject({ personAUserId: 'a', personBUserId: 'b' })
    await links.recordPersonBConsent(created.id, 'b', new Date())
    expect((await reader.read('a', 2026, ['coupling'])).coupling).toMatchObject({ personBUserId: 'b' })
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

/** Who may hold the coupling repository outside the link module, and how each keeps the consent. */
const COUPLING_READERS: Readonly<Record<string, RegExp | string>> = {
  'tax-case/repository-tax-case.reader.ts': /couplingForDataAccess\(\(await r\.coupling\?\.findByUserAndYear\(userId, year\)\) \?\? null, userId\)/,
  'children/children.service.ts': /couplingForDataAccess\(await this\.link\.findByUserAndYear\(userId, year\), userId\)/,
  'household/household.service.ts': /l\.personBUserId !== '' && !personBConsentPending\(l\)/,
  'confirmation/confirmation.module.ts': 'passes the repository to linkFieldAccess (link module), which exposes the filing type and the own invitation code only',
  'confirmation/field-access.ts': 'passes the repository to linkFieldAccess (link module), which exposes the filing type and the own invitation code only',
}

/** The two holders that only hand the repository on to the link module. */
const PASS_THROUGH = new Set(['confirmation/confirmation.module.ts', 'confirmation/field-access.ts'])

describe('lock: nobody reads Person B through a raw coupling', () => {
  const files = sourceFiles(srcRoot)
    .map((file) => ({ file: path.relative(srcRoot, file), text: readFileSync(file, 'utf8') }))
    .filter(({ file }) => !file.startsWith(`link${path.sep}`))

  it('every holder of the coupling repository outside the link module is listed with its consent check', () => {
    const holders = files.filter(({ text }) => /PARTNER_COUPLING_REPOSITORY|PartnerCouplingRepository/.test(text)).map(({ file }) => file).sort()
    expect(holders).toEqual(Object.keys(COUPLING_READERS).sort())
    for (const { file, text } of files) {
      const rule = COUPLING_READERS[file]
      if (rule instanceof RegExp) expect(text, file).toMatch(rule)
    }
  })

  it('a raw coupling lookup outside the link module is always wrapped', () => {
    for (const { file, text } of files) {
      if (!(file in COUPLING_READERS) || PASS_THROUGH.has(file)) continue
      const lookups = (text.match(/\b(?:link|links|coupling)\??\.(?:findByUserAndYear|listForPersonA)\(/g) ?? []).length
      const guarded = (text.match(/couplingForDataAccess\(|personBConsentPending\(/g) ?? []).length
      expect(guarded, file).toBeGreaterThanOrEqual(lookups)
    }
  })

  it('the pass-through holders never look a coupling up themselves', () => {
    for (const { file, text } of files) {
      if (PASS_THROUGH.has(file)) expect(text, file).not.toMatch(/\.(?:findByUserAndYear|listForPersonA)\(/)
    }
  })

  it('the confirmation path sees only the filing type and the invitation code of a coupling', () => {
    const access = readFileSync(path.join(srcRoot, 'link', 'link-field-access.ts'), 'utf8')
    const read = access.slice(access.indexOf('async read('), access.indexOf('async write('))
    expect(read).not.toMatch(/personBUserId/)
  })
})
