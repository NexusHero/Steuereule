// #452 / ADR-0062 §3: the spouse is linked once, not per year.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { HouseholdAccessService } from '../src/household/household-access.service.js'
import { InMemoryHouseholdRepository } from '../src/household/household.repository.js'
import { HouseholdService } from '../src/household/household.service.js'
import { PersonSealService } from '../src/household/person-seal.service.js'
import { resolveKeystoreMasterKeys } from '../src/keystore/keystore-config.js'
import { LinkService } from '../src/link/link.service.js'
import { EnvelopeCryptoService } from '../src/receipt/storage/envelope-crypto.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { InMemoryUserKeyStore } from './fakes/in-memory-user-key-store.js'

const A = 'user-thomas'
const B = 'user-sabine'

let links: FakeLinkRepository
let profiles: FakeProfileRepository
let masterData: FakeMasterDataRepository
let link: LinkService
let household: HouseholdService

beforeEach(() => {
  links = new FakeLinkRepository()
  profiles = new FakeProfileRepository()
  masterData = new FakeMasterDataRepository()
  const repo = new InMemoryHouseholdRepository()
  const seal = new PersonSealService(new InMemoryUserKeyStore(), new EnvelopeCryptoService(() => resolveKeystoreMasterKeys({ KEYSTORE_MASTER_KEY: 'test-master' } as NodeJS.ProcessEnv)))
  const access = new HouseholdAccessService(repo, seal)
  const audit = new AuditService(new FakeAuditRepository())
  link = new LinkService(links, profiles, masterData, audit, access)
  household = new HouseholdService(repo, seal, new FakeChildRepository(), links, profiles, masterData, audit, access)
})

describe('spouse linked once (#452 decision 2, AC 2)', () => {
  it('keeps a spouse with an own account linked in the next year without a new invitation code', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)

    const y2026 = await link.set(A, 2026, { filingType: 'zusammen' })
    expect(y2026.personBUserId).toBe(B)
    expect(y2026.personBHasOwnAccount).toBe(true)
    expect(y2026.invitationCode).toBeNull()
  })

  it('keeps the link across a switch to separate filing and back (PO decision 10.11.2026)', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    await link.set(A, 2026, { filingType: 'einzel' })
    const back = await link.set(A, 2026, { filingType: 'zusammen' })
    expect(back.personBUserId).toBe(B)
    expect(back.invitationCode).toBeNull()
  })

  it('prefills a spouse without an account in the next year from the household', async () => {
    await link.set(A, 2025, { filingType: 'zusammen' })
    await link.updatePersonB(A, 2025, { firstName: 'Sabine', lastName: 'Weber', steuerId: '12345678903', geburtsdatum: '1986-04-02' })
    await household.view(A, 2025) // the household migration picks the spouse up

    const y2026 = await link.set(A, 2026, { filingType: 'zusammen' })
    expect(y2026.personB).toMatchObject({ firstName: 'Sabine', lastName: 'Weber', steuerId: '12345678903', geburtsdatum: '1986-04-02' })
  })

  it('ends with „ab Jahr X nicht mehr dabei“ (e.g. divorce from 2026)', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    await household.endPartnerLink(A, 2026)
    const y2026 = await link.set(A, 2026, { filingType: 'zusammen' })
    expect(y2026.personBUserId).not.toBe(B)
    expect(y2026.invitationCode).not.toBeNull()
  })
})
