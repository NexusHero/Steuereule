import { describe, expect, it } from 'vitest'
import { draftRecordRegistry } from '../src/advisor/advisor-draft-records.js'
import { ChildDraftRecords } from '../src/children/child-draft-records.js'
import { RentalDraftRecords } from '../src/rental/rental-draft-records.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const USER = 'user-draft-records'
const YEAR = 2025

function registryOnFakes() {
  const childRepo = new FakeChildRepository()
  const rentalRepo = new FakeRentalRepository()
  return { childRepo, rentalRepo, records: draftRecordRegistry([new ChildDraftRecords(childRepo), new RentalDraftRecords(rentalRepo)]) }
}

describe('the rows a draft may prepare as new (ADR-0091)', () => {
  it('creates a child from the draft’s values and answers its id', async () => {
    const { childRepo, records } = registryOnFakes()
    const id = await records.create(USER, YEAR, 'kind', { firstName: 'Mila', geburtsdatum: '2021-03-09' })
    const children = await childRepo.listForUserAndYear(USER, YEAR)
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({ id, firstName: 'Mila', lastName: '', geburtsdatum: '2021-03-09' })
  })

  it('removes a child again on undo', async () => {
    const { childRepo, records } = registryOnFakes()
    const id = await records.create(USER, YEAR, 'kind', { firstName: 'Mila' })
    await records.remove(USER, YEAR, 'kind', id!)
    expect(await childRepo.listForUserAndYear(USER, YEAR)).toEqual([])
  })

  it('creates a rental object and keeps it on undo', async () => {
    const { rentalRepo, records } = registryOnFakes()
    const id = await records.create(USER, YEAR, 'vermietung', {})
    expect((await rentalRepo.listForUserAndYear(USER, YEAR)).map((rental) => rental.id)).toEqual([id])
    await records.remove(USER, YEAR, 'vermietung', id!)
    expect(await rentalRepo.listForUserAndYear(USER, YEAR)).toHaveLength(1)
  })

  it('answers null for a mask that has no rows, and removes nothing there', async () => {
    const { records } = registryOnFakes()
    expect(await records.create(USER, YEAR, 'commute', {})).toBeNull()
    await expect(records.remove(USER, YEAR, 'commute', 'any')).resolves.toBeUndefined()
  })

  it('refuses two sources for one mask', () => {
    const childRepo = new FakeChildRepository()
    expect(() => draftRecordRegistry([new ChildDraftRecords(childRepo), new ChildDraftRecords(childRepo)])).toThrow(/kind/)
  })
})
