import { describe, expect, it } from 'vitest'
import type { PartnerCouplingRecord, PartnerCouplingRepository } from '../src/link/link.repository.js'
import { couplingVisibleTo, personBConsentPending } from '../src/link/partner-consent.js'
import { taxCaseReaderOver } from '../src/tax-case/repository-tax-case.reader.js'

/**
 * Decision 3 (API-3): Person B agrees per tax year; until then Person A sees nothing of B for that year. Every
 * reader that follows `personBUserId` to B's records gets the row through `couplingVisibleTo`.
 */
const year = (over: Partial<PartnerCouplingRecord>): PartnerCouplingRecord => ({
  id: 'k1',
  personAUserId: 'a',
  personBUserId: 'b',
  taxYear: 2026,
  filingType: 'zusammen',
  invitationCode: null,
  invitationCodeValidUntil: null,
  personBConsentedAt: null,
  ...over,
})

describe('partner consent per tax year', () => {
  it('hides Person B from Person A while B has not agreed to the year', () => {
    const seen = couplingVisibleTo(year({}), 'a')
    expect(seen).toMatchObject({ filingType: 'zusammen', personBUserId: '', personBWithheld: true })
  })

  it('shows the year to Person A once B agreed', () => {
    const agreed = year({ personBConsentedAt: new Date('2026-11-25T10:00:00Z') })
    expect(couplingVisibleTo(agreed, 'a')).toBe(agreed)
  })

  it('shows the row to Person B as it is: the consent is B\'s to give', () => {
    const pending = year({})
    expect(couplingVisibleTo(pending, 'b')).toBe(pending)
  })

  it('needs no consent for a Person B without an account: those are A\'s own records', () => {
    const shadow = year({ personBUserId: 'spouse_a_2026' })
    expect(personBConsentPending(shadow)).toBe(false)
    expect(couplingVisibleTo(shadow, 'a')).toBe(shadow)
  })

  it('is not pending for a year filed separately or without a Person B', () => {
    expect(personBConsentPending(year({ filingType: 'einzel' }))).toBe(false)
    expect(personBConsentPending(year({ personBUserId: '' }))).toBe(false)
    expect(couplingVisibleTo(null, 'a')).toBeNull()
  })

  it('the tax-case reader hands every consumer the year without B', async () => {
    const coupling = { findByUserAndYear: async () => year({}) } as unknown as PartnerCouplingRepository
    const reader = taxCaseReaderOver({ coupling })
    expect((await reader.read('a', 2026, ['coupling'])).coupling).toMatchObject({ personBUserId: '', personBWithheld: true })
    expect((await reader.read('b', 2026, ['coupling'])).coupling).toMatchObject({ personBUserId: 'b' })
  })
})

describe('lock: who may follow the stored coupling to Person B', () => {
  it('every holder of the coupling repository outside the link module reads the year through couplingVisibleTo', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const src = fileURLToPath(new URL('../src/', import.meta.url))
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((file) => file.endsWith('.ts') && !file.endsWith('.module.ts'))
    const holders = files.filter((file) => /PartnerCouplingRepository|PARTNER_COUPLING_REPOSITORY/.test(readFileSync(`${src}${file}`, 'utf8')))
    // Hands the repository on to the link module's own field access (filing type only); reads no row itself.
    const passesItOn = ['confirmation/field-access.ts']
    const outside = holders.filter((file) => !file.startsWith('link/') && !passesItOn.includes(file)).sort()
    expect(outside).toEqual(['children/children.service.ts', 'household/household.service.ts', 'tax-case/repository-tax-case.reader.ts'])
    for (const file of outside) expect(readFileSync(`${src}${file}`, 'utf8'), file).toContain('couplingVisibleTo(')
  })
})
