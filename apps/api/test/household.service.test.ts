// #452 / ADR-0062: household at account level — migration, yearly selection, leaving, deleting,
// the one-time "Sind das dieselben?" question and shared editing by a linked spouse.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { HouseholdAccessService } from '../src/household/household-access.service.js'
import { HouseholdService } from '../src/household/household.service.js'
import { InMemoryHouseholdRepository } from '../src/household/household.repository.js'
import { PersonSealService } from '../src/household/person-seal.service.js'
import { resolveKeystoreMasterKeys } from '../src/keystore/keystore-config.js'
import { EnvelopeCryptoService } from '../src/receipt/storage/envelope-crypto.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { InMemoryUserKeyStore } from './fakes/in-memory-user-key-store.js'

const A = 'user-anna'
const B = 'user-ben'

let repo: InMemoryHouseholdRepository
let children: FakeChildRepository
let links: FakeLinkRepository
let keys: InMemoryUserKeyStore
let service: HouseholdService

beforeEach(() => {
  repo = new InMemoryHouseholdRepository()
  children = new FakeChildRepository()
  links = new FakeLinkRepository()
  keys = new InMemoryUserKeyStore()
  const crypto = new EnvelopeCryptoService(() => resolveKeystoreMasterKeys({ KEYSTORE_MASTER_KEY: 'test-master' } as NodeJS.ProcessEnv))
  const seal = new PersonSealService(keys, crypto)
  service = new HouseholdService(
    repo,
    seal,
    children,
    links,
    new FakeProfileRepository(),
    new FakeMasterDataRepository(),
    new AuditService(new FakeAuditRepository()),
    new HouseholdAccessService(repo, seal),
  )
})

const child = (taxYear: number, firstName: string, geburtsdatum: string, extra: Record<string, unknown> = {}) =>
  children.create(A, taxYear, { firstName, lastName: 'Richter', geburtsdatum, ...extra })

describe('migration (ADR-0062 §5, AC 4)', () => {
  it('merges the same child of several years into one person without touching a yearly record', async () => {
    const before = [await child(2024, 'Mila', '2019-05-12', { kinship: '1' }), await child(2025, 'Mila', '2019-05-12', { kinship: '1' })]
    const view = await service.view(A, 2025)
    expect(view.persons.filter((p) => p.kind === 'child')).toHaveLength(1)
    expect(await children.listAllForUser(A)).toEqual(before)
    expect(view.candidates).toEqual([])
  })

  it('is repeatable: running twice creates nobody twice', async () => {
    await child(2024, 'Mila', '2019-05-12')
    await service.view(A, 2025)
    await service.view(A, 2025)
    expect(repo.persons.size).toBe(1)
    expect(repo.memberships.size).toBe(1)
  })

  it('asks exactly once about a typo and merges on „dieselben“', async () => {
    await child(2024, 'Mila', '2019-05-12')
    await child(2025, 'Milla', '2019-05-12')
    let view = await service.view(A, 2025)
    expect(view.candidates).toHaveLength(1)
    view = await service.view(A, 2025)
    expect(view.candidates).toHaveLength(1)

    view = await service.answerCandidate(A, view.candidates[0]!.id, true, 2025)
    expect(view.persons).toHaveLength(1)
    expect(view.candidates).toEqual([])
  })

  it('keeps both and stops asking on „nicht dieselben“', async () => {
    await child(2024, 'Mila', '2019-05-12')
    await child(2025, 'Milla', '2019-05-12')
    const view = await service.view(A, 2025)
    const after = await service.answerCandidate(A, view.candidates[0]!.id, false, 2025)
    expect(after.persons).toHaveLength(2)
    expect(after.candidates).toEqual([])
  })
})

