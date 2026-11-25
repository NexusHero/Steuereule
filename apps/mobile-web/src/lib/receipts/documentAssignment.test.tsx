import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@steuereule/api-client'
import { createHolderFromDocument, detailsComplete, detailsFromDocument, holderTestId, takeNameIntoProfile } from './documentAssignment'

const noLink = () => Promise.reject(new ApiError(404, {}))
const rejects = (status: number) => vi.fn(async () => Promise.reject(new ApiError(status, {})))

const details = { firstName: 'Nora', lastName: 'Sommer', birthDate: '1989-11-30', taxId: '31 000 007 919' }

describe('creating the holder of a document (ADR-0092 §3)', () => {
  it('sets up the joint return and Person B with the document’s details', async () => {
    const getLink = vi.fn(async () => ({ status: 200, data: { filingType: 'einzel' } }) as never)
    const setLink = vi.fn(async () => ({ status: 200 }) as never)
    const updatePersonB = vi.fn(async () => ({ status: 200 }) as never)
    expect(await createHolderFromDocument(2025, 'B', details, { getLink, setLink, updatePersonB })).toBe('B')
    expect(setLink).toHaveBeenCalledWith(2025, { filingType: 'zusammen' })
    expect(updatePersonB).toHaveBeenCalledWith(2025, { firstName: 'Nora', lastName: 'Sommer', geburtsdatum: '1989-11-30', steuerId: '31000007919' })
  })

  it('creates a child and answers with its reference', async () => {
    const createChild = vi.fn(async () => ({ status: 201, data: { kinder: [{ id: 'k1', firstName: 'Lio', geburtsdatum: '2019-04-03' }] } }) as never)
    expect(await createHolderFromDocument(2025, 'kind', { firstName: 'Lio', lastName: 'Sommer', birthDate: '2019-04-03', taxId: '' }, { createChild })).toBe('kind:k1')
  })

  it('answers null when a step fails', async () => {
    expect(await createHolderFromDocument(2025, 'B', details, { getLink: noLink, setLink: rejects(400) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'B', details, { getLink: noLink, setLink: vi.fn(async () => ({ status: 200 }) as never), updatePersonB: rejects(403) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'kind', details, { createChild: rejects(400) })).toBeNull()
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
  it('writes only the name, so the Steuer-ID already there stays (absent keeps, WEB-28)', async () => {
    const put = vi.fn(async () => ({ status: 200 }) as never)
    const get = vi.fn(async () => ({ status: 200, data: { firstName: '', steuerId: '31000000000' } }) as never)
    expect(await takeNameIntoProfile(details, { get, put })).toBe('taken')
    expect(put).toHaveBeenCalledWith({ firstName: 'Nora', lastName: 'Sommer' })
  })

  it('never overwrites a name, and needs both names', async () => {
    const put = vi.fn()
    expect(await takeNameIntoProfile(details, { get: vi.fn(async () => ({ status: 200, data: { firstName: 'Elias' } }) as never), put })).toBe('kept')
    expect(await takeNameIntoProfile({ firstName: 'Nora', lastName: '' }, { put })).toBe('kept')
    expect(await takeNameIntoProfile(details, { get: vi.fn(async () => Promise.reject(new Error('x'))), put })).toBe('failed')
    expect(put).not.toHaveBeenCalled()
  })
})

describe('more of the holder and profile rules (ADR-0092 §3, N1)', () => {
  it('leaves a missing birth date and Steuer-ID out of Person B’s data', async () => {
    const setLink = vi.fn(async () => ({ status: 200 }) as never)
    const updatePersonB = vi.fn(async () => ({ status: 200 }) as never)
    await createHolderFromDocument(2025, 'B', { firstName: ' Nora ', lastName: ' Sommer ', birthDate: '', taxId: '' }, { getLink: noLink, setLink, updatePersonB })
    expect(updatePersonB).toHaveBeenCalledWith(2025, { firstName: 'Nora', lastName: 'Sommer' })
  })

  it('sends a child’s Steuer-ID without blanks, and picks the latest child of the same name and birth date', async () => {
    const createChild = vi.fn(async () => ({ status: 201, data: { kinder: [{ id: 'k1', firstName: 'Lio', geburtsdatum: '2019-04-03' }, { id: 'k2', firstName: 'Lio', geburtsdatum: '2019-04-03' }] } }) as never)
    expect(await createHolderFromDocument(2025, 'kind', { firstName: 'Lio', lastName: 'S', birthDate: '2019-04-03', taxId: '12 345' }, { createChild })).toBe('kind:k2')
    expect(createChild).toHaveBeenCalledWith(2025, expect.objectContaining({ taxId: '12345' }))
  })

  it('finds no child when the answer carries no list', async () => {
    const createChild = vi.fn(async () => ({ status: 201, data: {} }) as never)
    expect(await createHolderFromDocument(2025, 'kind', details, { createChild })).toBeNull()
  })

  it('does not take a name that is incomplete, nor overwrite a profile that has one', async () => {
    const put = vi.fn(async () => ({ status: 200 }) as never)
    const get = vi.fn(async () => ({ status: 200, data: { firstName: 'Nora' } }) as never)
    expect(await takeNameIntoProfile({ firstName: '', lastName: 'S' }, { get, put })).toBe('kept')
    expect(await takeNameIntoProfile(details, { get, put })).toBe('kept')
    expect(put).not.toHaveBeenCalled()
  })

  it.each([500, 429, 404])('WEB-32 / NR-02: a profile load answered %i writes nothing — the stored name and identifiers stay', async (status) => {
    const put = vi.fn(async () => ({ status: 200 }) as never)
    expect(await takeNameIntoProfile(details, { get: rejects(status), put })).toBe('failed')
    expect(put).not.toHaveBeenCalled()
  })

  it('answers "failed" when the profile cannot be written or read', async () => {
    const get = vi.fn(async () => ({ status: 200, data: { firstName: '' } }) as never)
    expect(await takeNameIntoProfile(details, { get, put: rejects(500) })).toBe('failed')
    expect(await takeNameIntoProfile(details, { get: vi.fn(async () => Promise.reject(new Error('x'))) })).toBe('failed')
  })
})

describe('NR-10: a failed Person B undoes the switch to the joint return', () => {
  it('switches back to „einzel“ when Person B cannot be saved', async () => {
    const setLink = vi.fn(async () => ({ status: 200 }) as never)
    expect(await createHolderFromDocument(2025, 'B', details, { getLink: noLink, setLink, updatePersonB: rejects(500) })).toBeNull()
    expect(setLink.mock.calls).toEqual([[2025, { filingType: 'zusammen' }], [2025, { filingType: 'einzel' }]])
  })

  it('leaves a year that already was joint alone, and does not guess when the link cannot be read', async () => {
    const setLink = vi.fn(async () => ({ status: 200 }) as never)
    const joint = vi.fn(async () => ({ status: 200, data: { filingType: 'zusammen' } }) as never)
    expect(await createHolderFromDocument(2025, 'B', details, { getLink: joint, setLink, updatePersonB: rejects(500) })).toBeNull()
    expect(await createHolderFromDocument(2025, 'B', details, { getLink: rejects(500), setLink, updatePersonB: vi.fn() })).toBeNull()
    expect(setLink).not.toHaveBeenCalled()
  })
})
