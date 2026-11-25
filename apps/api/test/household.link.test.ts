// #452 / ADR-0062 §3: the spouse is linked once, not per year.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { HouseholdAccessService } from '../src/household-core/household-access.service.js'
import { InMemoryHouseholdRepository } from '../src/household-core/household.repository.js'
import { HouseholdService } from '../src/household/household.service.js'
import { PersonSealService } from '../src/household-core/person-seal.service.js'
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

// API-3 / decision 3: Person B agrees per tax year in B's own app; until then A sees nothing of B for that year.
describe('per-year consent of Person B (decision 3, API-3)', () => {
  it('a later year of the link shows A nothing of B until B agrees; B is asked in B’s own app', async () => {
    await profiles.upsert(B, { firstName: 'Sabine', lastName: 'Muster', steuerId: '12345678901', steuernummer: null })
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    expect((await link.get(A, 2025)).personB?.firstName).toBe('Sabine')

    const y2026 = await link.set(A, 2026, { filingType: 'zusammen' })
    expect(y2026.personB).toBeNull()
    expect(y2026.personBConsentPending).toBe(true)
    expect(await link.spouseForAdvisor(A, 2026)).toBeNull()
    expect((await link.get(B, 2026)).consentRequestedFromMe).toBe(true)

    await link.consentForYear(B, 2026)
    const shared = await link.get(A, 2026)
    expect(shared.personBConsentPending).toBe(false)
    expect(shared.personB?.steuerId).toBe('12345678901')
  })

  it('Person B takes the consent of a year back; A sees nothing of B for it at once, and B can agree again', async () => {
    await profiles.upsert(B, { firstName: 'Sabine', lastName: 'Muster', steuerId: '12345678901', steuernummer: null })
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    expect((await link.get(B, 2025)).consentGivenByMe).toBe(true)

    const withdrawn = await link.withdrawConsentForYear(B, 2025)
    expect(withdrawn).toMatchObject({ consentGivenByMe: false, consentRequestedFromMe: true })
    const seenByA = await link.get(A, 2025)
    expect(seenByA.personB).toBeNull()
    expect(seenByA.personBConsentPending).toBe(true)
    expect(await link.spouseForAdvisor(A, 2025)).toBeNull()

    await link.consentForYear(B, 2025)
    expect((await link.get(A, 2025)).personB?.firstName).toBe('Sabine')
  })

  it('only Person B can take a consent back, and only one that was given', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await expect(link.withdrawConsentForYear(A, 2025)).rejects.toMatchObject({ code: 'NO_CONSENT_GIVEN' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    await expect(link.withdrawConsentForYear('someone-else', 2025)).rejects.toMatchObject({ code: 'NO_CONSENT_GIVEN' })
    await link.withdrawConsentForYear(B, 2025)
    await expect(link.withdrawConsentForYear(B, 2025)).rejects.toMatchObject({ code: 'NO_CONSENT_GIVEN' })
  })

  it('only Person B can agree, and only to a year that waits for it', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await expect(link.consentForYear(A, 2025)).rejects.toMatchObject({ code: 'NO_CONSENT_REQUESTED' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    await expect(link.consentForYear('someone-else', 2025)).rejects.toMatchObject({ code: 'NO_CONSENT_REQUESTED' })
  })

  it('a code redeemed once cannot be redeemed by a second account (API-8)', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    await expect(link.joinWithCode('user-third', 2025, y2025.invitationCode!)).rejects.toMatchObject({ code: 'INVITATION_CODE_INVALID' })
    expect((await link.get(A, 2025)).personBUserId).toBe(B)
  })

  it('the linked partner cannot delete a household person across every year; Person A can', async () => {
    const y2025 = await link.set(A, 2025, { filingType: 'zusammen' })
    await link.joinWithCode(B, 2025, y2025.invitationCode!)
    await household.view(A, 2025)
    const spouse = (await household.view(A, 2025)).persons[0]
    const personId = spouse?.personId ?? 'any-person'
    await expect(household.deletePerson(B, personId, 2025)).rejects.toMatchObject({ code: 'ONLY_HOUSEHOLD_OWNER_DELETES' })
  })
})
