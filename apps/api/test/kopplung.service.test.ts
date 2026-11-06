import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { LinkPersonBDto, SetLinkDto } from '../src/kopplung/dto/kopplung.dto.js'
import { LinkService } from '../src/kopplung/kopplung.service.js'
import { FakeLinkRepository } from './fakes/fake-kopplung.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-stammdaten.repository.js'

class FakeAuditService {
  readonly logs: unknown[] = []
  append(data: unknown): Promise<void> {
    this.logs.push(data)
    return Promise.resolve()
  }
}

function setup() {
  const linkRepo = new FakeLinkRepository()
  const profileRepo = new FakeProfileRepository()
  const masterDataRepo = new FakeMasterDataRepository()
  const service = new LinkService(linkRepo, profileRepo, masterDataRepo, new FakeAuditService() as never)
  return { service, profileRepo, stammdatenRepo: masterDataRepo }
}

async function validationErrors(dtoClass: new () => object, plain: object): Promise<string[]> {
  const errors = await validate(plainToInstance(dtoClass, plain), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

const year = 2025

describe('KopplungService', () => {
  it('manages Zusammenveranlagung and Person B updates', async () => {
    const { service } = setup()
    const userId = 'user-a'

    expect((await service.get(userId, year)).filingType).toBe('keine')

    const setRes = await service.set(userId, year, { filingType: 'zusammen' })
    expect(setRes.filingType).toBe('zusammen')
    expect(setRes.personBHasOwnAccount).toBe(false)

    const updated = await service.updatePersonB(userId, year, {
      firstName: 'Max',
      lastName: 'Mustermann',
      steuerId: '98765432109',
      geburtsdatum: '1989-03-25',
      beruf: 'Entwickler',
    })
    expect(updated.personB).toMatchObject({
      firstName: 'Max',
      lastName: 'Mustermann',
      steuerId: '98765432109',
      geburtsdatum: '1989-03-25',
      beruf: 'Entwickler',
    })

    const singleRes = await service.set(userId, year, { filingType: 'einzel' })
    expect(singleRes.filingType).toBe('einzel')
    expect(singleRes.personB).toBeNull()
  })

  it('allows spouse to join with einladungsCode, once', async () => {
    const { service } = setup()
    const { invitationCode } = await service.set('user-a', year, { filingType: 'zusammen' })

    const joined = await service.joinWithCode('user-b', year, invitationCode!)
    expect(joined.personBUserId).toBe('user-b')
    expect(joined.personBHasOwnAccount).toBe(true)

    await expect(service.joinWithCode('user-c', year, invitationCode!)).rejects.toThrow()
  })

  it('an einladungsCode expires after 14 days; choosing Zusammenveranlagung again mints a fresh one', async () => {
    const { service } = setup()
    const created = new Date('2025-03-01T10:00:00Z')
    const { invitationCode, invitationCodeValidUntil } = await service.set('user-a', year, { filingType: 'zusammen' }, created)
    expect(invitationCodeValidUntil).toBe('2025-03-15T10:00:00.000Z')

    const later = new Date('2025-03-15T10:00:01Z')
    await expect(service.joinWithCode('user-b', year, invitationCode!, later)).rejects.toMatchObject({ code: 'INVITATION_CODE_EXPIRED' })

    const fresh = await service.set('user-a', year, { filingType: 'zusammen' }, later)
    expect(fresh.invitationCode).not.toBe(invitationCode)
    expect((await service.joinWithCode('user-b', year, fresh.invitationCode!, later)).personBHasOwnAccount).toBe(true)
  })

  it('keeps a still-valid einladungsCode when Zusammenveranlagung is chosen again', async () => {
    const { service } = setup()
    const created = new Date('2025-03-01T10:00:00Z')
    const first = await service.set('user-a', year, { filingType: 'zusammen' }, created)
    const again = await service.set('user-a', year, { filingType: 'zusammen' }, new Date('2025-03-05T10:00:00Z'))
    expect(again.invitationCode).toBe(first.invitationCode)
  })

  it('mints an einladungsCode with at least 64 bits of entropy', async () => {
    const { service } = setup()
    const { invitationCode } = await service.set('user-a', year, { filingType: 'zusammen' })
    expect(invitationCode).toMatch(/^[0-9A-F]{16}$/)
  })

  it("refuses to overwrite a joined partner's own account data", async () => {
    const { service, profileRepo } = setup()
    const { invitationCode } = await service.set('user-a', year, { filingType: 'zusammen' })
    await service.joinWithCode('user-b', year, invitationCode!)
    await profileRepo.upsert('user-b', { firstName: 'Bea', lastName: 'Echt', steuerId: '12345678903', steuernummer: null })

    await expect(service.updatePersonB('user-a', year, { steuerId: '98765432109' })).rejects.toMatchObject({ code: 'PERSON_B_OWNS_DATA' })
    await expect(service.updatePersonB('user-b', year, { firstName: 'Mallory' })).rejects.toMatchObject({ code: 'PERSON_B_OWNS_DATA' })
    expect((await profileRepo.findByUserId('user-b'))?.steuerId).toBe('12345678903')
  })

  it('lets only Person A change the Veranlagungsart', async () => {
    const { service } = setup()
    const { invitationCode } = await service.set('user-a', year, { filingType: 'zusammen' })
    await service.joinWithCode('user-b', year, invitationCode!)

    await expect(service.set('user-b', year, { filingType: 'zusammen' })).rejects.toMatchObject({
      code: 'VERANLAGUNGSART_OWNED_BY_PERSON_A',
    })
  })

  it('never records a religion consent nobody gave (Art. 9 DSGVO)', async () => {
    const { service, stammdatenRepo: masterDataRepo } = setup()
    await service.set('user-a', year, { filingType: 'zusammen' })

    const { personBUserId } = await service.updatePersonB('user-a', year, { beruf: 'Lehrerin' })
    expect((await masterDataRepo.findByUserId(personBUserId!))?.religionEinwilligungAm).toBeNull()

    await expect(service.updatePersonB('user-a', year, { religion: 'EV' })).rejects.toMatchObject({ code: 'RELIGION_CONSENT_REQUIRED' })

    await service.updatePersonB('user-a', year, { religion: 'EV', religionConsent: true })
    expect((await masterDataRepo.findByUserId(personBUserId!))?.religionEinwilligungAm).toBeInstanceOf(Date)
  })
})

describe('KopplungService.datenNutzer — whose figures a request touches (ADR-0054)', () => {
  it("is the caller's own id without person=B", async () => {
    const { service } = setup()
    expect(await service.dataUser('user-a', year, 'A')).toBe('user-a')
  })

  it("lets Person A record Person B's figures under B's shadow id while B has no account", async () => {
    const { service } = setup()
    const { personBUserId } = await service.set('user-a', year, { filingType: 'zusammen' })
    expect(await service.dataUser('user-a', year, 'B')).toBe(personBUserId)
  })

  it('refuses without a Zusammenveranlagung, for Person B, and once B has an own account', async () => {
    const { service } = setup()
    await expect(service.dataUser('user-a', year, 'B')).rejects.toMatchObject({ code: 'NO_ACTIVE_ZUSAMMENVERANLAGUNG' })

    const { invitationCode } = await service.set('user-a', year, { filingType: 'zusammen' })
    await service.joinWithCode('user-b', year, invitationCode!)
    await expect(service.dataUser('user-a', year, 'B')).rejects.toMatchObject({ code: 'PERSON_B_OWNS_DATA' })
    await expect(service.dataUser('user-b', year, 'B')).rejects.toMatchObject({ code: 'ONLY_PERSON_A_RECORDS_FOR_B' })
  })
})

describe('Kopplung DTOs', () => {
  it('rejects a client-chosen personBUserId — a real partner links only via einladungsCode', async () => {
    expect(await validationErrors(SetLinkDto, { veranlagungsart: 'zusammen', personBUserId: 'victim' })).toContain(
      'personBUserId',
    )
  })

  it("validates Person B's Steuer-ID and religion key like the own Stammdaten", async () => {
    expect(await validationErrors(LinkPersonBDto, { steuerId: '123' })).toContain('steuerId')
    expect(await validationErrors(LinkPersonBDto, { religion: 'xyz' })).toContain('religion')
    expect(await validationErrors(LinkPersonBDto, { steuerId: null, religion: 'EV', religionConsent: true })).toEqual([])
  })
})
