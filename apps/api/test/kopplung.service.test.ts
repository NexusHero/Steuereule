import { describe, expect, it } from 'vitest'
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

describe('KopplungService', () => {
  it('manages Zusammenveranlagung and Person B updates', async () => {
    const kopplungRepo = new FakeKopplungRepository()
    const profileRepo = new FakeProfileRepository()
    const stammdatenRepo = new FakeStammdatenRepository()
    const audit = new FakeAuditService()

    const service = new KopplungService(kopplungRepo, profileRepo, stammdatenRepo, audit as any)

    const userId = 'user-a'
    const jahr = 2025

    // Initially none
    const initial = await service.get(userId, jahr)
    expect(initial.veranlagungsart).toBe('keine')

    // Set to zusammen
    const setRes = await service.set(userId, jahr, { veranlagungsart: 'zusammen' })
    expect(setRes.veranlagungsart).toBe('zusammen')
    expect(setRes.personBUserId).toBeDefined()
    expect(setRes.einladungsCode).toBeDefined()

    // Update Person B
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

    // Set to einzel
    const einzelRes = await service.set(userId, jahr, { veranlagungsart: 'einzel' })
    expect(einzelRes.veranlagungsart).toBe('einzel')
    expect(einzelRes.personB).toBeNull()
  })

  it('allows spouse to join with einladungsCode', async () => {
    const kopplungRepo = new FakeKopplungRepository()
    const profileRepo = new FakeProfileRepository()
    const stammdatenRepo = new FakeStammdatenRepository()
    const audit = new FakeAuditService()

    const service = new KopplungService(kopplungRepo, profileRepo, stammdatenRepo, audit as any)

    const personA = 'user-a'
    const personB = 'user-b'
    const jahr = 2025

    const { einladungsCode } = await service.set(personA, jahr, { veranlagungsart: 'zusammen' })
    expect(einladungsCode).toBeDefined()

    // Person B joins
    const joined = await service.joinWithCode(personB, jahr, einladungsCode!)
    expect(joined.veranlagungsart).toBe('zusammen')
    expect(joined.personBUserId).toBe(personB)
  })
})
