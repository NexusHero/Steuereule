import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { KopplungPersonBDto, SetKopplungDto } from '../src/kopplung/dto/kopplung.dto.js'
import { KopplungService } from '../src/kopplung/kopplung.service.js'
import { FakeKopplungRepository } from './fakes/fake-kopplung.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeStammdatenRepository } from './fakes/fake-stammdaten.repository.js'

class FakeAuditService {
  readonly logs: unknown[] = []
  append(data: unknown): Promise<void> {
    this.logs.push(data)
    return Promise.resolve()
  }
}

function setup() {
  const kopplungRepo = new FakeKopplungRepository()
  const profileRepo = new FakeProfileRepository()
  const stammdatenRepo = new FakeStammdatenRepository()
  const service = new KopplungService(kopplungRepo, profileRepo, stammdatenRepo, new FakeAuditService() as never)
  return { service, profileRepo, stammdatenRepo }
}

async function validationErrors(dtoClass: new () => object, plain: object): Promise<string[]> {
  const errors = await validate(plainToInstance(dtoClass, plain), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

const jahr = 2025

describe('KopplungService', () => {
  it('manages Zusammenveranlagung and Person B updates', async () => {
    const { service } = setup()
    const userId = 'user-a'

    expect((await service.get(userId, jahr)).veranlagungsart).toBe('keine')

    const setRes = await service.set(userId, jahr, { veranlagungsart: 'zusammen' })
    expect(setRes.veranlagungsart).toBe('zusammen')
    expect(setRes.personBHatEigenesKonto).toBe(false)

    const updated = await service.updatePersonB(userId, jahr, {
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

    const einzelRes = await service.set(userId, jahr, { veranlagungsart: 'einzel' })
    expect(einzelRes.veranlagungsart).toBe('einzel')
    expect(einzelRes.personB).toBeNull()
  })

  it('allows spouse to join with einladungsCode, once', async () => {
    const { service } = setup()
    const { einladungsCode } = await service.set('user-a', jahr, { veranlagungsart: 'zusammen' })

    const joined = await service.joinWithCode('user-b', jahr, einladungsCode!)
    expect(joined.personBUserId).toBe('user-b')
    expect(joined.personBHatEigenesKonto).toBe(true)

    await expect(service.joinWithCode('user-c', jahr, einladungsCode!)).rejects.toThrow()
  })

  it('mints an einladungsCode with at least 64 bits of entropy', async () => {
    const { service } = setup()
    const { einladungsCode } = await service.set('user-a', jahr, { veranlagungsart: 'zusammen' })
    expect(einladungsCode).toMatch(/^[0-9A-F]{16}$/)
  })

  it("refuses to overwrite a joined partner's own account data", async () => {
    const { service, profileRepo } = setup()
    const { einladungsCode } = await service.set('user-a', jahr, { veranlagungsart: 'zusammen' })
    await service.joinWithCode('user-b', jahr, einladungsCode!)
    await profileRepo.upsert('user-b', { firstName: 'Bea', lastName: 'Echt', steuerId: '12345678903', steuernummer: null })

    await expect(service.updatePersonB('user-a', jahr, { steuerId: '98765432109' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(service.updatePersonB('user-b', jahr, { firstName: 'Mallory' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect((await profileRepo.findByUserId('user-b'))?.steuerId).toBe('12345678903')
  })

  it('lets only Person A change the Veranlagungsart', async () => {
    const { service } = setup()
    const { einladungsCode } = await service.set('user-a', jahr, { veranlagungsart: 'zusammen' })
    await service.joinWithCode('user-b', jahr, einladungsCode!)

    await expect(service.set('user-b', jahr, { veranlagungsart: 'zusammen' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('never records a religion consent nobody gave (Art. 9 DSGVO)', async () => {
    const { service, stammdatenRepo } = setup()
    await service.set('user-a', jahr, { veranlagungsart: 'zusammen' })

    const { personBUserId } = await service.updatePersonB('user-a', jahr, { beruf: 'Lehrerin' })
    expect((await stammdatenRepo.findByUserId(personBUserId!))?.religionEinwilligungAm).toBeNull()

    await expect(service.updatePersonB('user-a', jahr, { religion: 'EV' })).rejects.toBeInstanceOf(
      BadRequestException,
    )

    await service.updatePersonB('user-a', jahr, { religion: 'EV', religionEinwilligung: true })
    expect((await stammdatenRepo.findByUserId(personBUserId!))?.religionEinwilligungAm).toBeInstanceOf(Date)
  })
})

describe('Kopplung DTOs', () => {
  it('rejects a client-chosen personBUserId — a real partner links only via einladungsCode', async () => {
    expect(await validationErrors(SetKopplungDto, { veranlagungsart: 'zusammen', personBUserId: 'victim' })).toContain(
      'personBUserId',
    )
  })

  it("validates Person B's Steuer-ID and religion key like the own Stammdaten", async () => {
    expect(await validationErrors(KopplungPersonBDto, { steuerId: '123' })).toContain('steuerId')
    expect(await validationErrors(KopplungPersonBDto, { religion: 'xyz' })).toContain('religion')
    expect(await validationErrors(KopplungPersonBDto, { steuerId: null, religion: 'EV', religionEinwilligung: true })).toEqual([])
  })
})
