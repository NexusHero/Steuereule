import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { ProfileService } from '../src/profile/profile.service.js'
import type { PutProfileDto } from '../src/profile/dto/put-profile.dto.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'

function validPayload(overrides: Partial<PutProfileDto> = {}): PutProfileDto {
  return {
    firstName: 'Anna',
    lastName: 'Beispiel',
    steuerId: '02476291358',
    steuernummer: '18181508155',
    ...overrides,
  }
}

describe('ProfileService', () => {
  let repository: FakeProfileRepository
  let auditRepository: FakeAuditRepository
  let service: ProfileService

  beforeEach(() => {
    repository = new FakeProfileRepository()
    auditRepository = new FakeAuditRepository()
    service = new ProfileService(repository, new AuditService(auditRepository))
  })

  it('returns an all-null default profile for a userId with nothing saved', async () => {
    await expect(service.getProfile('never-saved')).resolves.toEqual({
      firstName: null,
      lastName: null,
      steuerId: null,
      steuernummer: null,
    })
  })

  it('read-your-writes: GET after PUT returns exactly what was saved', async () => {
    await service.saveProfile('user-a', validPayload())
    await expect(service.getProfile('user-a')).resolves.toEqual({
      firstName: 'Anna',
      lastName: 'Beispiel',
      steuerId: '02476291358',
      steuernummer: '18181508155',
    })
  })

  it('trims leading/trailing whitespace from name fields before persisting', async () => {
    await service.saveProfile('user-a', validPayload({ firstName: '  Anna  ', lastName: '  Beispiel  ' }))
    const saved = await service.getProfile('user-a')
    expect(saved.firstName).toBe('Anna')
    expect(saved.lastName).toBe('Beispiel')
  })

  it('stores a missing steuernummer as null, not undefined/empty-string', async () => {
    const { steuernummer: _omitted, ...payloadWithoutSteuernummer } = validPayload()
    await service.saveProfile('user-a', payloadWithoutSteuernummer)
    await expect(service.getProfile('user-a')).resolves.toEqual(
      expect.objectContaining({ steuernummer: null }),
    )
  })

  it('PUT is idempotent — saving the same payload twice yields the same stored state', async () => {
    await service.saveProfile('user-a', validPayload())
    const second = await service.saveProfile('user-a', validPayload())
    expect(second).toEqual(await service.getProfile('user-a'))
    expect(repository.userCount()).toBe(1)
  })

  it('a later PUT overwrites the earlier saved profile for the same userId', async () => {
    await service.saveProfile('user-a', validPayload({ firstName: 'Anna' }))
    await service.saveProfile('user-a', validPayload({ firstName: 'Anna-Updated' }))
    await expect(service.getProfile('user-a')).resolves.toEqual(
      expect.objectContaining({ firstName: 'Anna-Updated' }),
    )
  })

  it('never leaks one userId’s profile into another’s read (strict scoping)', async () => {
    await service.saveProfile('user-a', validPayload({ firstName: 'Anna' }))

    await expect(service.getProfile('user-b')).resolves.toEqual({
      firstName: null,
      lastName: null,
      steuerId: null,
      steuernummer: null,
    })
  })

  it('a PUT for one userId never overwrites another userId’s saved profile', async () => {
    await service.saveProfile('user-a', validPayload({ firstName: 'Anna' }))
    await service.saveProfile('user-b', validPayload({ firstName: 'Jonas' }))

    await expect(service.getProfile('user-a')).resolves.toEqual(
      expect.objectContaining({ firstName: 'Anna' }),
    )
    await expect(service.getProfile('user-b')).resolves.toEqual(
      expect.objectContaining({ firstName: 'Jonas' }),
    )
    expect(repository.userCount()).toBe(2)
  })
})
