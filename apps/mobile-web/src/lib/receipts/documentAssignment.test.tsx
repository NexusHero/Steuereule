import { describe, expect, it, vi } from 'vitest'
import { createHolderFromDocument, detailsComplete, detailsFromDocument, holderTestId, takeNameIntoProfile } from './documentAssignment'

const details = { firstName: 'Nora', lastName: 'Sommer', birthDate: '1989-11-30', taxId: '31 000 007 919' }

describe('creating the holder of a document (ADR-0092 §3)', () => {
  it('sets up the joint return and Person B with the document’s details', async () => {
    const setLink = vi.fn(async () => ({ status: 200 }) as never)
    const updatePersonB = vi.fn(async () => ({ status: 200 }) as never)
    expect(await createHolderFromDocument(2025, 'B', details, { setLink, updatePersonB })).toBe('B')
    expect(setLink).toHaveBeenCalledWith(2025, { filingType: 'zusammen' })
    expect(updatePersonB).toHaveBeenCalledWith(2025, { firstName: 'Nora', lastName: 'Sommer', geburtsdatum: '1989-11-30', steuerId: '31000007919' })
  })

  it('creates a child and answers with its reference', async () => {
    const createChild = vi.fn(async () => ({ status: 201, data: { kinder: [{ id: 'k1', firstName: 'Lio', geburtsdatum: '2019-04-03' }] } }) as never)
    expect(await createHolderFromDocument(2025, 'kind', { firstName: 'Lio', lastName: 'Sommer', birthDate: '2019-04-03', taxId: '' }, { createChild })).toBe('kind:k1')
  })

  it('answers null when a step fails', async () => {
    expect(await createHolderFromDocument(2025, 'B', details, { setLink: vi.fn(async () => ({ status: 400 }) as never) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'B', details, { setLink: vi.fn(async () => ({ status: 200 }) as never), updatePersonB: vi.fn(async () => ({ status: 403 }) as never) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'kind', details, { createChild: vi.fn(async () => ({ status: 400 }) as never) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'kind', details, { createChild: vi.fn(async () => ({ status: 201, data: { kinder: [] } }) as never) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'kind', details, { createChild: vi.fn(async () => Promise.reject(new Error('offline'))) })).toBeNull()
  })

  it('needs names and a birth date', () => {
    expect(detailsComplete(details)).toBe(true)
    expect(detailsComplete({ ...details, birthDate: '' })).toBe(false)
    expect(detailsFromDocument({ firstName: null, lastName: 'X', birthDate: null, taxId: null })).toEqual({ firstName: '', lastName: 'X', birthDate: '', taxId: '' })
    expect(holderTestId('kind:abc')).toBe('kind-abc')
  })
})

describe('„Bist du …?“ — the name into the empty profile (N1)', () => {
  it('writes the name and keeps a Steuer-ID already there', async () => {
    const put = vi.fn(async () => ({ status: 200 }) as never)
    const get = vi.fn(async () => ({ status: 200, data: { firstName: '', steuerId: '31000000000' } }) as never)
    expect(await takeNameIntoProfile(details, { get, put })).toBe(true)
    expect(put).toHaveBeenCalledWith({ firstName: 'Nora', lastName: 'Sommer', steuerId: '31000000000' })
  })

  it('never overwrites a name, and needs both names', async () => {
    const put = vi.fn()
    expect(await takeNameIntoProfile(details, { get: vi.fn(async () => ({ status: 200, data: { firstName: 'Elias' } }) as never), put })).toBe(false)
    expect(await takeNameIntoProfile({ firstName: 'Nora', lastName: '' }, { put })).toBe(false)
    expect(await takeNameIntoProfile(details, { get: vi.fn(async () => Promise.reject(new Error('x'))), put })).toBe(false)
    expect(put).not.toHaveBeenCalled()
  })
})