describe('a new tax year (decision 3, AC 1/3)', () => {
  it('preselects last year’s children, marks them, and adopts them without retyping', async () => {
    await child(2025, 'Mila', '2019-05-12', { taxId: '12345678903', kinship: '1', childBenefitClaimEur: '3060' })
    const view = await service.view(A, 2026)
    const mila = view.persons.find((p) => p.firstName === 'Mila')!
    expect(mila).toMatchObject({ inThisYear: false, preselected: true, fromYear: 2025 })

    const adopted = await service.adoptChildren(A, 2026, [mila.personId])
    expect(adopted.persons.find((p) => p.personId === mila.personId)?.inThisYear).toBe(true)
    const [row] = await children.listForUserAndYear(A, 2026)
    expect(row).toMatchObject({ firstName: 'Mila', geburtsdatum: '2019-05-12', taxId: '12345678903', kinship: '1' })
    // Yearly answers are asked again, never copied silently (decision 4).
    expect(row!.childBenefitClaimEur).toBeNull()
  })

  it('does not preselect a child older than 25, but keeps it selectable', async () => {
    await child(2025, 'Jonas', '1999-03-01')
    const jonas = (await service.view(A, 2026)).persons[0]!
    expect(jonas).toMatchObject({ preselected: false, selectable: true })
  })

  it('asks about education from 18', async () => {
    await child(2025, 'Lea', '2008-06-01')
    expect((await service.view(A, 2026)).persons[0]!.asksForEducation).toBe(true)
  })
})

describe('leaving and deleting (decision 6, AC 5)', () => {
  it('„ab 2026 nicht mehr dabei“ leaves 2025 unchanged', async () => {
    const y2025 = await child(2025, 'Mila', '2019-05-12')
    const view = await service.view(A, 2026)
    await service.adoptChildren(A, 2026, [view.persons[0]!.personId])
    await service.leaveFromYear(A, view.persons[0]!.personId, 2026)
    expect(await children.listForUserAndYear(A, 2025)).toEqual([y2025])
    expect(await children.listForUserAndYear(A, 2026)).toEqual([])
    expect((await service.view(A, 2026)).persons[0]).toMatchObject({ selectable: false, preselected: false })
  })

  it('„endgültig löschen“ removes every year and destroys the person’s key', async () => {
    await child(2024, 'Mila', '2019-05-12')
    await child(2025, 'Mila', '2019-05-12')
    const personId = (await service.view(A, 2025)).persons[0]!.personId
    const sealed = repo.persons.get(personId)!.sealed
    await service.deletePerson(A, personId, 2025)
    expect(await children.listAllForUser(A)).toEqual([])
    expect(keys.destroyed).toContain(`household-person:${personId}`)
    // Even a leftover copy of the sealed facts is unreadable now.
    const seal = new PersonSealService(keys, new EnvelopeCryptoService(() => resolveKeystoreMasterKeys({ KEYSTORE_MASTER_KEY: 'test-master' } as NodeJS.ProcessEnv)))
    expect(await seal.unseal(personId, sealed)).toBeNull()
  })
})

describe('shared children of a linked couple (decision 7, AC 6)', () => {
  it('lets the linked spouse see and edit the shared children, recording who changed them', async () => {
    await repo.upsertPartnerLink(A, { personBUserId: B, spousePersonId: null, validFromYear: 2025, endedFromYear: null })
    const mila = await child(2025, 'Mila', '2019-05-12')
    expect(await service.householdOwner(B, 2025)).toBe(A)

    const viewB = await service.view(B, 2025)
    expect(viewB.persons.map((p) => p.firstName)).toEqual(['Mila'])
    await service.recordChildEdit(B, mila.id, { firstName: 'Mila Sophie' })
    const viewA = await service.view(A, 2025)
    expect(viewA.persons[0]).toMatchObject({ firstName: 'Mila Sophie', updatedBySelf: false })
  })

  it('stops sharing once the link has ended', async () => {
    await repo.upsertPartnerLink(A, { personBUserId: B, spousePersonId: null, validFromYear: 2024, endedFromYear: 2026 })
    expect(await service.householdOwner(B, 2025)).toBe(A)
    expect(await service.householdOwner(B, 2026)).toBe(B)
  })

  it('refuses a person from someone else’s household', async () => {
    await child(2025, 'Mila', '2019-05-12')
    const personId = (await service.view(A, 2025)).persons[0]!.personId
    await expect(service.deletePerson('user-stranger', personId, 2025)).rejects.toMatchObject({ code: 'HOUSEHOLD_PERSON_NOT_FOUND' })
  })
})
